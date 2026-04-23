/**
 * 2단계 분류 실측 테스트 — 실제 Claude 호출 1회로 토큰·비용 측정
 * 사용: npx tsx scripts/test-two-stage-classify.ts
 */

import { buildL1L2Table, buildL3L4Table } from '../src/lib/workflow/mathsecr-prompt';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';

// 샘플: 공통수학1 다항식 문제
const SAMPLE_CONTENT = `최고차항의 계수가 1인 이차식 f(x)-x를 x+2로 나누었을 때의 몫은 Q1(x)이고 f(x)-x+2를 x+1로 나누었을 때의 몫은 Q2(x)이다. Q1(x)와 Q2(x)가 다음 조건을 만족할 때, f(x)를 구하면?
(가) Q2(-2) = f(-1)-1
(나) 3 Q1(-2) = 2 Q2(-2)
(1) x² - 8x + 12
(2) x² - 4x + 8
(3) x² + 6x + 8
(4) x² + 6x + 10
(5) x² + 7x + 10`;

const SUBJECT_CODE = '07'; // 공통수학1
const EXAM_SUBJECT = '공통수학1';
const EXAM_GRADE = '고1';

interface ClaudeUsage {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
}

function calcCost(u: ClaudeUsage, isOpus = false): { input: number; output: number; total: number } {
  // Sonnet 4.6: $3/M in, $15/M out, $3.75/M cache write, $0.30/M cache read
  // Opus 4: $15/M in, $75/M out, $18.75/M cache write, $1.50/M cache read
  const rates = isOpus
    ? { inp: 15, out: 75, cw: 18.75, cr: 1.50 }
    : { inp: 3, out: 15, cw: 3.75, cr: 0.30 };
  const input = ((u.input_tokens || 0) * rates.inp + (u.cache_creation_input_tokens || 0) * rates.cw + (u.cache_read_input_tokens || 0) * rates.cr) / 1_000_000;
  const output = (u.output_tokens || 0) * rates.out / 1_000_000;
  return { input, output, total: input + output };
}

async function callClaude(systemText: string, userText: string, _prefill: string, maxTokens: number, label: string) {
  const start = Date.now();
  // ★ Sonnet 4.6는 assistant prefill 미지원 — user 메시지로 끝내야 함. 프롬프트 강화로 JSON 유도.
  const strictUserText = `${userText}\n\n⚠️ 중요: 응답은 반드시 위 JSON 객체 하나만. 설명·주석·코드블록 마커 금지. 첫 글자는 { 로 시작.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages: [
        { role: 'user', content: strictUserText },
      ],
      temperature: 0.1,
    }),
  });
  const elapsed = Date.now() - start;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${label} HTTP ${res.status}: ${err}`);
  }
  const data = await res.json();
  const usage = data.usage as ClaudeUsage;
  const textBlock = Array.isArray(data.content) ? data.content.find((c: { type: string }) => c.type === 'text') : null;
  const rawText = textBlock?.text || '';
  // 코드블록 마커 있으면 제거
  const combined = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '').trim();
  const cost = calcCost(usage);

  console.log(`\n=== ${label} (${elapsed}ms) ===`);
  console.log(`Usage: input=${usage.input_tokens}, cache_read=${usage.cache_read_input_tokens || 0}, cache_create=${usage.cache_creation_input_tokens || 0}, output=${usage.output_tokens}`);
  console.log(`Cost: input=$${cost.input.toFixed(4)}, output=$${cost.output.toFixed(4)}, total=$${cost.total.toFixed(4)}`);
  console.log(`Response: ${combined.substring(0, 200)}`);

  return { combined, usage, cost, elapsed };
}

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY 없음');
    process.exit(1);
  }

  // 테이블 크기 확인
  const l1l2 = buildL1L2Table(SUBJECT_CODE);
  console.log(`L1L2 table: ${l1l2.length.toLocaleString()} chars`);
  console.log(`L1L2 preview:\n${l1l2.substring(0, 500)}...\n`);

  // ─── Stage 1: L1 + L2 선택 ───
  const s1System = `한국 수학 교육과정 전문가. 수학비서 분류 체계에서 가장 적합한 대단원·중단원을 선택합니다.
반드시 아래 테이블의 "1단계코드" 컬럼 값 중 하나를 그대로 JSON으로만 응답. 설명 텍스트 금지.

참조 테이블 (MS${SUBJECT_CODE} = ${EXAM_SUBJECT}):
${l1l2}`;
  const s1User = `학년: ${EXAM_GRADE}
문제:
${SAMPLE_CONTENT}

위 문제에 가장 적합한 "1단계코드" (대단원+중단원)를 고르세요.
JSON: {"stage1Code":"MS${SUBJECT_CODE}-??-??"}`;

  const s1 = await callClaude(s1System, s1User, `{"stage1Code":"MS${SUBJECT_CODE}-`, 100, 'Stage 1');

  const s1Match = s1.combined.match(/MS(\d{2})-(\d{2})-(\d{2})/);
  if (!s1Match) {
    console.error('Stage 1 코드 추출 실패. 원문:', s1.combined);
    return;
  }
  const [, subj, l1, l2] = s1Match;
  const stage1Code = `MS${subj}-${l1}-${l2}`;

  // ─── Stage 2: L3 + L4 선택 ───
  const l3l4 = buildL3L4Table(subj, l1, l2);
  console.log(`\nL3L4 table (${stage1Code}): ${l3l4.length.toLocaleString()} chars`);

  const s2System = `한국 수학 교육과정 전문가. 이미 결정된 범위(${stage1Code}) 하위에서 최종 소단원·세부유형을 선택합니다.
반드시 아래 테이블의 "최종코드" 값 중 하나를 그대로 JSON으로만 응답.

참조 테이블:
${l3l4}

난이도 (수학비서 1~10): 1~2 개념, 3~4 기본, 5~6 응용, 7~10 고난도. 서술형/합답형 최소 5.`;
  const s2User = `문제:
${SAMPLE_CONTENT}

최종 typeCode와 난이도·인지영역 JSON 응답:
{"typeCode":"${stage1Code}-??-??","difficulty":5,"cognitiveDomain":"CALCULATION","confidence":0.9}`;

  const s2 = await callClaude(s2System, s2User, `{"typeCode":"${stage1Code}-`, 200, 'Stage 2');

  // ─── 총합 ───
  const totalCost = s1.cost.total + s2.cost.total;
  console.log(`\n============================================`);
  console.log(`  총 비용/문항:  $${totalCost.toFixed(4)}`);
  console.log(`  총 소요:      ${s1.elapsed + s2.elapsed}ms`);
  console.log(`  총 입력 토큰:  ${(s1.usage.input_tokens + (s1.usage.cache_read_input_tokens || 0) + (s1.usage.cache_creation_input_tokens || 0)) + (s2.usage.input_tokens + (s2.usage.cache_read_input_tokens || 0) + (s2.usage.cache_creation_input_tokens || 0))}`);
  console.log(`============================================`);
  console.log(`\n※ 기존(251K 단일 호출, uncached): $0.75/문항 입력 + 출력 ≈ $0.76/문항`);
  console.log(`※ 오늘 실제 15문항 = $14 (분류만 기준)`);
  console.log(`\n15문항 환산 (신규 2단계):  $${(totalCost * 15).toFixed(2)}`);
  console.log(`15문항 환산 (기존 1단계):  $11.25 (uncached 풀가격 기준)`);
  console.log(`\n절감률: ${(100 - (totalCost / 0.76) * 100).toFixed(1)}%`);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
