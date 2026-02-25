/**
 * ============================================================
 * 그래프/표 재현 테스트
 * GLM-4.6V-Flash (이미지 → Desmos 수식)
 * GLM-4.7 Flash  (수식 수학 검증 + 보정)
 *
 * 사용법:
 *   npx ts-node scripts/test-glm-graph.ts <그래프이미지.png> [LaTeX수식]
 *
 * 예시:
 *   npx ts-node scripts/test-glm-graph.ts graph.png "y=-x^2+8x-12"
 *
 * LaTeX 수식을 생략하면 GLM-4.6V 단독으로만 테스트합니다.
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';

// ─── GLM-4.6V-Flash: 이미지 → Desmos 수식 생성 ────────────────────────────
const GRAPH_TO_DESMOS_PROMPT = `당신은 수학 그래프 분석 전문가입니다.

이 이미지는 한국 수학 시험지에 포함된 그래프 또는 표입니다.

아래 규칙에 따라 분석하세요:
1. 이미지에서 보이는 함수/곡선/직선을 파악하세요
2. x축, y축의 범위와 눈금을 읽으세요
3. 특징점(절편, 꼭짓점, 극값, 점근선)을 찾으세요
4. Desmos 계산기(https://www.desmos.com/calculator)에서 바로 사용 가능한 수식으로 변환하세요

Desmos 수식 형식 예시:
- 함수: y = -x^{2} + 8x - 12
- 점: (2, 0)
- 수직선: x = 4
- 범위 제한: y = x^{2} \\{0 \\le x \\le 5\\}

반드시 아래 JSON 형식으로만 응답하세요:
{
  "graph_type": "이차함수 포물선",
  "detected_features": {
    "x_range": [-2, 10],
    "y_range": [-5, 8],
    "key_points": [{"label": "꼭짓점", "x": 4, "y": 4}, {"label": "x절편", "x": 2, "y": 0}]
  },
  "desmos_expressions": [
    "y = -x^{2} + 8x - 12",
    "(2, 0)",
    "(6, 0)",
    "(4, 4)"
  ],
  "confidence": 0.85,
  "notes": "이미지에서 읽기 어려운 부분이 있으면 여기에 기록"
}`;

// ─── GLM-4.7 Flash: 수학 검증 + 보정 ─────────────────────────────────────
function buildVerifyPrompt(latexEquation: string, desmosExpressions: string[]): string {
  return `당신은 수학 검증 전문가입니다.

아래는 수학 시험 문제의 정보입니다:

[문제의 LaTeX 수식]
${latexEquation}

[AI가 이미지를 보고 생성한 Desmos 수식들]
${desmosExpressions.map((e, i) => `${i + 1}. ${e}`).join('\n')}

검증 작업:
1. 위 LaTeX 수식을 수학적으로 분석하세요 (절편, 꼭짓점, 극값 등 계산)
2. Desmos 수식들이 수학적으로 정확한지 검증하세요
3. 오류가 있으면 수정된 Desmos 수식을 제시하세요
4. Desmos에서 그래프를 올바르게 표시하기 위한 최종 수식 목록을 제공하세요

반드시 아래 JSON 형식으로만 응답하세요:
{
  "math_analysis": {
    "function": "수식 설명",
    "x_intercepts": [2, 6],
    "y_intercept": -12,
    "vertex": {"x": 4, "y": 4},
    "domain": "실수 전체"
  },
  "verification": [
    {"expression": "y = -x^{2} + 8x - 12", "correct": true, "issue": null},
    {"expression": "(2, 0)", "correct": true, "issue": null}
  ],
  "corrected_desmos_expressions": [
    "y = -x^{2} + 8x - 12",
    "(2, 0)",
    "(6, 0)",
    "(4, 4)"
  ],
  "accuracy_score": 0.95
}`;
}

// ─── API 호출 함수들 ───────────────────────────────────────────────────────
async function callGLM46VGraph(imageBase64: string): Promise<any> {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.6v-flash',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: GRAPH_TO_DESMOS_PROMPT },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`GLM-4.6V 오류: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices[0].message.content as string;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GLM-4.6V 응답 JSON 파싱 실패:\n' + content);
  return JSON.parse(jsonMatch[0]);
}

async function callGLM47FlashVerify(latexEquation: string, desmosExpressions: string[]): Promise<any> {
  const prompt = buildVerifyPrompt(latexEquation, desmosExpressions);
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.7-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`GLM-4.7 오류: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices[0].message.content as string;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GLM-4.7 응답 JSON 파싱 실패:\n' + content);
  return JSON.parse(jsonMatch[0]);
}

// ─── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const imagePath    = process.argv[2];
  const latexEquation = process.argv[3]; // 선택사항

  if (!imagePath) {
    console.error('사용법: npx ts-node scripts/test-glm-graph.ts <이미지.png> [LaTeX수식]');
    console.error('예시:   npx ts-node scripts/test-glm-graph.ts graph.png "y=-x^2+8x-12"');
    process.exit(1);
  }

  if (!ZAI_API_KEY) {
    console.error('\n❌ ZAI_API_KEY가 .env에 없습니다.');
    console.error('   Z.AI API 키 발급: https://bigmodel.cn/ → API Keys');
    console.error('   .env에 추가: ZAI_API_KEY=your_key_here');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`파일 없음: ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  const imageBase64 = `data:image/${mime};base64,${imageBuffer.toString('base64')}`;

  console.log(`\n📊 그래프 재현 테스트`);
  console.log(`   이미지: ${path.basename(imagePath)} (${(imageBuffer.length/1024).toFixed(1)} KB)`);
  if (latexEquation) {
    console.log(`   LaTeX:  ${latexEquation}`);
  }

  // ── Step 1: GLM-4.6V로 이미지 → Desmos 수식 ──
  console.log('\n🔮 Step 1: GLM-4.6V-Flash — 이미지 분석 중...');
  const t1 = Date.now();
  let graphResult: any;
  try {
    graphResult = await callGLM46VGraph(imageBase64);
    const e1 = Date.now() - t1;

    console.log(`\n  ✅ GLM-4.6V 결과 (${e1}ms):`);
    console.log(`  그래프 유형: ${graphResult.graph_type || '알 수 없음'}`);
    console.log(`  신뢰도: ${((graphResult.confidence || 0) * 100).toFixed(0)}%`);

    if (graphResult.detected_features) {
      const f = graphResult.detected_features;
      if (f.key_points?.length) {
        console.log('  주요 점:');
        f.key_points.forEach((p: any) => {
          console.log(`    - ${p.label}: (${p.x}, ${p.y})`);
        });
      }
    }

    if (graphResult.desmos_expressions?.length) {
      console.log('\n  생성된 Desmos 수식:');
      graphResult.desmos_expressions.forEach((e: string, i: number) => {
        console.log(`    ${i + 1}. ${e}`);
      });
    }

    if (graphResult.notes) {
      console.log(`\n  📝 노트: ${graphResult.notes}`);
    }
  } catch (e) {
    console.error('  ❌ GLM-4.6V 실패:', (e as Error).message);
    process.exit(1);
  }

  // ── Step 2: LaTeX 수식이 있으면 GLM-4.7 Flash로 검증 ──
  if (latexEquation && graphResult.desmos_expressions?.length) {
    console.log('\n🧮 Step 2: GLM-4.7 Flash — 수학 검증 중...');
    const t2 = Date.now();
    try {
      const verifyResult = await callGLM47FlashVerify(latexEquation, graphResult.desmos_expressions);
      const e2 = Date.now() - t2;

      console.log(`\n  ✅ GLM-4.7 검증 결과 (${e2}ms):`);

      if (verifyResult.math_analysis) {
        const a = verifyResult.math_analysis;
        console.log('  수학 분석:');
        if (a.x_intercepts) console.log(`    x절편: ${JSON.stringify(a.x_intercepts)}`);
        if (a.y_intercept !== undefined) console.log(`    y절편: ${a.y_intercept}`);
        if (a.vertex) console.log(`    꼭짓점: (${a.vertex.x}, ${a.vertex.y})`);
      }

      if (verifyResult.verification?.length) {
        console.log('\n  수식 검증:');
        verifyResult.verification.forEach((v: any) => {
          const icon = v.correct ? '✅' : '❌';
          const issue = v.issue ? `  → ${v.issue}` : '';
          console.log(`    ${icon} ${v.expression}${issue}`);
        });
      }

      if (verifyResult.corrected_desmos_expressions?.length) {
        console.log('\n  ✨ 최종 검증된 Desmos 수식:');
        verifyResult.corrected_desmos_expressions.forEach((e: string, i: number) => {
          console.log(`    ${i + 1}. ${e}`);
        });
      }

      const score = ((verifyResult.accuracy_score || 0) * 100).toFixed(0);
      console.log(`\n  정확도 점수: ${score}%`);
    } catch (e) {
      console.error('  ❌ GLM-4.7 검증 실패:', (e as Error).message);
    }
  } else if (!latexEquation) {
    console.log('\n  💡 LaTeX 수식을 인자로 전달하면 GLM-4.7 수학 검증도 테스트할 수 있습니다.');
  }

  // ── Desmos 링크 생성 ──
  if (graphResult.desmos_expressions?.length) {
    const desmosUrl = 'https://www.desmos.com/calculator';
    console.log(`\n🔗 Desmos에서 직접 확인:`);
    console.log(`   ${desmosUrl}`);
    console.log('   위 수식들을 복사해서 붙여넣으세요\n');
  }
}

main().catch(console.error);
