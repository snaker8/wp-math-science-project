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
// ============================================================================

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';
export const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const GEMINI_VERIFY_MODEL = process.env.GEMINI_VERIFIER_MODEL || 'gemini-3.8-flash';

export const REDRAW_PROMPT =
  'Redraw this Korean middle/high-school math exam figure as a clean, print-ready diagram. ' +
  'Keep EXACTLY the same geometry, points, labels, angle marks, tick marks, dashed lines, shading and numbers as the original. ' +
  'Black thin lines on pure white background, no extra decoration, no title, no watermark. ' +
  'Labels must be crisp and identical to the original (Latin letters, digits, Korean text, circled Korean letters like ㉠㉡㉢). ' +
  'Do not add or remove any element. Keep the original aspect ratio.';

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

/** 원본 이미지 → 재작성 PNG (Gemini 이미지 편집) */
export async function redrawFigureImage(image: Buffer, mime: string): Promise<RedrawResult> {
  const t0 = Date.now();
  if (!GEMINI_API_KEY) return { ok: false, error: 'GOOGLE_AI_KEY 없음', ms: 0 };
  try {
    const json = await gemini(GEMINI_IMAGE_MODEL, {
      contents: [{ parts: [{ text: REDRAW_PROMPT }, { inline_data: { mime_type: mime, data: image.toString('base64') } }] }],
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
export async function verifyRedraw(original: Buffer, originalMime: string, redrawn: Buffer): Promise<VerifyResult> {
  if (!GEMINI_API_KEY) return { ok: true, score: 0, issues: ['검증 생략(키 없음)'] };
  const prompt =
    '두 이미지를 비교하라. 첫 번째는 원본 시험지 도형, 두 번째는 다시 그린 것이다. ' +
    '다시 그린 것이 원본과 "수학적으로 같은 그림"인지 판정한다: 점·선·호·곡선의 개수와 위치 관계, 모든 라벨(문자·숫자·동그라미 한글)의 글자와 위치, ' +
    '각 표시·직각 표시·점선·색칠 영역이 같아야 한다. 선 굵기·글꼴·해상도 차이는 무시한다. ' +
    'JSON 만 출력: {"same": true|false, "score": 0~100, "issues": ["다른 점을 한국어로 짧게", ...]}';
  try {
    const json = await gemini(GEMINI_VERIFY_MODEL, {
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: originalMime, data: original.toString('base64') } },
        { inline_data: { mime_type: 'image/png', data: redrawn.toString('base64') } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 400, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
    }, 60_000);
    const text = String(((json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>) || [])[0]?.content?.parts?.[0]?.text || '');
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) as { same?: boolean; score?: number; issues?: string[] } : {};
    const score = typeof parsed.score === 'number' ? parsed.score : (parsed.same ? 90 : 0);
    return { ok: parsed.same === true && score >= 80, score, issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [], raw: text.slice(0, 300) };
  } catch (e) {
    // 검증 자체가 실패하면 통과시키지 않는다 — 원본 보호
    return { ok: false, score: 0, issues: [`검증 실패: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** 재작성 + 검증 한 번에. 실패 사유를 그대로 돌려준다(호출측이 폴백 판단). */
export async function redrawAndVerify(image: Buffer, mime: string): Promise<
  | { ok: true; png: Buffer; verify: VerifyResult; ms: number }
  | { ok: false; stage: 'redraw' | 'verify'; error: string; verify?: VerifyResult; ms: number }
> {
  const t0 = Date.now();
  const r = await redrawFigureImage(image, mime);
  if (!r.ok) return { ok: false, stage: 'redraw', error: r.error, ms: Date.now() - t0 };
  const v = await verifyRedraw(image, mime, r.png);
  if (!v.ok) return { ok: false, stage: 'verify', error: v.issues.join(' / ') || `score ${v.score}`, verify: v, ms: Date.now() - t0 };
  return { ok: true, png: r.png, verify: v, ms: Date.now() - t0 };
}
