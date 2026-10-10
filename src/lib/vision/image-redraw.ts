// ============================================================================
// 도형 이미지 재작성 — 원본 크롭을 Gemini 이미지 편집 모델에 "똑같이 깨끗하게 다시 그려라"로 넘긴 뒤,
// 비전 모델이 원본과 대조해 통과한 것만 쓴다.
//
// 결정 (2026-10-06, 대표 「이미지 모델이 발전한 지금 꼭 SVG 를 고집해야 하나」 → 6종 실측 비교):
//   Gemini 3.1 Flash Image 편집은 원·좌표·입체·작도(㉠㉡㉢㉣)·산점도 6/6 을 원본에 충실하게 재현.
//   GPT Image 2 는 색칠을 지우고 라벨을 바꾸고 산점도 점을 지어내 탈락. 우리 Claude SVG 는 단순 도형만.
//   대표가 Opal 에서 손으로 하던 "크롭 → 재작성 → 교체"를 프로그램 안으로 들인다. 한 건에 한 번(장당 몇십 원).
//
// 원칙: 결과는 반드시 verifyRedraw 를 거친다 — 라벨·점·선 개수가 다르면 버리고 호출측이 SVG/원본으로 폴백.
//
// 2026-10-06 보강 (부흥중 산점도 보기 ④ 탈락 사례 — 593×544 흐릿한 크롭):
//   1) 흐린 스캔 줄을 "가로 눈금선 6개"로 살려 그림 → 프롬프트에 금지 명시
//   2) 한글 라벨 '가격(원)' 을 '가리(천)' 으로 오기 → 재작성 전에 Flash 가 라벨을 먼저 읽어(readFigureLabels)
//      "라벨은 정확히 이 글자" 로 재작성·검증 양쪽에 넘긴다. 작은 입력(긴 변 < 1000px)은 2배 업스케일해서 보낸다.
//   3) 검증 탈락이면 지적 사항을 피드백으로 넣어 한 번만 다시 그린다(버튼 한 번 = 최대 이미지 2회).
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const GEMINI_VERIFY_MODEL = process.env.GEMINI_VERIFIER_MODEL || 'gemini-3.8-flash';
const MIN_LONG_SIDE = 1000;
// 스캔 줄무늬·그림자는 밝은 회색(실측 부흥중 보기 ④: 줄무늬 행 평균 144~236, 잉크 중앙값 32) → 이 값보다 밝으면 흰색으로.
const CLEAN_WHITE_THRESHOLD = 150;

export const REDRAW_PROMPT =
  'Redraw this Korean middle/high-school math exam figure as a clean, print-ready diagram. ' +
  'Keep EXACTLY the same geometry, points, labels, angle marks, tick marks, dashed lines, shading and numbers as the original. ' +
  'Black thin lines on pure white background, no extra decoration, no title, no watermark. ' +
  'Labels must be crisp and identical to the original (Latin letters, digits, Korean text, circled Korean letters like ㉠㉡㉢). ' +
  'Do not add or remove any element. Keep the original aspect ratio. ' +
  'NEVER add grid lines, tick marks, arrows, plus/minus signs, outlines around dot clouds, or any mark that is not clearly drawn in the original. ' +
  'Faint scan lines, smudges, shadows and paper texture are artifacts: remove them, do not turn them into lines.';

export type RedrawResult =
  | { ok: true; png: Buffer; usage?: Record<string, unknown>; ms: number }
  | { ok: false; error: string; ms: number };

export type VerifyResult = { ok: boolean; score: number; issues: string[]; raw?: string };

async function gemini(model: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`Gemini ${model} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    return json;
  } finally { clearTimeout(t); }
}

function firstText(json: Record<string, unknown>): string {
  const cands = (json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>) || [];
  return String(cands[0]?.content?.parts?.map((p) => p.text || '').join('') || '');
}

/**
 * 모델 입력 준비 (DB 원본은 건드리지 않는다):
 *  - 흰 배경으로 평탄화 + 그레이스케일 + 밝은 회색(> CLEAN_WHITE_THRESHOLD)을 흰색으로 → 스캔 줄무늬·얼룩 제거.
 *    (재작성 모델이 희미한 줄무늬를 "눈금선"으로 살려 그리던 실패의 근본 원인)
 *  - 긴 변 1000px 미만이면 2배(최대 2000px) 업스케일 → 작은 한글 라벨 오독 감소.
 *  실패하면 원본 그대로.
 */
export async function prepareRedrawInput(image: Buffer): Promise<{ png: Buffer; width: number; height: number; upscaled: boolean; cleaned: boolean }> {
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(image).metadata();
    const w0 = meta.width || 0, h0 = meta.height || 0;
    const long = Math.max(w0, h0);
    const scale = long > 0 && long < MIN_LONG_SIDE ? Math.min(2, 2000 / long) : 1;
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    let pipeline = sharp(image).flatten({ background: '#ffffff' }).greyscale();
    if (scale !== 1) pipeline = pipeline.resize(w, h, { kernel: 'lanczos3' });
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i++) if (data[i] > CLEAN_WHITE_THRESHOLD) data[i] = 255;
    const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();
    return { png, width: info.width, height: info.height, upscaled: scale !== 1, cleaned: true };
  } catch {
    return { png: image, width: 0, height: 0, upscaled: false, cleaned: false };
  }
}

/** 원본의 글자 라벨만 먼저 읽는다(Flash, ~1원). 재작성·검증 양쪽의 닻. 실패하면 빈 배열 */
export async function readFigureLabels(image: Buffer, mime: string): Promise<string[]> {
  if (!GEMINI_API_KEY) return [];
  try {
    const json = await gemini(GEMINI_VERIFY_MODEL, {
      contents: [{ parts: [
        { text: '이 수학 도형 이미지에 적힌 글자 라벨을 모두 정확히 읽어 JSON 배열로만 답하라. 축 이름(예 "가격(원)", "생산량(kg)"), 점 이름(A, B, O), 변수(x, y), 숫자, 동그라미 한글(㉠㉡) 을 포함한다. 흐려서 확실하지 않은 글자는 가장 그럴듯한 한국어 단어로 복원하되, 없는 글자를 만들지 마라. 예: ["가격(원)","생산량(kg)","O","x","y"]' },
        { inline_data: { mime_type: mime, data: image.toString('base64') } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
    }, 40_000);
    const m = firstText(json).match(/\[[\s\S]*\]/);
    const arr = m ? (JSON.parse(m[0]) as unknown[]) : [];
    return arr.map(String).map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 30).slice(0, 30);
  } catch {
    return [];
  }
}

function labelsClause(labels: string[]): string {
  return labels.length
    ? `\n\nThe text labels in the original read EXACTLY: ${labels.map((l) => `"${l}"`).join(', ')}. Reproduce them character-for-character (Korean included), in the same positions. Also keep any small axis letters (x, y) or point names that are visible in the original even if not listed. Do not invent any other text.`
    : '';
}

/** 원본 이미지 → 재작성 PNG (Gemini 이미지 편집). labels = 미리 읽은 라벨, feedback = 직전 시도의 검증 지적 */
export async function redrawFigureImage(image: Buffer, mime: string, opts: { labels?: string[]; feedback?: string[]; context?: string } = {}): Promise<RedrawResult> {
  const t0 = Date.now();
  if (!GEMINI_API_KEY) return { ok: false, error: 'GOOGLE_AI_KEY 없음', ms: 0 };
  let prompt = REDRAW_PROMPT + labelsClause(opts.labels || []);
  // ★ 문제 본문을 같이 준다 (2026-10-07 대표 "제미나이 챗은 그냥 그려주는데" — 앱에선 문제를 함께 말해 준다).
  //   식(쌍곡선 x²/4−y²/b²=1)·점 이름(F, F′, P)을 알면 없는 점을 지어내지 않는다. 그리되 "그림에 있는 것만" 원칙은 유지.
  if (opts.context && opts.context.trim()) {
    prompt += `

Context — the problem text this figure belongs to (for understanding only; draw ONLY what is visible in the image, never add elements mentioned in the text but absent from the image):
${opts.context.trim().slice(0, 700)}`;
  }
  if (opts.feedback && opts.feedback.length) {
    prompt += '\n\nA previous attempt was rejected for these differences from the original. Fix every one of them:\n' + opts.feedback.map((s) => `- ${s}`).join('\n');
  }
  try {
    const json = await gemini(GEMINI_IMAGE_MODEL, {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: image.toString('base64') } }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }, 120_000);
    const cands = (json.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { data: string } }> }; finishReason?: string }>) || [];
    for (const p of cands[0]?.content?.parts || []) {
      if (p.inlineData?.data) return { ok: true, png: Buffer.from(p.inlineData.data, 'base64'), usage: json.usageMetadata as Record<string, unknown>, ms: Date.now() - t0 };
    }
    return { ok: false, error: `이미지 없음 (finish=${cands[0]?.finishReason || '?'})`, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

/** 원본 vs 재작성 — 같은 그림인지 비전 모델이 판정. 라벨·점·선·숫자·색칠 비교 */
export async function verifyRedraw(original: Buffer, originalMime: string, redrawn: Buffer, labels: string[] = []): Promise<VerifyResult> {
  if (!GEMINI_API_KEY) return { ok: true, score: 0, issues: ['검증 생략(키 없음)'] };
  const prompt =
    '두 이미지를 비교하라. 첫 번째는 원본 시험지 도형(스캔이라 흐리고 줄무늬 잡티가 있을 수 있다), 두 번째는 다시 그린 것이다. ' +
    '다시 그린 것이 원본과 "수학적으로 같은 그림"인지 판정한다: 점·선·호·곡선의 개수와 위치 관계, 모든 라벨(문자·숫자·동그라미 한글)의 글자와 위치, ' +
    '각 표시·직각 표시·점선·색칠 영역이 같아야 한다. 선 굵기·글꼴·해상도 차이, 그리고 원본의 스캔 줄무늬·얼룩이 사라진 것은 무시한다(그건 잘된 것이다). ' +
    (labels.length ? `참고: 원본에서 미리 읽은 글자 라벨은 ${labels.map((l) => `"${l}"`).join(', ')} 이다(불완전할 수 있다). 이 글자가 다른 글자로 바뀌었으면 반드시 지적하라. 반대로 원본에 흐리게라도 보이는 글자(축 끝의 x, y, 점 이름 등)를 다시 그린 쪽이 또렷하게 쓴 것은 차이가 아니다 — 목록에 없다는 이유로 "추가됐다"고 하지 마라. ` : '') +
    'JSON 만 출력: {"same": true|false, "score": 0~100, "issues": ["다른 점을 한국어로 짧게", ...]}. ' +
    '규칙: same=false 이면 issues 를 반드시 1개 이상 구체적으로 적는다(빈 배열 금지). same=true 이면 issues 는 비우고 score 는 80 이상이어야 한다.';
  try {
    const json = await gemini(GEMINI_VERIFY_MODEL, {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: originalMime, data: original.toString('base64') } },
        { inline_data: { mime_type: 'image/png', data: redrawn.toString('base64') } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
    }, 60_000);
    const text = firstText(json);
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) as { same?: boolean; score?: number; issues?: string[] } : {};
    const score = typeof parsed.score === 'number' ? parsed.score : (parsed.same ? 90 : 0);
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String).filter((s) => s.trim().length > 0) : [];
    // 통과 = "같다" 판정 + (지적 없음 또는 80점 이상). 지적이 하나도 없는데 점수(78 등)만으로 떨어뜨리지 않는다 (2026-10-06 보기 ⑤ 사례).
    const ok = parsed.same === true && (issues.length === 0 || score >= 80);
    return { ok, score, issues, raw: text.slice(0, 300) };
  } catch (e) {
    // 검증 자체가 실패하면 통과시키지 않는다 — 원본 보호
    return { ok: false, score: 0, issues: [`검증 실패: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/**
 * 임의의 후보 그림(예: AI SVG 를 래스터라이즈한 PNG)을 원본과 대조한다 — 재작성 없이 검증만.
 * 원본은 같은 입력 정리(줄무늬 제거·업스케일)를 거치고, 라벨 선독을 참고로 넘긴다. 호출 2회(라벨 1 + 검증 1, 합쳐 몇 원).
 */
export async function verifyCandidate(original: Buffer, mime: string, candidatePng: Buffer): Promise<{ verify: VerifyResult; labels: string[] }> {
  const prepared = await prepareRedrawInput(original);
  const srcMime = prepared.width > 0 ? 'image/png' : mime;
  const labels = await readFigureLabels(prepared.png, srcMime);
  const verify = await verifyRedraw(prepared.png, srcMime, candidatePng, labels);
  return { verify, labels };
}

export type RedrawAndVerifyResult =
  | { ok: true; png: Buffer; verify: VerifyResult; ms: number; attempts: number; labels: string[]; upscaled: boolean }
  | { ok: false; stage: 'redraw' | 'verify'; error: string; verify?: VerifyResult; ms: number; attempts: number; labels: string[]; upscaled: boolean;
      /** ★ 검증 탈락이어도 시도 중 가장 점수 높은 그림 (2026-10-11: 돈 쓴 그림을 버리지 않고 SVG 와 견줘 채택) */
      bestPng?: Buffer; bestVerify?: VerifyResult };

/**
 * 입력 준비(업스케일) → 라벨 읽기 → 재작성 → 검증. 검증 탈락이면 지적 사항을 피드백으로 넣어 **한 번만** 다시 그린다
 * (최대 2회 — 버튼 한 번에 이미지 호출 2회가 상한). 그래도 탈락이면 마지막 사유를 그대로 돌려준다(호출측이 폴백 판단).
 */
export async function redrawAndVerify(image: Buffer, mime: string, opts: { maxAttempts?: number; context?: string } = {}): Promise<RedrawAndVerifyResult> {
  const t0 = Date.now();
  const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 2, 3));
  const prepared = await prepareRedrawInput(image);
  const srcMime = prepared.width > 0 ? 'image/png' : mime;
  const labels = await readFigureLabels(prepared.png, srcMime);
  console.log(`[image-redraw] 입력 ${prepared.width}×${prepared.height}${prepared.upscaled ? ' 업스케일' : ''}${prepared.cleaned ? ' 줄무늬정리' : ''} · 라벨 ${labels.length}개: ${labels.join(' · ').slice(0, 120)}`);
  let feedback: string[] | undefined;
  let last: VerifyResult | undefined;
  let attempts = 0;
  let bestPng: Buffer | undefined;
  let bestVerify: VerifyResult | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const r = await redrawFigureImage(prepared.png, srcMime, { labels, feedback, context: opts.context });
    if (!r.ok) return { ok: false, stage: 'redraw', error: r.error, ms: Date.now() - t0, attempts, labels, upscaled: prepared.upscaled, bestPng, bestVerify };
    const v = await verifyRedraw(prepared.png, srcMime, r.png, labels);
    if (v.ok) return { ok: true, png: r.png, verify: v, ms: Date.now() - t0, attempts, labels, upscaled: prepared.upscaled };
    last = v;
    if (!bestVerify || v.score > bestVerify.score) { bestPng = r.png; bestVerify = v; }
    if (v.issues[0]?.startsWith('검증 실패')) break; // 검증기 자체 오류면 재시도 의미 없음
    feedback = v.issues.length ? v.issues : undefined; // 지적 없이 "다르다"면 피드백 없이 한 번 더 그려 본다
    console.log(`[image-redraw] 검증 탈락(${attempt}/${maxAttempts}, score=${v.score}) → 재시도${feedback ? ' (피드백)' : ''}: ${v.issues.join(' / ').slice(0, 160) || '지적 없음'}`);
  }
  const reason = last?.issues.join(' / ') || `검증기가 다른 점을 짚지 못한 채 불일치 판정 (score ${last?.score ?? 0}) — 한 번 더 눌러 보세요`;
  return { ok: false, stage: 'verify', error: reason, verify: last, ms: Date.now() - t0, attempts, labels, upscaled: prepared.upscaled, bestPng, bestVerify };
}
