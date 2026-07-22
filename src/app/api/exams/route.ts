// ============================================================================
// GET /api/exams - 시험지 목록 조회
// supabaseAdmin으로 RLS 바이패스 + institute-guard 격리
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, applyTrackFilter } from '@/lib/security/institute-guard';
import { buildPreviewText } from '@/lib/exams/preview-text';

// Next.js 14 Data Cache 비활성화 — supabaseAdmin 내부 fetch가 캐싱되는 문제 방지
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // ★ 진단지 필터 (학원자료 페이지 진단평가 카테고리에서 사용)
    const { searchParams } = new URL(request.url);
    const isDiagnosticParam = searchParams.get('is_diagnostic');
    const diagnosticCategory = searchParams.get('diagnostic_category');
    // ★ 과목 필터 — CloudListClient 에서 과목 전환 시 서버 단 필터 (전체 재로드 후 클라 필터 회피).
    //   book_groups 와 동일한 패턴: .eq('subject', value). '전체' 등 빈값이면 무필터.
    const subjectParam = searchParams.get('subject');

    // ★ 시험지 목록 조회 (institute-guard 격리). super_admin 은 전체, ORG_ADMIN 은 산하, 일반 user 는 자기 institute.
    let examsBaseQuery = supabaseAdmin
      .from('exams')
      .select('id, title, description, status, total_points, created_at, book_group_id, subject, exam_type, grade, is_diagnostic, diagnostic_category, diagnostic_round, diagnostic_difficulty, school_name, district, semester, exam_year, exam_round, chapter')
      .order('created_at', { ascending: false })
      .limit(200);

    if (isDiagnosticParam === 'true' || isDiagnosticParam === '1') {
      examsBaseQuery = examsBaseQuery.eq('is_diagnostic', true);
    }
    if (diagnosticCategory) {
      examsBaseQuery = examsBaseQuery.eq('diagnostic_category', diagnosticCategory);
    }
    if (subjectParam) {
      examsBaseQuery = examsBaseQuery.eq('subject', subjectParam);
    }

    // ★ 격리 필터 + 트랙 필터 (flag false 시 트랙 필터는 no-op, 기존 동작 그대로)
    //   allowCommonPool: true — exams 도 공통풀(institute_id NULL) 자료는 모든 학원 공유.
    //   사용자 보고 (2026-05-16): "엄궁차수학에서 다른 공통자산이 안보인다" —
    //   PR #164 isolated_assets=true 적용 후 격리 학원에서 NULL 공통풀이 차단된 사고.
    //   problems / book_groups 와 동일한 공통풀 정책 적용.
    const filteredQuery = applyInstituteFilter(examsBaseQuery, scope, { allowCommonPool: true });
    const trackFilteredQuery = applyTrackFilter(filteredQuery, scope);
    const { data: exams, error: examsError } = await trackFilteredQuery;

    if (examsError) {
      console.error('[API/exams] List error:', examsError.message);
      return NextResponse.json(
        { error: 'Failed to fetch exams' },
        { status: 500 }
      );
    }

    // ★ 문제 수를 별도 쿼리로 가져오기 (exam_problems 테이블에서 그룹별 count)
    const examIds = (exams || []).map((e: any) => e.id);
    const problemCountMap = new Map<string, number>();

    if (examIds.length > 0) {
      try {
        // ★ Supabase .select() 기본 limit 1000 초과 시 마지막 row 들이 잘려서
        //   일부 exam 의 problemCount=0 으로 표시되던 사고 (동백중 2-1 22건이 보이지 않던 케이스).
        //   exam_problems 가 1000+ rows 인 운영 환경에선 페이지네이션 필수.
        const PAGE = 1000;
        let from = 0;
        for (;;) {
          const { data: counts, error } = await supabaseAdmin
            .from('exam_problems')
            .select('exam_id, problem_id')
            .in('exam_id', examIds)
            .range(from, from + PAGE - 1);
          if (error) { console.warn('[API/exams] count page error:', error.message); break; }
          if (!counts || counts.length === 0) break;
          for (const row of counts) {
            problemCountMap.set(row.exam_id, (problemCountMap.get(row.exam_id) || 0) + 1);
          }
          if (counts.length < PAGE) break;
          from += PAGE;
        }
      } catch {
        // exam_problems 테이블 접근 실패 시 무시 (문제 수 0으로 표시)
        console.warn('[API/exams] exam_problems count 조회 실패');
      }
    }

    // ★ 난이도 분포 카드 바 (하 1~3 / 중 4~6 / 상 7~10) — DB 집계 RPC 한 번으로.
    //   기존엔 classifications 전체(약 5천행)를 매 로드마다 페이지네이션 스캔 + JS 집계 →
    //   문제 수 증가에 따라 전체 페이지 로딩이 느려지던 병목(2026-06-27). problem_id 인덱스
    //   조인으로 DB 가 집계 → exam 당 1행만 반환(왕복 1회, 전송량 대폭 감소).
    const difficultyMap = new Map<string, { low: number; mid: number; high: number; total: number }>();
    if (examIds.length > 0) {
      try {
        const { data: dist, error } = await supabaseAdmin
          .rpc('exam_difficulty_distribution', { p_exam_ids: examIds });
        if (error) {
          console.warn('[API/exams] difficulty RPC 실패:', error.message);
        } else {
          for (const r of (dist || []) as Array<{ exam_id: string; low: number; mid: number; high: number; total: number }>) {
            if (r.total > 0) difficultyMap.set(r.exam_id, { low: r.low, mid: r.mid, high: r.high, total: r.total });
          }
        }
      } catch {
        console.warn('[API/exams] difficulty 집계 실패');
      }
    }

    // ★ 카드 액자 미리보기 — 1번 문제 본문 첫 토막 (2026-07-23).
    //   목록 카드의 액자가 회색 문서 아이콘(플레이스홀더)이라 가장 눈에 띄는 자리가
    //   비어 있었다. 운영 195건 전부 sequence_number=1 본문이 있어(실측 100%) 그걸 쓴다.
    //   ★ sequence_number=1 만 조회하므로 exam 당 1행 — .select() 1000행 한계
    //     (동백중 problemCount=0 사고, 위 문제수 집계 주석 참조)에 걸리지 않는다.
    //     이미지가 아니라 텍스트라 전송량·로딩 부담도 없다.
    const previewMap = new Map<string, string>();
    if (examIds.length > 0) {
      try {
        const { data: firstRows } = await supabaseAdmin
          .from('exam_problems')
          .select('exam_id, problem_id')
          .in('exam_id', examIds)
          .eq('sequence_number', 1);

        const problemIds = (firstRows || []).map((r) => r.problem_id).filter(Boolean);
        if (problemIds.length > 0) {
          const { data: firstProblems } = await supabaseAdmin
            .from('problems')
            .select('id, content_latex')
            .in('id', problemIds)
            .is('deleted_at', null);

          const textById = new Map<string, string>();
          for (const p of firstProblems || []) {
            textById.set(p.id, p.content_latex || '');
          }
          for (const r of firstRows || []) {
            const preview = buildPreviewText(textById.get(r.problem_id));
            if (preview) previewMap.set(r.exam_id, preview);
          }
        }
      } catch {
        // 미리보기는 부가 정보 — 실패해도 목록은 그대로 나간다(기존 모티브로 폴백)
        console.warn('[API/exams] 미리보기 텍스트 조회 실패');
      }
    }

    // ★ 기존 시험지 자동 보정: subject/exam_type/grade/book_group_id 백필
    // title에서 과목 감지 함수
    const detectSubjectFromTitle = (t: string) => {
      if (/공통과학1/.test(t)) return '공통과학1';
      if (/공통과학2/.test(t)) return '공통과학2';
      if (/물리/.test(t)) return '물리학1';
      if (/화학/.test(t)) return '화학1';
      if (/생명|생물/.test(t)) return '생명과학1';
      if (/지구/.test(t)) return '지구과학1';
      if (/과학/.test(t)) return '공통과학1';
      // ★ 수학(상)/수학(하) — 2015 개정 (공통수학1/2와 별개)
      if (/수학\s*\(\s*상\s*\)|수[학]?\s*상(?![수학각대])/.test(t)) return '수학(상)';
      if (/수학\s*\(\s*하\s*\)|수[학]?\s*하(?![수학다대])/.test(t)) return '수학(하)';
      if (/공통수학1/.test(t)) return '공통수학1';
      if (/공통수학2/.test(t)) return '공통수학2';
      if (/미적분/.test(t)) return '미적분';
      if (/확률과통계|확통/.test(t)) return '확률과통계';
      if (/기하/.test(t)) return '기하';
      // ★ 중학교 학년 — "중1", "중 1-1", "중1-1", "XX중 3-1", "XX중3-1" 모두 매칭
      if (/중\s*1(?:[- ]|\s|$)/.test(t) || /\b1-[12]\b/.test(t) && /중/.test(t)) return '중1';
      if (/중\s*2(?:[- ]|\s|$)/.test(t) || /\b2-[12]\b/.test(t) && /중/.test(t)) return '중2';
      if (/중\s*3(?:[- ]|\s|$)/.test(t) || /\b3-[12]\b/.test(t) && /중/.test(t)) return '중3';
      if (/수[학]?2/.test(t)) return '수학2';
      if (/수[학]?1/.test(t)) return '수학1';
      return '공통수학1';
    };
    const detectExamTypeFromTitle = (t: string) => /모의고사|모의|평가원/.test(t) ? '모의고사' : '학교기출';
    const detectGradeFromTitle = (t: string) => {
      // ★ 중학교 학년 — 학교명 뒤 "X-1" 학기 패턴도 포함
      if (/중\s*1(?:[- ]|\s|$)/.test(t) || (/중/.test(t) && /\b1-[12]\b/.test(t))) return '중1';
      if (/중\s*2(?:[- ]|\s|$)/.test(t) || (/중/.test(t) && /\b2-[12]\b/.test(t))) return '중2';
      if (/중\s*3(?:[- ]|\s|$)/.test(t) || (/중/.test(t) && /\b3-[12]\b/.test(t)) || /중등/.test(t)) return '중3';
      if (/고3|3학년/.test(t)) return '고3';
      if (/고2|2학년/.test(t)) return '고2';
      return '고1';
    };

    // 과목→폴더명 매핑
    const subjectFolderMap: Record<string, string> = {
      // ★ 2015 개정 (수학상/하) — 공통수학1/2와 별개
      '수학(상)': '수학(상) 기출', '수학(하)': '수학(하) 기출',
      // 2022 개정
      '공통수학1': '공통수학1 기출', '공통수학2': '공통수학2 기출',
      '수학I': '대수 기출', '수학1': '대수 기출', '대수': '대수 기출',
      '수학II': '미적분1 기출', '수학2': '미적분1 기출', '미적분1': '미적분1 기출',
      '미적분': '미적분1 기출', '미적분2': '미적분1 기출',
      '확률과통계': '확률과 통계 기출', '확률과 통계': '확률과 통계 기출',
      '기하': '기하 기출',
      '중1': '중1 기출', '중2': '중2 기출', '중3': '중3 기출',
    };

    // 보정 필요한 시험지 수집 (book_group_id 없거나 subject/grade 없는 것만)
    // ★ 이미 book_group_id가 설정된 경우는 사용자 선택 존중 — 재분류 안 함
    // ★ is_diagnostic=true 인 경우 exam_type 보정 제외 — 진단평가는 exam_type NULL 이 정상
    const examsNeedFix = (exams || []).filter((e: any) =>
      e.title && (!e.book_group_id || !e.subject || !e.grade ||
        (!e.is_diagnostic && !e.exam_type))
    );

    if (examsNeedFix.length > 0) {
      // book_groups 조회 (1회) — 자기 institute + 공통 풀(NULL)
      const groupsBase = supabaseAdmin
        .from('book_groups')
        .select('id, name');
      const { data: allGroups } = await applyInstituteFilter(groupsBase, scope, { allowCommonPool: true });
      const groupNameMap = new Map<string, string>();
      (allGroups || []).forEach((g: any) => groupNameMap.set(g.name, g.id));

      // ★ 인메모리 매핑 (응답에 즉시 반영) + DB 업데이트 수집
      const dbUpdates: { id: string; updates: Record<string, any>; title: string }[] = [];

      for (const exam of examsNeedFix) {
        const title = exam.title || '';
        const updates: Record<string, any> = {};

        // subject 보정
        if (!exam.subject) {
          const detected = detectSubjectFromTitle(title);
          exam.subject = detected;
          updates.subject = detected;
        }
        // exam_type 보정 — is_diagnostic=true 면 exam_type NULL 이 정상이므로 스킵
        if (!exam.exam_type && !exam.is_diagnostic) {
          const detected = detectExamTypeFromTitle(title);
          exam.exam_type = detected;
          updates.exam_type = detected;
        }
        // grade 보정
        if (!exam.grade) {
          const detected = detectGradeFromTitle(title);
          exam.grade = detected;
          updates.grade = detected;
        }
        // book_group_id 보정
        if (!exam.book_group_id) {
          const subj = exam.subject || '';
          let targetFolder = subjectFolderMap[subj];
          if (!targetFolder) {
            if (/중1/.test(subj)) targetFolder = '중1 기출';
            else if (/중2/.test(subj)) targetFolder = '중2 기출';
            else if (/중3/.test(subj)) targetFolder = '중3 기출';
          }
          const groupId = targetFolder ? groupNameMap.get(targetFolder) : undefined;
          if (groupId) {
            exam.book_group_id = groupId;
            updates.book_group_id = groupId;
          }
        }

        if (Object.keys(updates).length > 0) {
          dbUpdates.push({ id: exam.id, updates, title });
        }
      }

      // ★ DB 업데이트 (백그라운드)
      if (dbUpdates.length > 0) {
        console.log(`[API/exams] 자동 보정 대상: ${dbUpdates.length}개`);
        (async () => {
          for (const { id, updates, title } of dbUpdates) {
            try {
              await supabaseAdmin
                .from('exams')
                .update(updates)
                .eq('id', id);
              console.log(`[API/exams] 보정 완료: "${title}" → ${JSON.stringify(updates)}`);
            } catch (e) {
              console.warn(`[API/exams] 보정 실패: "${title}"`, e);
            }
          }
        })().catch(e => console.warn('[API/exams] 자동 보정 전체 실패:', e));
      }
    }

    // 데이터 변환
    const result = (exams || []).map((exam: any) => {
      // description에서 메타 정보 추출
      const desc = exam.description || '';
      const fileNameMatch = desc.match(/업로드.*?파일:\s*(.+?)(?:\s*\(|$)/);
      const fileName = fileNameMatch?.[1]?.trim() || '';

      // 파일명에서 학교명/연도/과목 추출
      const schoolMatch = fileName.match(/([가-힣]+(?:고등학교|고|중학교|중|대학교|대))/);
      const yearMatch = fileName.match(/(\d{4})/);
      const hasImage = desc.includes('이미지') || desc.includes('image');

      return {
        id: exam.id,
        title: exam.title,
        // ★ title 우선 (사용자가 파일명 수정 시 title이 변경됨)
        // description에서 추출한 fileName은 원본 업로드명이라 수정 반영 안 됨
        fileName: exam.title || fileName,
        status: exam.status,
        problemCount: problemCountMap.get(exam.id) || 0,
        difficulty: difficultyMap.get(exam.id) || null,
        previewText: previewMap.get(exam.id) || '',
        hasImage,
        school: schoolMatch?.[1] || '',
        year: yearMatch?.[1] || '',
        bookGroupId: exam.book_group_id || null,
        subject: exam.subject || '공통수학1',
        examType: exam.exam_type ?? (exam.is_diagnostic ? null : '학교기출'),
        grade: exam.grade || '고1',
        createdAt: exam.created_at,
        // ★ 진단지 메타 — 학원자료 페이지·진단 분석에서 사용
        isDiagnostic: !!exam.is_diagnostic,
        diagnosticCategory: exam.diagnostic_category || null,
        diagnosticRound: exam.diagnostic_round || null,
        diagnosticDifficulty: exam.diagnostic_difficulty || null,
      };
    });

    return NextResponse.json(
      { exams: result, total: result.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[API/exams] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
