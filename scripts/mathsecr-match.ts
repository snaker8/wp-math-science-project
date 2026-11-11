/**
 * 수학비서 문항 ↔ 우리 문제 대조용 공용 헬퍼 (해설 백필 스크립트 2종이 같이 쓴다).
 */
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function loadSupabase(): SupabaseClient {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf-8').split('\n')
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }),
  ) as Record<string, string>;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function parseArgs(): Record<string, string> {
  return Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)(?:=(.*))?$/);
      return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
    }),
  ) as Record<string, string>;
}

export interface DbProblem {
  id: string; source_name: string | null; source_number: number | null;
  content_latex: string | null; solution_latex: string | null; answer_json: Record<string, unknown> | null;
}

export const normAns = (s: unknown) => String(s ?? '').replace(/\\left|\\right|\\[,;!]|[\s$]/g, '').replace(/\\d?frac/g, '\\frac');

/** 본문 대조용 정규화 — 마크업·공백·보기·그림 마커·그림 데이터 찌꺼기를 걷어 글자만 */
export const normText = (s: string) =>
  s.replace(/[A-Za-z0-9+/=]{20,}/g, '')                 // 그림 데이터 찌꺼기(base64 런)
    .replace(/[①②③④⑤][\s\S]*$/, '')                  // 보기부터 끝 — 우리 쪽은 보기를 따로 저장한다
    .replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/g, ' ')
    .replace(/\[도형\]|!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\\left|\\right|\\displaystyle|\\[a-zA-Z]+|[{}$\\^_\s`~,.()]/g, '');

/** 두 글자 묶음(bigram) Dice 유사도 0~1 — 짧은 쪽 길이(최대 80자)만큼의 앞부분끼리 비교. 6자 미만이면 0. */
export function similarity(a: string, b: string): number {
  let x = normText(a), y = normText(b);
  const L = Math.min(x.length, y.length, 80);
  if (L < 6) return 0;
  x = x.slice(0, L); y = y.slice(0, L);
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let inter = 0; for (const [g, n] of gx) inter += Math.min(n, gy.get(g) || 0);
  return (2 * inter) / Math.max(1, 2 * (L - 1));
}
export const SIM_OK = 0.6;

export async function fetchByDbId(sb: SupabaseClient, dbId: number): Promise<DbProblem[]> {
  const { data, error } = await sb
    .from('problems')
    .select('id, source_name, source_number, content_latex, solution_latex, answer_json')
    .is('deleted_at', null)
    .like('source_name', `%__db-${dbId}.hml`)
    .limit(1000);
  if (error) throw new Error(`problems ${dbId}: ${error.message}`);
  return (data || []) as DbProblem[];
}

/** dataURL 그림 → Storage(source-files/problem-crops/hml-sol-{problemId}/{i}.ext) → public URL */
export function solutionUploader(sb: SupabaseClient, problemId: string, onFail: () => void) {
  return async (dataUrl: string, gi: number): Promise<string | null> => {
    try {
      const mime = dataUrl.match(/^data:(image\/[\w.+-]+);base64,/)?.[1] || 'image/png';
      const ext = mime === 'image/jpeg' ? 'jpg' : (mime.split('/')[1] || 'png');
      const buffer = Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
      const key = `problem-crops/hml-sol-${problemId}/${gi}.${ext}`;
      const { error } = await sb.storage.from('source-files').upload(key, buffer, { contentType: mime, upsert: true });
      if (error) { onFail(); return null; }
      return sb.storage.from('source-files').getPublicUrl(key).data?.publicUrl ?? null;
    } catch { onFail(); return null; }
  };
}
