// ============================================================================
// POST /api/exams/[examId]/auto-fix
// 시험지 내 문제들의 공통 오류를 자동 감지 + 수정
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { detectSubjectFromTitle, detectGradeFromTitle, MIDDLE_SCHOOL_PATTERN } from '@/lib/workflow/title-detect';

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

// MIDDLE_SCHOOL_PATTERN은 @/lib/workflow/title-detect 에서 import
// (cloud-flow 와 공유)

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
  // ★ 클로저(arrow function) 안에서는 위 null 체크가 좁혀지지 않으므로 단정 캡처
  const sb = supabaseAdmin;

  try {
    // 1. 시험지 정보 조회
    const { data: exam } = await sb
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
    const { data: examProblems } = await sb
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number');

    if (!examProblems || examProblems.length === 0) {
      return NextResponse.json({ message: '문제가 없습니다.', fixes: [] });
    }

    const problemIds = examProblems.map(ep => ep.problem_id);
    const seqMap = new Map(examProblems.map(ep => [ep.problem_id, ep.sequence_number]));

    const { data: problems } = await sb
      .from('problems')
      .select('id, source_number, content_latex, answer_json, ai_analysis, images, solution_latex')
      .in('id', problemIds);

    if (!problems) {
      return NextResponse.json({ message: '문제 조회 실패', fixes: [] });
    }

    // ─── 렌더 수정 학습 규칙 로드 (confidence ≥ 0.7) ───
    //    매 요청당 한 번만 조회해서 아래 루프에서 재사용.
    //    조회 실패하면 빈 배열 → 학습 적용만 건너뛰고 나머지 로직 정상 진행.
    let learnedRules: Array<{ original: string; corrected: string; confidence: number; id: string }> = [];
    try {
      const { data: rulesData } = await sb
        .from('latex_render_corrections')
        .select('id, original_fragment, corrected_fragment, confidence, status')
        .in('status', ['auto_applied', 'learning'])
        .gte('confidence', 0.7)
        .order('confidence', { ascending: false })
        .limit(200);
      if (rulesData) {
        learnedRules = rulesData.map(r => ({
          id: r.id,
          original: r.original_fragment,
          corrected: r.corrected_fragment,
          confidence: r.confidence,
        }));
      }
    } catch (e) {
      console.warn('[auto-fix] learnedRules load failed:', e instanceof Error ? e.message : e);
    }

    // ★ 기존 classifications 일괄 조회
    const { data: allClassifications } = await sb
      .from('classifications')
      .select('id, problem_id, type_code, expanded_type_code, difficulty, cognitive_domain')
      .in('problem_id', problemIds);
    const classMap = new Map((allClassifications || []).map(c => [c.problem_id, c]));

    // 3. 각 문제별 자동 수정 — 2개씩 병렬 처리
    //    Gemini 무료 티어 15 RPM 한도 안에서 동작 → 429 없이 일관된 처리
    //    이전 5 병렬은 순간 RPM 초과로 재시도·폴백 대량 발생 → 오히려 느림
    const results: FixResult[] = [];
    const CHUNK_SIZE = 2;

    const processProblem = async (problem: typeof problems[number]) => {
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

      if (needsReclassify && (OPENAI_API_KEY || GOOGLE_AI_KEY) && content.trim()) {
        try {
          // ★ 공용 분류 모듈 호출 (Gemini Flash → GPT-4o 폴백 로직 모두 포함)
          const { classifyProblem } = await import('@/lib/workflow/classify');
          const classifyResult = await classifyProblem({
            content,
            examSubject,
            examGrade,
            logLabel: `auto-fix #${seqNum}`,
          });
          if (!classifyResult) {
            throw new Error('classifyProblem 반환값 없음');
          }
          const newCls: Record<string, unknown> = {
            typeCode: classifyResult.typeCode,
            typeName: classifyResult.typeName,
            subject: classifyResult.subject,
            chapter: classifyResult.chapter,
            section: classifyResult.section,
            difficulty: classifyResult.difficulty,
            cognitiveDomain: classifyResult.cognitiveDomain,
            confidence: classifyResult.confidence,
          };

            // ★ typeName이 비어있으면 mathsecr_types에서 조회
            if (newCls.typeCode && (!newCls.typeName || newCls.typeName === newCls.typeCode)) {
              try {
                const { data: msType } = await sb
                  .from('mathsecr_types')
                  .select('full_path')
                  .eq('code', newCls.typeCode)
                  .limit(1)
                  .single();
                if (msType?.full_path) {
                  newCls.typeName = msType.full_path;
                }
              } catch { /* ignore */ }
            }

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
            const rawCognitive = classifyResult.cognitiveDomain || 'CALCULATION';
            const mappedCognitive = VALID_COGNITIVE.has(rawCognitive) ? rawCognitive : (COGNITIVE_MAP[rawCognitive] || 'CALCULATION');

            // ★ difficulty 1~10 그대로 저장 (수학비서 스케일)
            const rawDiff = classifyResult.difficulty || 3;
            const mappedDiff = Math.max(1, Math.min(10, rawDiff));

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
              const { error: clsErr } = await sb
                .from('classifications')
                .update(classUpdateData)
                .eq('id', existingCls.id);
              if (clsErr) console.error(`[auto-fix] #${seqNum} cls update error:`, clsErr.message);
              else console.log(`[auto-fix] #${seqNum} → ${newCls.typeCode}`);

              // 2) 같은 problem_id의 중복 행 삭제 (첫 번째만 남김)
              await sb
                .from('classifications')
                .delete()
                .eq('problem_id', problem.id)
                .neq('id', existingCls.id);
            } else {
              // ★ 분류 행이 없으면 INSERT
              await sb
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
        } catch (e) {
          console.error(`[auto-fix] #${seqNum} GPT/DB error:`, e instanceof Error ? e.message : e);
          // GPT 실패 시 과목만 변경
          ai.subject = examSubject;
          ai.autoFixedSubject = true;
          aiChanged = true;
          result.fixes.push(`과목: "${currentSubject}" → "${examSubject}" (재분류 실패)`);

          // classifications 테이블에도 최소한 difficulty/cognitive_domain 업데이트
          if (existingCls) {
            await sb
              .from('classifications')
              .update({
                difficulty: String(ai.difficulty || 3),
                cognitive_domain: (ai.cognitiveDomain as string) || 'CALCULATION',
              })
              .eq('id', existingCls.id);
          } else {
            await sb
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

      // ─── FIX 2.5: 깨진 tabular/LaTeX가 choices에 들어간 경우 제거 ───
      // 선택지에 &, \\, \end{tabular} 등 LaTeX 표 문법이 섞여 있으면 깨진 것
      const currentChoices = ((updates.answer_json as Record<string, unknown>)?.choices as string[]) || choices;
      if (currentChoices.length > 0) {
        const brokenCount = currentChoices.filter(c =>
          /\\\\|\\end\{|\\begin\{|&\s*\$|&\s*&/.test(c)
        ).length;
        // 과반수 이상이 깨졌으면 전체 choices 제거
        if (brokenCount > currentChoices.length / 2) {
          const updatedAj = { ...(updates.answer_json as Record<string, unknown> || answerJson), choices: [] };
          updates.answer_json = updatedAj;
          result.fixes.push(`깨진 선택지 ${currentChoices.length}개 제거 (tabular 잔여)`);
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

      // ─── FIX 4.5: LaTeX 콘텐츠 정규화 (DB 직접 수정, 렌더링 clean과 분리) ───
      const fixLatex = (raw: string): { fixed: string; changes: string[] } => {
        const changes: string[] = [];
        let fixed = raw;

        // \displaystyle 제거
        if (/\\displaystyle/.test(fixed)) {
          fixed = fixed.replace(/\\displaystyle\s*/g, '');
          changes.push('\\displaystyle 제거');
        }

        // \hline 제거 (수식 밖에서 KaTeX 에러)
        if (/\\hline/.test(fixed)) {
          fixed = fixed.replace(/\\hline\s*/g, '');
          changes.push('\\hline 제거');
        }

        // ─── 연립방정식 괄호 패턴 수정 ───
        // OCR 출력: $\left\{$eq1$\n$eq2$\right.$ → KaTeX 렌더링 깨짐
        // 수정: $\begin{cases} eq1 \\ eq2 \end{cases}$

        // (a) 쌍 연립방정식: $\left\{$eq1$\n$eq2$,\left\{$eq3$\n$eq4$\right.\right.$
        const pairedSystemPattern = /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\s*,\s*\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\\right\.\$/g;
        if (pairedSystemPattern.test(fixed)) {
          pairedSystemPattern.lastIndex = 0;
          fixed = fixed.replace(pairedSystemPattern, (_m: string, eq1: string, eq2: string, eq3: string, eq4: string) => {
            // cases 내부 \frac → \dfrac (인라인 모드에서 분수 크기 유지)
            const d = (s: string) => s.trim().replace(/\\frac\b/g, '\\dfrac');
            return `$\\begin{cases} ${d(eq1)} \\\\ ${d(eq2)} \\end{cases}$, $\\begin{cases} ${d(eq3)} \\\\ ${d(eq4)} \\end{cases}$`;
          });
          changes.push('쌍 연립방정식 괄호 수정');
        }

        // (b) 단일 연립방정식: $\left\{$eq1$\n$eq2$\right.$
        const singleSystemPattern = /\$\\left\\\{\$([^$]*)\$(?:\\n|\n)\$([^$]*)\$\\right\.\$/g;
        if (singleSystemPattern.test(fixed)) {
          singleSystemPattern.lastIndex = 0;
          fixed = fixed.replace(singleSystemPattern, (_m: string, eq1: string, eq2: string) => {
            const d = (s: string) => s.trim().replace(/\\frac\b/g, '\\dfrac');
            return `$\\begin{cases} ${d(eq1)} \\\\ ${d(eq2)} \\end{cases}$`;
          });
          changes.push('연립방정식 괄호 수정');
        }

        // ★ array/aligned 블록 인라인화 — 너무 공격적이어서 <보기> 박스 같은 정상 표를 파괴함.
        //   (예: \begin{array}{|c|}\hline\text{<보기>}\\\pi...\end{array} → $\text{<보기>}$\n$\pi...$ 로 쪼개져 버림)
        //   KaTeX는 최신 버전에서 \begin{array}를 정상 렌더링하므로 이 변환은 제거.
        //   만약 특정 패턴에서 렌더 깨짐이 재발하면 MixedContentRenderer 측에서 처리.

        return { fixed, changes };
      };

      const contentBefore = (updates.content_latex as string) || content;
      const { fixed: contentFixed, changes: contentChanges } = fixLatex(contentBefore);
      if (contentFixed !== contentBefore) {
        updates.content_latex = contentFixed;
        result.fixes.push(`LaTeX 정규화: ${contentChanges.join(', ')}`);
      }

      const solBefore = (updates.solution_latex as string) || (problem.solution_latex as string) || '';
      if (solBefore) {
        const { fixed: solFixed, changes: solChanges } = fixLatex(solBefore);
        if (solFixed !== solBefore) {
          updates.solution_latex = solFixed;
          result.fixes.push(`해설 LaTeX 정규화: ${solChanges.join(', ')}`);
        }
      }

      // ─── FIX 4.6: LaTeX 렌더 수정 (src/lib/latex/renderRepair.ts) ───
      // ★ 이 패스는 "자동수정(유형매핑)"과는 별개 개념으로, KaTeX 렌더 실패 교정만 담당.
      //   분할된 구간정의함수 병합 등, 기존 fixLatex 가 못 잡는 케이스 보완.
      //   + 학습된 사용자 수정 규칙도 여기서 함께 적용.
      try {
        const { repairLatexRender, applyLearnedRules } = await import('@/lib/latex/renderRepair');

        // (1) 하드코딩 렌더 수정 규칙
        const c2Before = (updates.content_latex as string) || content;
        const c2 = repairLatexRender(c2Before);
        if (c2.changes.length > 0 && c2.fixed !== c2Before) {
          updates.content_latex = c2.fixed;
          result.fixes.push(`렌더 수정: ${c2.changes.join(', ')}`);
        }
        const s2Before = (updates.solution_latex as string) || (problem.solution_latex as string) || '';
        if (s2Before) {
          const s2 = repairLatexRender(s2Before);
          if (s2.changes.length > 0 && s2.fixed !== s2Before) {
            updates.solution_latex = s2.fixed;
            result.fixes.push(`해설 렌더 수정: ${s2.changes.join(', ')}`);
          }
        }

        // (2) 학습 규칙 — 과거 수동 수정에서 쌓인 (original → corrected) 패턴
        if (learnedRules.length > 0) {
          const c3Before = (updates.content_latex as string) || c2.fixed || content;
          const c3 = applyLearnedRules(c3Before, learnedRules);
          if (c3.changes.length > 0 && c3.fixed !== c3Before) {
            updates.content_latex = c3.fixed;
            result.fixes.push(`학습 규칙: ${c3.changes.join(', ')}`);
          }
          const s3Before = (updates.solution_latex as string) || (problem.solution_latex as string) || '';
          if (s3Before) {
            const s3 = applyLearnedRules(s3Before, learnedRules);
            if (s3.changes.length > 0 && s3.fixed !== s3Before) {
              updates.solution_latex = s3.fixed;
              result.fixes.push(`해설 학습 규칙: ${s3.changes.join(', ')}`);
            }
          }
        }
      } catch (e) {
        console.error(`[auto-fix] #${seqNum} renderRepair error:`, e instanceof Error ? e.message : e);
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
            await sb
              .from('classifications')
              .update({ difficulty, cognitive_domain: cognitiveDomain })
              .eq('id', existingCls.id);
            result.fixes.push(`classifications 동기화: diff=${difficulty}, domain=${cognitiveDomain}`);
          }
        } else {
          // ★ 분류 행이 없으면 INSERT
          await sb
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
        const { error: updateErr } = await sb
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
    };

    // 5개씩 청크 병렬 실행 (Gemini rate limit + Supabase 동시성 균형)
    for (let i = 0; i < problems.length; i += CHUNK_SIZE) {
      const chunk = problems.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(p => processProblem(p).catch(err => {
        console.error(`[auto-fix] 문제 ${seqMap.get(p.id)}번 처리 실패:`, err);
      })));
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
      await sb
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

// ★ detectSubjectFromTitle, detectGradeFromTitle은 @/lib/workflow/title-detect 에서 import (cloud-flow와 공유)

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
