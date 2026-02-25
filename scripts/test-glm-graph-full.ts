/**
 * ============================================================
 * 그래프 완전 재현 테스트
 * GLM-4.6V-Flash: 이미지 → 그래프의 모든 시각 요소를 코드로 재현
 *
 * 핵심: 수식만 뽑는 게 아니라, 그래프 자체를 그대로 그릴 수 있는 코드 생성
 *
 * 사용법:
 *   npx ts-node --project scripts/tsconfig.json scripts/test-glm-graph-full.ts <이미지.png>
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const ZAI_API_KEY = process.env.ZAI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ─── 프롬프트: 그래프 완전 재현 (SVG 코드) ────────────────────────────────
const FULL_GRAPH_SVG_PROMPT = `당신은 수학 시험지 그래프를 SVG 코드로 정확히 재현하는 전문가입니다.

이 이미지는 한국 수학 시험지에 포함된 그래프입니다.
이미지의 그래프를 **완전히 똑같이** 재현하는 SVG 코드를 작성하세요.

반드시 포함해야 할 요소:
1. 좌표축 (x축, y축) — 화살표 포함
2. 원점 O 라벨
3. 모든 곡선/직선 — 실제 보이는 대로 path로 그리기
4. 모든 점(A, B, C 등) — 위치와 라벨
5. 모든 텍스트 라벨 (축 이름, 점 이름, 좌표 등)
6. 눈금이 있으면 눈금 표시
7. 점선/실선/굵기 차이가 있으면 반영
8. 색칠된 영역이 있으면 fill로 표현

SVG 코드 규칙:
- viewBox="0 0 400 400" (400x400 기본)
- 수학 좌표계: 위가 +y (transform 사용)
- 곡선은 <path d="M ... Q ... C ..."> 사용
- 폰트: font-family="serif"
- 색상: 검정 기본, 필요시 회색/빨강 사용

반드시 아래 형식으로 응답하세요:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  ... 전체 SVG 코드 ...
</svg>
\`\`\`

SVG 코드만 출력하세요. 설명은 필요 없습니다.`;

// ─── 프롬프트: Desmos 완전 재현 ──────────────────────────────────────────
const FULL_GRAPH_DESMOS_PROMPT = `당신은 수학 시험지 그래프를 Desmos Calculator로 정확히 재현하는 전문가입니다.

이 이미지는 한국 수학 시험지에 포함된 그래프입니다.
이미지에 보이는 **모든 시각 요소**를 Desmos 수식 목록으로 재현하세요.

반드시 포함해야 할 요소:
1. 모든 곡선/직선의 방정식 (범위 제한 포함)
2. 모든 표시된 점 — (x, y) 형태로
3. 점의 라벨 표시가 필요하면 주석으로 기록
4. 선분이 있으면 매개변수 또는 범위 제한으로 표현
5. 색칠된 영역이 있으면 부등식으로 표현
6. 축 범위 설정값

주의: 문제 텍스트에 주어진 수식을 읽는 것이 아니라,
그래프에 실제로 **그려져 있는 모든 것**을 Desmos 수식으로 만드세요.
예: 직선이 보이면 그 직선의 방정식을, 삼각형이 보이면 세 변의 선분 방정식을 만드세요.

반드시 아래 JSON 형식으로 응답하세요:
{
  "description": "그래프에 대한 설명",
  "visual_elements": [
    {"type": "곡선/직선/점/선분/영역", "description": "무엇인지 설명"}
  ],
  "desmos_expressions": [
    {"expr": "y = ...", "label": "포물선", "note": ""},
    {"expr": "(2, 0)", "label": "점 B", "note": "x절편"},
    {"expr": "y = mx + b \\\\{x_1 \\\\le x \\\\le x_2\\\\}", "label": "선분 BC", "note": ""}
  ],
  "axis_settings": {
    "x_min": -2, "x_max": 10,
    "y_min": -5, "y_max": 8
  }
}`;

// ─── API 호출 ──────────────────────────────────────────────────────────────
async function callVisionAPI(imageBase64: string, prompt: string, model: string, apiUrl: string, apiKey: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
          ],
        }],
        temperature: 0.1,
        max_tokens: 4000,
        ...(model.includes('glm') ? { thinking: { type: 'disabled' } } : {}),
      }),
    });

    if (res.status === 429) {
      const wait = attempt * 10000;
      console.log(`    ⏳ Rate limit → ${wait/1000}초 대기 (${attempt}/3)...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);

    const data = await res.json();
    return data.choices[0].message.content as string;
  }
  throw new Error('최대 재시도 초과');
}

// ─── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('사용법: npx ts-node --project scripts/tsconfig.json scripts/test-glm-graph-full.ts <이미지.png>');
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
  const outputDir = path.dirname(imagePath);
  const baseName = path.basename(imagePath, path.extname(imagePath));

  console.log(`\n🎨 그래프 완전 재현 테스트`);
  console.log(`   이미지: ${path.basename(imagePath)} (${(imageBuffer.length/1024).toFixed(1)} KB)`);

  // ── Test 1: GLM-4.6V → SVG ──
  if (ZAI_API_KEY) {
    console.log('\n━━━ Test 1: GLM-4.6V-Flash → SVG 코드 ━━━');
    try {
      const t = Date.now();
      const raw = await callVisionAPI(
        imageBase64, FULL_GRAPH_SVG_PROMPT,
        'glm-4.6v-flash',
        'https://api.z.ai/api/paas/v4/chat/completions',
        ZAI_API_KEY
      );
      const elapsed = Date.now() - t;

      // SVG 추출
      const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const svgPath = path.join(outputDir, `${baseName}_glm_result.svg`);
        fs.writeFileSync(svgPath, svgMatch[0], 'utf-8');
        console.log(`  ✅ SVG 생성 완료 (${elapsed}ms)`);
        console.log(`  📁 저장: ${svgPath}`);
        console.log(`  → 브라우저에서 열어서 원본과 비교하세요!`);
      } else {
        console.log(`  ⚠️ SVG 태그 없음. Raw 응답:`);
        console.log(raw.slice(0, 500));
      }
    } catch (e) {
      console.error(`  ❌ GLM-4.6V 실패:`, (e as Error).message);
    }
  }

  // ── Test 2: GLM-4.6V → Desmos (완전 재현) ──
  if (ZAI_API_KEY) {
    console.log('\n━━━ Test 2: GLM-4.6V-Flash → Desmos 완전 재현 ━━━');
    try {
      const t = Date.now();
      const raw = await callVisionAPI(
        imageBase64, FULL_GRAPH_DESMOS_PROMPT,
        'glm-4.6v-flash',
        'https://api.z.ai/api/paas/v4/chat/completions',
        ZAI_API_KEY
      );
      const elapsed = Date.now() - t;

      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) ||
                        raw.match(/```\s*([\s\S]*?)```/) ||
                        raw.match(/(\{[\s\S]*\})/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        console.log(`  ✅ Desmos 분석 완료 (${elapsed}ms)`);
        console.log(`\n  📝 설명: ${result.description}`);

        if (result.visual_elements?.length) {
          console.log(`\n  👁️ 감지된 시각 요소 (${result.visual_elements.length}개):`);
          result.visual_elements.forEach((v: any, i: number) => {
            console.log(`    ${i+1}. [${v.type}] ${v.description}`);
          });
        }

        if (result.desmos_expressions?.length) {
          console.log(`\n  📊 Desmos 수식 (${result.desmos_expressions.length}개):`);
          result.desmos_expressions.forEach((d: any, i: number) => {
            const note = d.note ? ` — ${d.note}` : '';
            console.log(`    ${i+1}. ${d.expr}  [${d.label}]${note}`);
          });
        }

        if (result.axis_settings) {
          const a = result.axis_settings;
          console.log(`\n  📐 축 범위: x=[${a.x_min}, ${a.x_max}] y=[${a.y_min}, ${a.y_max}]`);
        }

        // JSON 저장
        const jsonPath = path.join(outputDir, `${baseName}_desmos_result.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`\n  📁 저장: ${jsonPath}`);
      } else {
        console.log(`  ⚠️ JSON 파싱 실패. Raw:`);
        console.log(raw.slice(0, 500));
      }
    } catch (e) {
      console.error(`  ❌ GLM-4.6V Desmos 실패:`, (e as Error).message);
    }
  }

  // ── Test 3: GPT-4o Vision → SVG (비교) ──
  if (OPENAI_API_KEY) {
    console.log('\n━━━ Test 3: GPT-4o Vision → SVG 코드 (비교) ━━━');
    try {
      const t = Date.now();
      const raw = await callVisionAPI(
        imageBase64, FULL_GRAPH_SVG_PROMPT,
        'gpt-4o',
        'https://api.openai.com/v1/chat/completions',
        OPENAI_API_KEY
      );
      const elapsed = Date.now() - t;

      const svgMatch = raw.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const svgPath = path.join(outputDir, `${baseName}_gpt_result.svg`);
        fs.writeFileSync(svgPath, svgMatch[0], 'utf-8');
        console.log(`  ✅ SVG 생성 완료 (${elapsed}ms)`);
        console.log(`  📁 저장: ${svgPath}`);
        console.log(`  → 브라우저에서 열어서 GLM 결과와 비교하세요!`);
      } else {
        console.log(`  ⚠️ SVG 태그 없음. Raw 응답:`);
        console.log(raw.slice(0, 500));
      }
    } catch (e) {
      console.error(`  ❌ GPT-4o 실패:`, (e as Error).message);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  결과 파일들을 브라우저에서 열어 원본 이미지와 비교하세요!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
