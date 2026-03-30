// ============================================================================
// POST /api/exams/[examId]/auto-fix
// 시험지 내 문제들의 공통 오류를 자동 감지 + 수정
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 300; // 5분 타임아웃 (재분류 포함)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const CURRICULUM: Record<string, string> = {
  '중1': '1.자연수의성질 2.정수와유리수 3.일차방정식 4.좌표평면과그래프 5.기본도형 6.평면도형과입체도형 7.통계',
  '중2-1': '1.유리수와순환소수 2.식의계산(단항식·다항식) 3.부등식(일차부등식) 4.연립방정식 5.일차함수',
  '중2-2': '1.삼각형의성질 2.사각형의성질 3.도형의닮음 4.확률',
  '중3-1': '1.실수와그계산(제곱근,무리수) 2.다항식의곱셈과인수분해 3.이차방정식 4.이차함수',
  '중3-2': '1.삼각비 2.원의성질 3.통계',
  '고1': '1.다항식 2.방정식과부등식 3.도형의방정식 4.집합과명제 5.함수',
  '공통수학1': '1.다항식 2.방정식과부등식 3.도형의방정식 4.집합과명제 5.함수',
  '공통수학2': '1.경우의수 2.행렬 3.순열과조합 4.확률 5.통계',
};

// 중학교 이름 패턴 (학교명에 "중"이 들어가면 중학교)
const MIDDLE_SCHOOL_PATTERN = /[가-힣]{1,6}중(?:학교)?(?!\d)/;

interface FixResult {
  problemId: string;
  number: number;
  fixes: string[];
  errors: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    // 1. 시험지 정보 조회
    const { data: exam } = await supabaseAdmin
      .from('exams')
      .select('id, title, subject, grade')
      .eq('id', examId)
      .single();

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    }

    // 시험지 제목에서 학년/과목 추출 — 제목 기반 감지가 DB 값보다 더 정확할 수 있음
    const titleSubject = detectSubjectFromTitle(exam.title);
    const titleGrade = detectGradeFromTitle(exam.title);
    // 제목에서 감지된 값이 있으면 우선 사용 (DB 값이 '공통수학1' 기본값일 수 있으므로)
    const examSubject = titleSubject || exam.subject || '';
    const examGrade = titleGrade || exam.grade || '';

    console.log(`[auto-fix] exam="${exam.title}" → subject="${examSubject}", grade="${examGrade}"`);

    // 2. 시험지의 모든 문제 조회
    const { data: examProblems } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number');

    if (!examProblems || examProblems.length === 0) {
      return NextResponse.json({ message: '문제가 없습니다.', fixes: [] });
    }

    const problemIds = examProblems.map(ep => ep.problem_id);
    const seqMap = new Map(examProblems.map(ep => [ep.problem_id, ep.sequence_number]));

    const { data: problems } = await supabaseAdmin
      .from('problems')
      .select('id, source_number, content_latex, answer_json, ai_analysis, images, solution_latex')
      .in('id', problemIds);

    if (!problems) {
      return NextResponse.json({ message: '문제 조회 실패', fixes: [] });
    }

    // ★ 기존 classifications 일괄 조회
    const { data: allClassifications } = await supabaseAdmin
      .from('classifications')
      .select('id, problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
      .in('problem_id', problemIds);
    const classMap = new Map((allClassifications || []).map(c => [c.problem_id, c]));

    // 3. 각 문제별 자동 수정
    const results: FixResult[] = [];

    for (const problem of problems) {
      const seqNum = seqMap.get(problem.id) || 0;
      const result: FixResult = {
        problemId: problem.id,
        number: seqNum,
        fixes: [],
        errors: [],
      };

      const updates: Record<string, unknown> = {};
      const ai = { ...(problem.ai_analysis as Record<string, unknown> || {}) };
      let aiChanged = false;
      const content = problem.content_latex || '';
      const existingCls = classMap.get(problem.id);

      // ─── FIX 1: 분류 과목/학년 불일치 → GPT-4o로 강제 재분류 ───
      const currentSubject = (ai.subject as string) || '';
      const cls = (ai.classification as Record<string, unknown>) || {};
      const clsSubject = (cls.subject as string) || '';
      const clsChapter = (cls.chapter as string) || '';
      const clsTypeName = (cls.typeName as string) || '';
      const existingTypeCode = existingCls?.type_code || '';

      // 분류가 필요한 경우 판단
      const isMiddleSchoolExam = examGrade?.startsWith('중');
      const isWrongLevel = isMiddleSchoolExam && (
        /수학[12I]|미적|확률|기하|공통수학|대수|고등/.test(clsChapter) ||
        /수학[12I]|미적|확률|기하|공통수학|대수|고등/.test(clsSubject) ||
        /^MA-HS/.test(existingTypeCode) // classifications에 고등 코드가 있는 경우
      );
      const isHighSchoolExam = !isMiddleSchoolExam && examGrade?.startsWith('고');
      const isWrongLevelHS = isHighSchoolExam && /^MA-MS/.test(existingTypeCode);

      const needsReclassify = examSubject && (
        !matchesSubject(currentSubject, examSubject) ||
        !matchesSubject(clsSubject, examSubject) ||
        isWrongLevel ||
        isWrongLevelHS ||
        !clsChapter || // chapter가 비어있으면 재분류
        !clsTypeName   // typeName이 비어있으면 재분류
      );

      if (needsReclassify && OPENAI_API_KEY && content.trim()) {
        // GPT-4o로 정확한 과목/단원 재분류
        const gradeKey = examGrade === '중2' ? '중2-1' : examGrade === '중3' ? '중3-1' : examGrade;
        const curriculum = CURRICULUM[gradeKey] ||
          CURRICULUM[examSubject.replace(' 수학', '').replace('수학', '')] ||
          CURRICULUM[examSubject] || '';

        try {
          const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: `한국 ${examSubject} 전문가. JSON만 응답.` },
                { role: 'user', content: `이 문제는 ${examSubject}입니다.\n단원: ${curriculum}\n난이도 1~5\nJSON: {"classification":{"typeName":"유형명","subject":"${examSubject}","chapter":"대단원","section":"중단원","difficulty":3,"cognitiveDomain":"CALCULATION","confidence":0.9}}\n\n문제:\n${content.slice(0, 1500)}` }
              ],
              temperature: 0.1, max_tokens: 500, response_format: { type: 'json_object' }
            })
          });

          if (gptRes.ok) {
            const gptData = await gptRes.json();
            const reclassified = JSON.parse(gptData.choices?.[0]?.message?.content || '{}');
            const newCls = reclassified.classification || {};

            // ★ ai_analysis 업데이트
            ai.classification = { ...cls, ...newCls, subject: examSubject };
            ai.subject = examSubject;
            ai.unit = newCls.chapter || '';
            ai.difficulty = newCls.difficulty || 3;
            ai.cognitiveDomain = newCls.cognitiveDomain || 'CALCULATION';
            ai.autoFixedSubject = true;
            ai.autoReclassified = true;
            ai.reanalyzedAt = new Date().toISOString();
            aiChanged = true;

            // ★ classifications 테이블도 함께 업데이트 (FIX 7에서 중복 처리 방지)
            const classUpdateData: Record<string, unknown> = {
              difficulty: String(newCls.difficulty || 3),
              cognitive_domain: newCls.cognitiveDomain || 'CALCULATION',
              ai_confidence: newCls.confidence || 0.8,
              is_verified: false,
            };

            // type_code가 잘못된 경우만 갱신 (기존 유효한 코드는 유지)
            if (isWrongLevel || isWrongLevelHS || !existingTypeCode) {
              // 중등/고등 레벨이 맞지 않거나 비어있을 때만 type_code 변경
              classUpdateData.type_code = newCls.typeCode || existingTypeCode || '';
            }

            if (existingCls) {
              await supabaseAdmin
                .from('classifications')
                .update(classUpdateData)
                .eq('id', existingCls.id);
            } else {
              // ★ 분류 행이 없으면 INSERT
              await supabaseAdmin
                .from('classifications')
                .insert({
                  problem_id: problem.id,
                  type_code: newCls.typeCode || '',
                  difficulty: String(newCls.difficulty || 3),
                  cognitive_domain: newCls.cognitiveDomain || 'CALCULATION',
                  ai_confidence: newCls.confidence || 0.8,
                  is_verified: false,
                });
            }

            result.fixes.push(`재분류: ${newCls.chapter || '?'} > ${newCls.typeName || '?'} (diff:${newCls.difficulty})`);
          }
        } catch (e) {
          // GPT 실패 시 과목만 변경
          ai.subject = examSubject;
          ai.autoFixedSubject = true;
          aiChanged = true;
          result.fixes.push(`과목: "${currentSubject}" → "${examSubject}" (재분류 실패)`);

          // classifications 테이블에도 최소한 difficulty/cognitive_domain 업데이트
          if (existingCls) {
            await supabaseAdmin
              .from('classifications')
              .update({
                difficulty: String(ai.difficulty || 3),
                cognitive_domain: (ai.cognitiveDomain as string) || 'CALCULATION',
              })
              .eq('id', existingCls.id);
          } else {
            await supabaseAdmin
              .from('classifications')
              .insert({
                problem_id: problem.id,
                type_code: '',
                difficulty: String(ai.difficulty || 3),
                cognitive_domain: (ai.cognitiveDomain as string) || 'CALCULATION',
                ai_confidence: 0.5,
                is_verified: false,
              });
          }
        }

        // rate limit 방지
        await new Promise(r => setTimeout(r, 500));
      } else if (examSubject && !matchesSubject(currentSubject, examSubject)) {
        ai.subject = examSubject;
        ai.autoFixedSubject = true;
        aiChanged = true;
        result.fixes.push(`과목: "${currentSubject}" → "${examSubject}"`);
      }

      // ─── FIX 2: 서술형 (1)(2)가 choices에 들어간 경우 복원 ───
      const answerJson = problem.answer_json as Record<string, unknown> || {};
      const choices = (answerJson.choices as string[]) || [];
      const subProblemKeywordsInContent = /\(\d+\)|풀이\s*과정|구하시오|서술하시오|완성하시오|답하시오|설명하시오|구하여라|쓰시오|보이시오|나타내시오/.test(content);

      if (choices.length > 0) {
        // 감지 조건 1: choices 중 (1)(2) 패턴이 있는 경우
        const subProblemChoices = choices.filter(c =>
          /^\s*\(\d+\)/.test(c) || /^\s*\(가\)|\(나\)|\(다\)/.test(c)
        );
        // 감지 조건 2: content에 서술형 키워드가 있고 + choices에 50자 이상 긴 텍스트가 있는 경우
        const hasLongChoice = choices.some(c => c.length > 50);
        // 감지 조건 3: choices 내용 자체에 서술형 키워드가 포함
        const choicesHaveSubKeyword = choices.some(c =>
          /구하시오|구하여라|서술하시오|설명하시오|완성하시오|답하시오|쓰시오|풀이\s*과정|보이시오|나타내시오|증명하시오|구하세요|구해\s*보시오/.test(c)
        );

        const shouldRestore =
          (subProblemChoices.length > 0 && subProblemChoices.length >= choices.length * 0.5) ||
          (subProblemKeywordsInContent && hasLongChoice) ||
          choicesHaveSubKeyword;

        if (shouldRestore) {
          // choices를 content 뒤에 붙이기
          const currentContent = (updates.content_latex as string) || content;
          const restoredContent = currentContent + '\n\n' + choices.join('\n');
          updates.content_latex = restoredContent;
          updates.answer_json = { ...answerJson, choices: [] };
          result.fixes.push(`서술형 소문제 ${choices.length}개를 choices에서 content로 복원`);
        }
      }

      // ─── FIX 3: content에서 문제 번호 중복 제거 ───
      const contentToFix = (updates.content_latex as string) || content;
      const numPrefix = new RegExp(`^${seqNum}\\.\\s*${seqNum}\\.`);
      if (numPrefix.test(contentToFix)) {
        updates.content_latex = contentToFix.replace(numPrefix, `${seqNum}.`);
        result.fixes.push('문제 번호 중복 제거');
      }

      // ─── FIX 4: [4.00점] 등 점수 표기 제거 (인쇄 시 불필요) ───
      const contentForPoints = (updates.content_latex as string) || content;
      const pointsMatch = contentForPoints.match(/\[\s*\d+\.?\d*\s*점\s*\]/);
      if (pointsMatch) {
        const pointsValue = pointsMatch[0].match(/(\d+\.?\d*)/)?.[1];
        if (pointsValue) {
          ai.points = parseFloat(pointsValue);
          aiChanged = true;
          updates.content_latex = contentForPoints.replace(/\[\s*\d+\.?\d*\s*점\s*\]\s*/g, '');
          result.fixes.push(`점수 [${pointsValue}점] 추출 및 content에서 제거`);
        }
      }

      // ─── FIX 5: figure_crop URL 프록시 변환 확인 ───
      const images = (problem.images as Array<{ url: string; type: string; label: string }>) || [];
      const brokenFigures = images.filter(img =>
        img.type === 'figure_crop' &&
        img.url.includes('/storage/v1/object/public/') &&
        !img.url.startsWith('/api/')
      );
      if (brokenFigures.length > 0) {
        result.fixes.push(`figure_crop ${brokenFigures.length}개 프록시 필요 (렌더링 시 자동 처리)`);
      }

      // ─── FIX 6: 빈 source_number 채우기 ───
      if (!problem.source_number && seqNum > 0) {
        updates.source_number = seqNum;
        result.fixes.push(`source_number: ${seqNum} 설정`);
      }

      // ─── FIX 7: classifications 테이블 동기화 (FIX 1에서 안 다뤄진 경우) ───
      // FIX 1에서 이미 처리된 경우 건너뛰기 (needsReclassify가 true였고 GPT 호출 성공한 경우)
      const alreadyHandledByFix1 = needsReclassify && OPENAI_API_KEY && content.trim();
      if (!alreadyHandledByFix1 && (aiChanged || examSubject)) {
        const newClsData = (ai.classification as Record<string, unknown>) || {};
        const difficulty = String(newClsData.difficulty || ai.difficulty || 3);
        const cognitiveDomain = (newClsData.cognitiveDomain as string) || (ai.cognitiveDomain as string) || 'CALCULATION';

        if (existingCls) {
          // 기존 코드가 있으면 difficulty/cognitiveDomain만 동기화
          const needsSync =
            existingCls.difficulty !== difficulty ||
            existingCls.cognitive_domain !== cognitiveDomain;
          if (needsSync) {
            await supabaseAdmin
              .from('classifications')
              .update({ difficulty, cognitive_domain: cognitiveDomain })
              .eq('id', existingCls.id);
            result.fixes.push(`classifications 동기화: diff=${difficulty}, domain=${cognitiveDomain}`);
          }
        } else {
          // ★ 분류 행이 없으면 INSERT
          await supabaseAdmin
            .from('classifications')
            .insert({
              problem_id: problem.id,
              type_code: (newClsData.typeCode as string) || '',
              difficulty,
              cognitive_domain: cognitiveDomain,
              ai_confidence: 0.5,
              is_verified: false,
            });
          result.fixes.push('classifications 행 생성');
        }
      }

      // ─── DB 업데이트 ───
      if (aiChanged) {
        updates.ai_analysis = ai;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabaseAdmin
          .from('problems')
          .update(updates)
          .eq('id', problem.id);

        if (updateErr) {
          result.errors.push(`DB 업데이트 실패: ${updateErr.message}`);
        }
      }

      if (result.fixes.length > 0 || result.errors.length > 0) {
        results.push(result);
      }
    }

    // 4. 시험지 과목/학년도 업데이트
    const examUpdates: Record<string, string> = {};
    if (examSubject && exam.subject !== examSubject) {
      examUpdates.subject = examSubject;
    }
    if (examGrade && exam.grade !== examGrade) {
      examUpdates.grade = examGrade;
    }
    if (Object.keys(examUpdates).length > 0) {
      await supabaseAdmin
        .from('exams')
        .update(examUpdates)
        .eq('id', examId);
    }

    const totalFixes = results.reduce((sum, r) => sum + r.fixes.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return NextResponse.json({
      examId,
      examSubject,
      examGrade,
      totalProblems: problems.length,
      totalFixes,
      totalErrors,
      fixedProblems: results.filter(r => r.fixes.length > 0).length,
      results,
    });
  } catch (error) {
    console.error('[auto-fix] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function detectSubjectFromTitle(title: string): string {
  if (!title) return '';

  // ★ 중학교 이름 감지: "사직중", "여명중", "OO중학교" 등
  const isMiddleSchool = MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ 중등 — [2026][2-1-M] 패턴 (각각 별개 괄호)
  const bracketMatch = title.match(/\[\d{4}\]\s*\[(\d)-(\d)-?([ME])?\]/);
  if (bracketMatch) {
    const grade = bracketMatch[1];
    const semester = bracketMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // 중등 — [2-1-M] 또는 [3-1-M] 패턴, "중" 글자 포함
  const midMatch = title.match(/\[?(\d)-(\d)-?[ME]?\]?/);
  if (midMatch && (isMiddleSchool || /중/.test(title) || parseInt(midMatch[1]) <= 3)) {
    const grade = midMatch[1];
    const semester = midMatch[2];
    return `중${grade}-${semester} 수학`;
  }

  // 중등 — "중2-1", "중3", "중학" 등 직접 패턴
  if (/중[23]?-?[12]/.test(title) || /중학/.test(title) || /중\]/.test(title)) {
    const match = title.match(/(\d)-(\d)/);
    if (match) return `중${match[1]}-${match[2]} 수학`;
    return '중등 수학';
  }

  // ★ 학교명에 "중"이 있고 학년-학기 패턴이 있으면 중등
  if (isMiddleSchool) {
    const gsMatch = title.match(/(\d)-(\d)/);
    if (gsMatch) return `중${gsMatch[1]}-${gsMatch[2]} 수학`;
    // 학년만 있는 경우
    const gradeOnly = title.match(/(\d)\s*학년/);
    if (gradeOnly) return `중${gradeOnly[1]}-1 수학`;
    return '중등 수학';
  }

  // 고등
  if (/수학[1I](?!\d)/.test(title) || /수[1I]\b/.test(title)) return '수학1';
  if (/수학[2II](?!\d)/.test(title) || /수[2II]\b/.test(title)) return '수학2';
  if (/미적분/.test(title)) return '미적분';
  if (/확률.*통계|확통/.test(title)) return '확률과통계';
  if (/기하/.test(title)) return '기하';
  if (/공통수학[12]/.test(title)) return title.match(/공통수학[12]/)?.[0] || '공통수학1';
  if (/공통수학/.test(title)) return '공통수학1';

  // 과학
  if (/과학|물리|화학|생명|생물|지구/.test(title)) {
    if (/공통과학1|통합과학/.test(title)) return '공통과학1';
    if (/물리/.test(title)) return '물리학1';
    if (/화학/.test(title)) return '화학1';
    if (/생명|생물/.test(title)) return '생명과학1';
    if (/지구/.test(title)) return '지구과학1';
    return '공통과학1';
  }
  return '';
}

function detectGradeFromTitle(title: string): string {
  if (!title) return '';

  // ★ 중학교 이름 감지
  const isMiddleSchool = MIDDLE_SCHOOL_PATTERN.test(title);

  // ★ [2026][2-1-M] 패턴
  const bracketMatch = title.match(/\[\d{4}\]\s*\[(\d)-(\d)-?([ME])?\]/);
  if (bracketMatch) {
    return `중${bracketMatch[1]}`;
  }

  // [2-1-M] 패턴 + "중" 글자
  const midMatch = title.match(/\[?(\d)-(\d)-?[ME]?\]?/);
  if (midMatch && (isMiddleSchool || /중/.test(title) || parseInt(midMatch[1]) <= 3)) {
    return `중${midMatch[1]}`;
  }

  if (/중1/.test(title)) return '중1';
  if (/중2/.test(title)) return '중2';
  if (/중3/.test(title)) return '중3';

  // ★ 학교명에 "중"이 있으면 중학교 → 학년 추출 시도
  if (isMiddleSchool) {
    const gradeMatch = title.match(/(\d)\s*학년/) || title.match(/(\d)-(\d)/);
    if (gradeMatch) return `중${gradeMatch[1]}`;
    return '중2'; // 중학교인데 학년 불명 → 기본값 중2
  }

  if (/고1/.test(title)) return '고1';
  if (/고2/.test(title)) return '고2';
  if (/고3/.test(title)) return '고3';
  return '';
}

function matchesSubject(current: string, expected: string): boolean {
  if (!current || !expected) return false;
  // 정확히 일치
  if (current === expected) return true;
  // 유사 매칭 (예: "공통수학1" vs "중2-1 수학")
  if (expected.includes('중') && current.includes('중')) return true;
  if (expected.includes('수학1') && current.includes('수학1')) return true;
  // 공통수학인데 중등으로 분류된 경우 → 불일치
  if (expected.includes('중') && current === '공통수학1') return false;
  return false;
}
