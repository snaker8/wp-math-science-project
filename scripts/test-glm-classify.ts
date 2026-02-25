/**
 * ============================================================
 * 문제 분류(Classification) 비교 테스트
 * GPT-4o  vs  GLM-4.7 Flash (무료)
 *
 * 사용법:
 *   npx ts-node scripts/test-glm-classify.ts
 *
 * 내장된 샘플 문제 5개로 두 모델의 분류 결과를 비교합니다.
 * ============================================================
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ZAI_API_KEY    = process.env.ZAI_API_KEY    || '';

// ─── 분류 프롬프트 (cloud-flow.ts 와 동일 + 영어 버전 비교) ──────────────
const CLASSIFY_PROMPT_KO = `당신은 한국 고등수학 전문가입니다. 주어진 수학 문제를 분석하여 분류하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "subject": "수학I | 수학II | 미적분 | 확률과통계 | 기하 | 수학(공통)",
  "chapter": "단원명",
  "topic": "세부 주제",
  "difficulty": 1~5,
  "problem_type": "객관식 | 주관식 | 서술형",
  "key_concepts": ["개념1", "개념2"],
  "reasoning": "분류 이유 한 줄"
}`;

// 영어 프롬프트 (GLM의 한국어 약점 보완 실험)
const CLASSIFY_PROMPT_EN = `You are a Korean high school mathematics expert. Analyze the given math problem and classify it.

Respond ONLY in this JSON format:
{
  "subject": "수학I | 수학II | 미적분 | 확률과통계 | 기하 | 수학(공통)",
  "chapter": "chapter name in Korean",
  "topic": "specific topic in Korean",
  "difficulty": 1-5,
  "problem_type": "객관식 | 주관식 | 서술형",
  "key_concepts": ["concept1", "concept2"],
  "reasoning": "one line reason in Korean"
}`;

// ─── 샘플 문제 (한국 수능/내신 스타일) ────────────────────────────────────
const SAMPLE_PROBLEMS = [
  {
    id: 1,
    text: `함수 $f(x) = -x^2 + 8x - 12$ 에 대하여 $f(x) \\geq 0$ 을 만족시키는 $x$의 범위를 구하시오.`,
    expected: { subject: '수학(공통)', chapter: '이차부등식' },
  },
  {
    id: 2,
    text: `$\\lim_{x \\to \\infty} \\frac{3x^2 - 2x + 1}{x^2 + 5}$ 의 값을 구하시오.`,
    expected: { subject: '수학II', chapter: '극한' },
  },
  {
    id: 3,
    text: `등비수열 $\\{a_n\\}$ 에서 $a_1 = 2$, $a_4 = 54$ 일 때, 공비를 구하시오.`,
    expected: { subject: '수학I', chapter: '수열' },
  },
  {
    id: 4,
    text: `주머니 속에 흰 공 3개, 검은 공 2개가 있다. 임의로 2개를 꺼낼 때 2개 모두 흰 공일 확률을 구하시오.`,
    expected: { subject: '확률과통계', chapter: '확률' },
  },
  {
    id: 5,
    text: `$\\sin\\theta + \\cos\\theta = \\frac{\\sqrt{2}}{2}$ 일 때, $\\sin\\theta \\cdot \\cos\\theta$ 의 값을 구하시오.`,
    expected: { subject: '수학I', chapter: '삼각함수' },
  },
];

// ─── API 호출 ──────────────────────────────────────────────────────────────
async function callGPT4o(problemText: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CLASSIFY_PROMPT_KO },
        { role: 'user', content: `문제:\n${problemText}` },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`GPT-4o: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callGLM47Flash(problemText: string, useEnglishPrompt = false): Promise<any> {
  const systemPrompt = useEnglishPrompt ? CLASSIFY_PROMPT_EN : CLASSIFY_PROMPT_KO;

  // Rate limit 대비 재시도 (최대 3회, 5초 간격)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ZAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-4.7-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `문제:\n${problemText}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
        thinking: { type: 'disabled' },  // thinking 모드 OFF
      }),
    });

    if (res.status === 429) {
      const wait = attempt * 10000; // 10초, 20초, 30초
      console.log(`      ⏳ Rate limit 429 → ${wait/1000}초 후 재시도 (${attempt}/3)...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`GLM-4.7: ${res.status} ${await res.text()}`);

    const data = await res.json();

  // GLM-4.7 응답 구조 처리 (thinking 모드 포함)
  const msg = data.choices?.[0]?.message;
  // content가 배열인 경우 (멀티모달 응답) 처리
  let content: string = '';
  if (typeof msg?.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg?.content)) {
    content = msg.content.map((c: any) => c.text || '').join('');
  }
  // thinking 모드: content가 비어있으면 reasoning_content 시도
  if (!content && msg?.reasoning_content) {
    content = msg.reasoning_content;
  }

  // 디버그: 첫 번째 문제에서만 raw 응답 출력
  if (problemText.includes('f(x)')) {
    console.log(`\n  [GLM RAW] content 길이=${content.length}, 앞부분: ${content.slice(0, 150)}`);
  }

  // JSON 추출: 마크다운 코드블록 또는 순수 JSON
  const jsonMatch =
    content.match(/```json\s*([\s\S]*?)```/) ||  // ```json ... ```
    content.match(/```\s*([\s\S]*?)```/) ||       // ``` ... ```
    content.match(/(\{[\s\S]*\})/);               // 순수 { ... }

  if (!jsonMatch) throw new Error(`GLM JSON 파싱 실패 (content길이=${content.length}):\n${content.slice(0, 300)}`);
  const jsonStr = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonStr);
  } // for 루프 끝
  throw new Error('GLM-4.7: 최대 재시도 초과');
}

// ─── 분류 일치 여부 확인 ────────────────────────────────────────────────────
function checkMatch(result: any, expected: { subject: string; chapter: string }): boolean {
  const subjectMatch = result.subject?.includes(expected.subject.replace('수학(공통)', '')) ||
                       result.subject === expected.subject;
  return subjectMatch;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📚 문제 분류 비교 테스트 (GPT-4o vs GLM-4.7 Flash)');
  console.log('='.repeat(70));

  const results: Array<{
    id: number;
    gptSubject?: string; gptChapter?: string; gptDiff?: number; gptMs?: number;
    glmSubject?: string; glmChapter?: string; glmDiff?: number; glmMs?: number;
    expected: { subject: string; chapter: string };
  }> = [];

  for (const problem of SAMPLE_PROBLEMS) {
    console.log(`\n문제 ${problem.id}: ${problem.text.slice(0, 60)}...`);
    console.log(`  예상: ${problem.expected.subject} > ${problem.expected.chapter}`);

    const row: any = { id: problem.id, expected: problem.expected };

    // GPT-4o
    if (OPENAI_API_KEY) {
      try {
        const t = Date.now();
        const r = await callGPT4o(problem.text);
        row.gptMs = Date.now() - t;
        row.gptSubject = r.subject;
        row.gptChapter = r.chapter;
        row.gptDiff    = r.difficulty;
        const ok = checkMatch(r, problem.expected);
        console.log(`  GPT-4o:      ${r.subject} > ${r.chapter} (난이도:${r.difficulty}) ${ok ? '✅' : '❌'}  ${row.gptMs}ms`);
      } catch (e) {
        console.log(`  GPT-4o:      ❌ 실패: ${(e as Error).message}`);
      }
    }

    // GLM-4.7 Flash (한국어 프롬프트)
    if (ZAI_API_KEY) {
      try {
        const t = Date.now();
        const r = await callGLM47Flash(problem.text, false);
        row.glmMs = Date.now() - t;
        row.glmSubject = r.subject;
        row.glmChapter = r.chapter;
        row.glmDiff    = r.difficulty;
        const ok = checkMatch(r, problem.expected);
        console.log(`  GLM-4.7(KO): ${r.subject} > ${r.chapter} (난이도:${r.difficulty}) ${ok ? '✅' : '❌'}  ${row.glmMs}ms`);
      } catch (e) {
        console.log(`  GLM-4.7(KO): ❌ 실패: ${(e as Error).message}`);
      }

      // GLM-4.7 Flash (영어 프롬프트) — 한국어 약점 보완 실험
      try {
        const t = Date.now();
        const r = await callGLM47Flash(problem.text, true);
        const glmEnMs = Date.now() - t;
        const ok = checkMatch(r, problem.expected);
        console.log(`  GLM-4.7(EN): ${r.subject} > ${r.chapter} (난이도:${r.difficulty}) ${ok ? '✅' : '❌'}  ${glmEnMs}ms`);
      } catch (e) {
        console.log(`  GLM-4.7(EN): ❌ 실패: ${(e as Error).message}`);
      }
    }

    results.push(row);

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 500));
  }

  // ── 최종 요약 ──
  console.log('\n' + '='.repeat(70));
  console.log('  📊 최종 요약');
  console.log('='.repeat(70));

  let gptCorrect = 0, glmCorrect = 0;
  let gptTotalMs = 0, glmTotalMs = 0;

  results.forEach(r => {
    if (r.gptSubject) {
      if (checkMatch({ subject: r.gptSubject }, r.expected)) gptCorrect++;
      gptTotalMs += r.gptMs || 0;
    }
    if (r.glmSubject) {
      if (checkMatch({ subject: r.glmSubject }, r.expected)) glmCorrect++;
      glmTotalMs += r.glmMs || 0;
    }
  });

  const total = SAMPLE_PROBLEMS.length;
  console.log(`\n  GPT-4o:       정확도 ${gptCorrect}/${total}  /  평균 ${(gptTotalMs/total).toFixed(0)}ms  /  유료`);
  console.log(`  GLM-4.7 Flash: 정확도 ${glmCorrect}/${total}  /  평균 ${(glmTotalMs/total).toFixed(0)}ms  /  무료`);
  console.log('');

  if (glmCorrect >= gptCorrect) {
    console.log('  ✅ GLM-4.7 Flash가 GPT-4o와 동등하거나 우수합니다. 교체 추천!');
  } else if (glmCorrect >= gptCorrect - 1) {
    console.log('  ⚠️  GLM-4.7 Flash가 1개 차이. 프롬프트 튜닝으로 개선 가능합니다.');
  } else {
    console.log('  ❌ GLM-4.7 Flash 정확도가 낮습니다. 현재 GPT-4o 유지를 권장합니다.');
  }
  console.log('');
}

main().catch(console.error);
