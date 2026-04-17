// ============================================================================
// GET /api/exams - 시험지 목록 조회
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Next.js 14 Data Cache 비활성화 — supabaseAdmin 내부 fetch가 캐싱되는 문제 방지
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // ★ 시험지 목록 조회 (exam_problems 관계형 조인은 supabaseAdmin에서 0건 반환 이슈로 제거)
    const { data: exams, error: examsError } = await supabaseAdmin
      .from('exams')
      .select('id, title, description, status, total_points, created_at, book_group_id, subject, exam_type, grade')
      .order('created_at', { ascending: false })
      .limit(200);

    if (examsError) {
      console.error('[API/exams] List error:', examsError.message);
      return NextResponse.json(
        { error: 'Failed to fetch exams', detail: examsError.message },
        { status: 500 }
      );
    }

    // ★ 문제 수를 별도 쿼리로 가져오기 (exam_problems 테이블에서 그룹별 count)
    const examIds = (exams || []).map((e: any) => e.id);
    const problemCountMap = new Map<string, number>();

    if (examIds.length > 0) {
      try {
        const { data: counts } = await supabaseAdmin
          .from('exam_problems')
          .select('exam_id')
          .in('exam_id', examIds);

        if (counts) {
          for (const row of counts) {
            problemCountMap.set(row.exam_id, (problemCountMap.get(row.exam_id) || 0) + 1);
          }
        }
      } catch {
        // exam_problems 테이블 접근 실패 시 무시 (문제 수 0으로 표시)
        console.warn('[API/exams] exam_problems count 조회 실패');
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

    // 보정 필요한 시험지 수집 (book_group_id 없거나 subject/exam_type/grade 없는 것만)
    // ★ 이미 book_group_id가 설정된 경우는 사용자 선택 존중 — 재분류 안 함
    const examsNeedFix = (exams || []).filter((e: any) =>
      e.title && (!e.book_group_id || !e.subject || !e.exam_type || !e.grade)
    );

    if (examsNeedFix.length > 0) {
      // book_groups 조회 (1회)
      const { data: allGroups } = await supabaseAdmin
        .from('book_groups')
        .select('id, name');
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
        // exam_type 보정
        if (!exam.exam_type) {
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
        hasImage,
        school: schoolMatch?.[1] || '',
        year: yearMatch?.[1] || '',
        bookGroupId: exam.book_group_id || null,
        subject: exam.subject || '공통수학1',
        examType: exam.exam_type || '학교기출',
        grade: exam.grade || '고1',
        createdAt: exam.created_at,
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
