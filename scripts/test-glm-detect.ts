/**
 * ============================================================
 * 문제 감지(Detection) 비교 테스트
 * GPT-4o Vision  vs  GLM-4.6V-Flash
 *
 * 사용법:
 *   npx ts-node -e "require('./scripts/test-glm-detect.ts')" 경로/시험지.png
 *   또는
 *   npx ts-node scripts/test-glm-detect.ts 경로/시험지.png
 *
 * 테스트 이미지: PDF 페이지를 PNG로 변환한 파일 (약 2480×3508 권장)
 * ============================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// .env 로드 (프로젝트 루트)
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const ZAI_API_KEY     = process.env.ZAI_API_KEY     || '';  // Z.AI (GLM) API 키

// ─── 동일한 프롬프트 사용 (기존 detect-problems/route.ts 와 동일) ────────────
const DETECT_PROMPT = `당신은 한국 수학 시험지 분석 전문가입니다.

이 이미지는 수학 시험지의 한 페이지입니다. 각 문제의 위치를 정확히 찾아 바운딩 박스를 반환하세요.

규칙:
1. 각 문제는 문제 번호(1, 2, 3... 또는 01, 02, 03...)로 시작합니다
2. 문제 영역에는 문제 텍스트, 수식, 그래프, 그림, 보기, 선택지가 모두 포함되어야 합니다
3. 시험지 헤더(학교명, 과목명, 이름란, 날짜, 시험 제목)는 절대 포함하지 마세요
4. 시험지 하단의 빈 여백, 로고, 페이지 번호도 제외하세요
5. 좌표는 이미지 전체 크기 대비 비율(0~1)로 반환하세요:
   - x: 왼쪽 모서리 위치 (0=이미지 왼쪽 끝, 1=오른쪽 끝)
   - y: 위쪽 모서리 위치 (0=이미지 위쪽 끝, 1=아래쪽 끝)
   - w: 너비 비율
   - h: 높이 비율
6. 2단 레이아웃이면 왼쪽 열 위→아래, 오른쪽 열 위→아래 순서로 반환하세요
7. 바운딩 박스는 해당 문제의 모든 내용을 빠짐없이 포함해야 합니다
8. 선택지(①②③④⑤)가 문제 아래에 있으면 반드시 bbox에 포함하세요

반드시 아래 JSON 형식으로만 응답하세요:
{
  "problems": [
    { "number": 1, "x": 0.03, "y": 0.15, "w": 0.45, "h": 0.20 },
    { "number": 2, "x": 0.03, "y": 0.36, "w": 0.45, "h": 0.25 }
  ]
}`;

interface BBox { number: number; x: number; y: number; w: number; h: number }

// ─── GPT-4o Vision 호출 ────────────────────────────────────────────────────
async function callGPT4oVision(imageBase64: string): Promise<BBox[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: DETECT_PROMPT },
          { type: 'image_url', image_url: { url: imageBase64, detail: 'high' } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`GPT-4o 오류: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.problems || [];
}

// ─── GLM-4.6V-Flash 호출 ──────────────────────────────────────────────────
async function callGLM46V(imageBase64: string): Promise<BBox[]> {
  const res = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ZAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4.6v-flash',  // 무료
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: DETECT_PROMPT },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`GLM-4.6V 오류: ${res.status} ${await res.text()}`);
  const data = await res.json();
  let content = data.choices[0].message.content as string;

  // GLM은 json_object 모드가 없으므로 직접 파싱
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('GLM 응답에서 JSON 파싱 실패:\n' + content);
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.problems || [];
}

// ─── 결과 출력 ────────────────────────────────────────────────────────────
function printResults(label: string, bboxes: BBox[], elapsed: number) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}  (${elapsed}ms)`);
  console.log('='.repeat(60));
  if (bboxes.length === 0) {
    console.log('  ⚠️  문제를 감지하지 못했습니다.');
    return;
  }
  console.log(`  감지된 문제 수: ${bboxes.length}개\n`);
  bboxes.forEach(b => {
    console.log(
      `  문제 ${String(b.number).padStart(2)}  |` +
      `  x=${b.x.toFixed(3)}  y=${b.y.toFixed(3)}  w=${b.w.toFixed(3)}  h=${b.h.toFixed(3)}`
    );
  });
}

// ─── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('사용법: npx ts-node scripts/test-glm-detect.ts <이미지파일.png>');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`파일을 찾을 수 없습니다: ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  const imageBase64 = `data:image/${mime};base64,${imageBuffer.toString('base64')}`;

  console.log(`\n📄 테스트 이미지: ${path.basename(imagePath)}`);
  console.log(`   크기: ${(imageBuffer.length / 1024).toFixed(1)} KB`);

  // ── GPT-4o 테스트 ──
  let gptResult: BBox[] = [];
  let gptElapsed = 0;
  if (OPENAI_API_KEY) {
    console.log('\n🤖 GPT-4o Vision 호출 중...');
    const t = Date.now();
    try {
      gptResult = await callGPT4oVision(imageBase64);
      gptElapsed = Date.now() - t;
    } catch (e) {
      console.error('  GPT-4o 실패:', (e as Error).message);
    }
  } else {
    console.log('\n⚠️  OPENAI_API_KEY 없음 → GPT-4o 테스트 건너뜀');
  }

  // ── GLM-4.6V 테스트 ──
  let glmResult: BBox[] = [];
  let glmElapsed = 0;
  if (ZAI_API_KEY) {
    console.log('\n🔮 GLM-4.6V-Flash 호출 중...');
    const t = Date.now();
    try {
      glmResult = await callGLM46V(imageBase64);
      glmElapsed = Date.now() - t;
    } catch (e) {
      console.error('  GLM-4.6V 실패:', (e as Error).message);
    }
  } else {
    console.log('\n⚠️  ZAI_API_KEY 없음 → GLM 테스트 건너뜀');
    console.log('    Z.AI API 키 발급: https://bigmodel.cn/ 또는 https://z.ai');
  }

  // ── 결과 출력 ──
  if (gptResult.length > 0)  printResults('GPT-4o Vision', gptResult, gptElapsed);
  if (glmResult.length > 0)  printResults('GLM-4.6V-Flash (무료)', glmResult, glmElapsed);

  // ── 비교 요약 ──
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  📊 비교 요약');
  console.log('─'.repeat(60));
  console.log(`  GPT-4o:       ${gptResult.length}개 감지  /  ${gptElapsed}ms`);
  console.log(`  GLM-4.6V:     ${glmResult.length}개 감지  /  ${glmElapsed}ms`);

  // 감지 수 일치 여부
  if (gptResult.length > 0 && glmResult.length > 0) {
    if (gptResult.length === glmResult.length) {
      console.log(`\n  ✅ 두 모델 모두 ${gptResult.length}개 감지 일치`);
    } else {
      console.log(`\n  ⚠️  감지 수 불일치: GPT-4o=${gptResult.length} vs GLM=${glmResult.length}`);
    }
  }
  console.log('');
}

main().catch(console.error);
