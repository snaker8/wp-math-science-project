// ============================================================================
// POST /api/exams/[examId]/auto-fix
// 시험지 내 문제들의 공통 오류를 자동 감지 + 수정
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const maxDuration = 300; // 5분 타임아웃 (재분류 포함)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

const CURRICULUM: Record<string, string> = {
  '중1': '1.자연수의성질 2.정수와유리수 3.일차방정식 4.좌표평면과그래프 5.기본도형 6.평면도형과입체도형 7.통계',
  '중2-1': '1.유리수와순환소수 2.식의계산(단항식·다항식) 3.부등식(일차부등식) 4.연립방정식 5.일차함수',
  '중2-2': '1.삼각형의성질 2.사각형의성질 3.도형의닮음 4.확률',
  '중3-1': '1.실수와그계산(제곱근,무리수) 2.다항식의곱셈과인수분해 3.이차방정식 4.이차함수',
  '중3-2': '1.삼각비 2.원의성질 3.통계',
  '고1': '1.다항식(나머지정리,인수분해) 2.방정식과부등식(복소수,이차방정식,이차함수,고차방정식,연립방정식,절대값부등식) 3.경우의수',
  '공통수학1': '1.다항식(나머지정리,인수분해) 2.방정식과부등식(복소수,이차방정식,이차함수,고차방정식,연립방정식,절대값부등식) 3.경우의수',
  '공통수학2': '1.도형의방정식(직선,원,평행이동,대칭이동) 2.집합과명제 3.함수(합성함수,역함수,유리함수,무리함수)',
  '수학I': '1.지수함수와로그함수(지수,로그,지수함수,로그함수) 2.삼각함수(일반각,호도법,삼각함수,사인법칙,코사인법칙) 3.수열(등차수열,등비수열,수열의합,수학적귀납법)',
  '수학II': '1.함수의극한과연속 2.미분(미분계수,도함수,접선,평균값정리,함수의증감,극대극소,최대최소) 3.적분(부정적분,정적분,넓이)',
  '확률과 통계': '1.순열과조합(순열,조합,이항정리) 2.확률(조건부확률,독립시행) 3.통계(확률분포,정규분포,통계적추정)',
  '미적분': '1.수열의극한 2.급수 3.여러가지미분법(합성함수미분,매개변수미분,음함수미분) 4.여러가지적분법(치환적분,부분적분) 5.미분방정식',
  '기하': '1.이차곡선(포물선,타원,쌍곡선) 2.평면벡터 3.공간도형과공간좌표',
  '대수': '1.행렬 2.일차변환 3.벡터공간',
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

      // ★ 모드에 따라 재분류 여부 결정
      const { searchParams: fixParams } = new URL(request.url);
      const mode = fixParams.get('mode') || 'full'; // 'full' | 'fix' | 'classify'
      const forceReclassify = fixParams.get('force') === '1';
      const hasMathsecrCode = existingTypeCode?.startsWith('MS');

      // mode=fix → 분류 건너뜀 (content 수정만)
      // mode=classify 또는 force=1 → 강제 재분류
      // mode=full → 필요시만 재분류
      const needsReclassify = mode !== 'fix' && examSubject && (
        forceReclassify || mode === 'classify' ||
        !hasMathsecrCode ||
        !matchesSubject(clsSubject, examSubject) ||
        !clsChapter ||
        !clsTypeName
      );

      console.log(`[auto-fix] #${seqNum}: typeCode=${existingTypeCode}, needsReclassify=${needsReclassify}, subject=${clsSubject}, chapter=${clsChapter}`);

      if (needsReclassify && OPENAI_API_KEY && content.trim()) {
        // GPT-4o로 수학비서 체계 기반 재분류
        let mathsecrTypeTable = '';
        let resolvedCode = '';
        try {
          const { resolveSubjectCode, buildTypeTable } = await import('@/lib/workflow/mathsecr-prompt');
          resolvedCode = resolveSubjectCode(examGrade, examSubject) || '';
          if (resolvedCode) {
            mathsecrTypeTable = buildTypeTable(resolvedCode);
          }
        } catch (e) {
          console.warn('[auto-fix] mathsecr-prompt load failed:', e);
        }

        // 예제 코드에 실제 resolvedCode 반영
        const exampleCode = resolvedCode ? `MS${resolvedCode}-01-03-02` : 'MS07-01-03-02';

        try {
          // Gemini 3 Flash 우선, 없으면 GPT fallback
          const useGemini = !!GOOGLE_AI_KEY;
          const apiUrl = useGemini
            ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
            : 'https://api.openai.com/v1/chat/completions';
          const apiKey = useGemini ? GOOGLE_AI_KEY : OPENAI_API_KEY;
          const modelName = useGemini ? 'gemini-3-flash-preview' : 'gpt-4.1-mini';

          // Rate limit 재시도 (최대 3회, 429 시 대기)
          let gptRes: Response | null = null;
          for (let attempt = 0; attempt < 3; attempt++) {

            gptRes = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({
                model: modelName,
                messages: [
                  { role: 'system', content: `한국 수학 교육과정 전문가. 수학비서 분류 체계로 문제를 분류합니다. 반드시 JSON만 응답.` },
                  { role: 'user', content: `이 문제는 "${examSubject}" (${examGrade}) 시험지의 문제입니다.
반드시 해당 과목 범위 내에서 분류하세요.

${mathsecrTypeTable ? `아래 유형 테이블에서 가장 적합한 typeCode를 선택하세요:\n${mathsecrTypeTable}\n` : ''}
난이도 1~10

JSON: {"classification":{"typeCode":"${exampleCode}","typeName":"대단원 > 중단원 > 소단원","subject":"${examSubject}","chapter":"대단원","section":"중단원","difficulty":3,"cognitiveDomain":"CALCULATION","confidence":0.9}}

문제:
${content.slice(0, 1500)}` }
                ],
                temperature: 0.1, max_tokens: 1000, response_format: { type: 'json_object' }
              })
            });

            if (gptRes.status !== 429) break;
            // 429 → 대기 후 재시도
            const waitSec = Math.min(15 * (attempt + 1), 30);
            console.log(`[auto-fix] #${seqNum} rate limited, waiting ${waitSec}s (attempt ${attempt + 1}/3)`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
          }

          if (gptRes && gptRes.ok) {
            const gptData = await gptRes.json();
            let rawContent = gptData.choices?.[0]?.message?.content || '{}';
            // Gemini가 마크다운 코드블록으로 감쌀 수 있음
            rawContent = rawContent.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '').trim();
            console.log(`[auto-fix] #${seqNum} [${modelName}] response: ${rawContent.slice(0, 200)}`);
            const reclassified = JSON.parse(rawContent);
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

            // ★ cognitive_domain 유효값 매핑
            const VALID_COGNITIVE = new Set(['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING']);
            const COGNITIVE_MAP: Record<string, string> = {
              'ANALYSIS': 'INFERENCE',
              'REASONING': 'INFERENCE',
              'APPLICATION': 'PROBLEM_SOLVING',
              'COMPREHENSION': 'UNDERSTANDING',
              'KNOWLEDGE': 'UNDERSTANDING',
            };
            const rawCognitive = newCls.cognitiveDomain || 'CALCULATION';
            const mappedCognitive = VALID_COGNITIVE.has(rawCognitive) ? rawCognitive : (COGNITIVE_MAP[rawCognitive] || 'CALCULATION');

            // ★ difficulty 1~10 → 1~5 매핑
            const rawDiff = parseInt(newCls.difficulty) || 3;
            const mappedDiff = Math.max(1, Math.min(5, Math.ceil(rawDiff / 2)));

            // ★ classifications 테이블도 함께 업데이트
            const classUpdateData: Record<string, unknown> = {
              difficulty: String(mappedDiff),
              cognitive_domain: mappedCognitive,
              ai_confidence: newCls.confidence || 0.8,
              is_verified: false,
            };

            // ★ 수학비서 코드(MS)로 항상 갱신
            if (newCls.typeCode) {
              classUpdateData.type_code = newCls.typeCode;
            }

            if (existingCls) {
              // 1) 첫 번째 행만 업데이트
              const { error: clsErr } = await supabaseAdmin
                .from('classifications')
                .update(classUpdateData)
                .eq('id', existingCls.id);
              if (clsErr) console.error(`[auto-fix] #${seqNum} cls update error:`, clsErr.message);
              else console.log(`[auto-fix] #${seqNum} → ${newCls.typeCode}`);

              // 2) 같은 problem_id의 중복 행 삭제 (첫 번째만 남김)
              await supabaseAdmin
                .from('classifications')
                .delete()
                .eq('problem_id', problem.id)
                .neq('id', existingCls.id);
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
          } else if (gptRes) {
            const errBody = await gptRes.text().catch(() => '');
            console.error(`[auto-fix] #${seqNum} GPT HTTP ${gptRes.status}: ${errBody.slice(0, 200)}`);
            result.errors.push(`GPT 호출 실패 (HTTP ${gptRes.status})`);
          }
        } catch (e) {
          console.error(`[auto-fix] #${seqNum} GPT/DB error:`, e instanceof Error ? e.message : e);
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

      // ─── FIX 2: 서술형 소문제가 choices에 잘못 들어간 경우만 복원 ───
      const answerJson = problem.answer_json as Record<string, unknown> || {};
      const choices = (answerJson.choices as string[]) || [];

      // ★ 안전장치: 4개 이상 choices는 절대 건드리지 않음 (객관식/ㄱㄴㄷ)
      if (choices.length >= 2 && choices.length <= 3) {
        const subKeyword = /구하시오|구하여라|서술하시오|설명하시오|완성하시오|답하시오|쓰시오|쓰고|풀이\s*과정|보이시오|나타내시오|증명하시오|구하세요|구해\s*보시오/;
        const anyChoiceHasKeyword = choices.some(c => subKeyword.test(c));

        // 조건: choices 2~3개 + 하나라도 서술형 키워드 포함
        // (객관식 보기에는 "구하시오/쓰시오" 등이 절대 안 나옴)
        if (anyChoiceHasKeyword) {
          const numberedChoices = choices.map((c, i) => {
            const hasParenNum = /^\s*\(\d+\)/.test(c);
            return hasParenNum ? c : `(${i + 1}) ${c}`;
          });
          const currentContent = (updates.content_latex as string) || content;
          const restoredContent = (currentContent.trim() ? currentContent.trim() + '\n\n' : '') + numberedChoices.join('\n');
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

  // 고등 — 공통수학을 먼저 체크, 미적분1/2도 공통수학보다 뒤에
  if (/공통수학[12]/.test(title)) return title.match(/공통수학[12]/)?.[0] || '공통수학1';
  if (/공통수학/.test(title)) return '공통수학1';
  if (/대수/.test(title)) return '대수';
  if (/미적분[12]/.test(title)) return title.match(/미적분[12]/)?.[0] || '미적분1';
  if (/미적분/.test(title)) return '미적분'; // 구 교육과정 미적분 → code 12
  if (/확률.*통계|확통/.test(title)) return '확률과통계';
  if (/기하/.test(title)) return '기하';
  // 구 수학I = 대수(09), 구 수학II = 미적분1(10)
  if (/수학[1IⅠ](?!\d)/.test(title) || /수[1IⅠ]\b/.test(title)) return '수학I';
  if (/수학[2IⅡ](?!\d)/.test(title) || /수[2IⅡ]\b/.test(title)) return '수학II';

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

  // 명시적 학년 패턴: "고1 ", "고2 " (뒤에 공백/숫자/한글이 와야 함 — "고" 단독 매칭 방지)
  if (/고1(?:\s|$|학년)/.test(title)) return '고1';
  if (/고2(?:\s|$|학년)/.test(title)) return '고2';
  if (/고3(?:\s|$|학년)/.test(title)) return '고3';

  // 과목명으로 학년 추론 (명시적 학년 없을 때)
  if (/공통수학/.test(title)) return '고1';
  if (/수학[1IⅠ](?!\d)|대수|확률.*통계|확통/.test(title)) return '고2';
  if (/수학[2IⅡ](?!\d)|미적분|기하/.test(title)) return '고3';

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
