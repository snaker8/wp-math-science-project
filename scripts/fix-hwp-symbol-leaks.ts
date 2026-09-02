/**
 * 한글 수식 기호 누락분 일괄 교정 — 이미 자산화된 문제 본문/보기/해설
 * ============================================================================
 *
 * ★ 기본은 드라이런. 실제로 쓰려면 `--commit`.
 * ★ AI 안 쓴다. 문자열 치환만 — 비용 0.
 *
 * 배경 (2026-09-02, 사대부고 23-1-2-M 수학하에서 발견):
 *   한글(HWP) 수식은 ∩·∘·∅ 를 SMALLINTER·CIRC·EMPTYSET 이라는 이름으로 내보낸다.
 *   변환표(`hangul-equation.ts`)에 이 이름들이 빠져 있어 **글자 그대로 화면에 샜다.**
 *     "A SMALLINTER B" · "f CIRC f" · "EMPTY SET" · "X - > X"
 *   변환표는 고쳤다(앞으로 올리는 건 정상). 이 스크립트는 **이미 쌓인 것**을 메운다.
 *
 * ★ 반드시 지킬 것 — 안전쪽으로 기운다
 *   (1) 이미 백슬래시가 붙은 것(`\circ`)은 절대 두 번 안 바꾼다.
 *   (2) 낱말 속 철자(circle, emptysets)는 안 건드린다 — 뒤 경계 `(?![A-Za-z])`.
 *   (3) 바뀐 게 없으면 UPDATE 를 아예 안 보낸다.
 *   (4) 치환 규칙은 앱 변환표와 같은 뜻이어야 한다. 두 벌이 갈라지면 또 샌다.
 *
 * 실행:
 *   npx tsx scripts/fix-hwp-symbol-leaks.ts
 *   npx tsx scripts/fix-hwp-symbol-leaks.ts --commit
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

/** 앞에 백슬래시가 없고, 뒤에 글자가 안 붙은 맨 토큰만 잡는다. */
const RULES: Array<[RegExp, string, string]> = [
  [/(?<![\\A-Za-z])smallinter(?![A-Za-z])/gi,       '\\cap ',      'SMALLINTER → ∩'],
  [/(?<![\\A-Za-z])smallunion(?![A-Za-z])/gi,       '\\cup ',      'SMALLUNION → ∪'],
  [/(?<![\\A-Za-z])smalldifference(?![A-Za-z])/gi,  '\\setminus ', 'SMALLDIFFERENCE → ∖'],
  [/(?<![\\A-Za-z])emptyset(?![A-Za-z])/gi,         '\\emptyset ', 'EMPTYSET → ∅'],
  [/(?<![\\A-Za-z])circ(?![A-Za-z])/gi,             '\\circ ',     'CIRC → ∘'],
  [/<->/g,                                          '\\leftrightarrow ', '<-> → ↔'],
  [/->/g,                                           '\\to ',       '-> → →'],
];

const stats = new Map<string, number>();

export function fixSymbols(text: string | null): string | null {
  if (!text) return text;
  let out = text;
  for (const [re, rep, label] of RULES) {
    const before = out;
    out = out.replace(re, rep);
    if (out !== before) stats.set(label, (stats.get(label) ?? 0) + 1);
  }
  // 치환으로 생긴 겹공백만 정리 (원문 줄바꿈은 보존)
  return out.replace(/[ \t]{2,}/g, ' ');
}

/** answer_json.choices 안의 보기 텍스트도 같이 고친다. */
function fixAnswerJson(aj: unknown): { next: unknown; changed: boolean } {
  if (!aj || typeof aj !== 'object') return { next: aj, changed: false };
  const obj = aj as Record<string, unknown>;
  if (!Array.isArray(obj.choices)) return { next: aj, changed: false };
  let changed = false;
  const choices = obj.choices.map((c) => {
    if (typeof c !== 'string') return c;
    const f = fixSymbols(c);
    if (f !== c) changed = true;
    return f;
  });
  return changed ? { next: { ...obj, choices }, changed: true } : { next: aj, changed: false };
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 후보만 좁혀 읽는다 (전 문제 37,243건 훑을 필요 없음)
  const LIKE = 'content_latex.ilike.%SMALLINTER%,content_latex.ilike.%SMALLUNION%,'
    + 'content_latex.ilike.%SMALLDIFFERENCE%,content_latex.ilike.%EMPTYSET%,'
    + 'content_latex.ilike.%CIRC%,content_latex.ilike.%->%,'
    + 'solution_latex.ilike.%SMALLINTER%,solution_latex.ilike.%EMPTYSET%,'
    + 'solution_latex.ilike.%CIRC%,solution_latex.ilike.%->%';

  type Row = { id: string; content_latex: string | null; solution_latex: string | null; answer_json: unknown };
  let rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('problems')
      .select('id, content_latex, solution_latex, answer_json')
      .is('deleted_at', null)
      .or(LIKE)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data as Row[]);
    if (data.length < 1000) break;
  }

  console.log(COMMIT ? '★ 실제 교정' : '드라이런 (쓰지 않음)');
  console.log(`후보 ${rows.length}건 조회\n`);

  const patches: Array<{ id: string; patch: Record<string, unknown>; before: string; after: string }> = [];
  for (const r of rows) {
    const patch: Record<string, unknown> = {};
    const c = fixSymbols(r.content_latex);
    if (c !== r.content_latex) patch.content_latex = c;
    const s = fixSymbols(r.solution_latex);
    if (s !== r.solution_latex) patch.solution_latex = s;
    const aj = fixAnswerJson(r.answer_json);
    if (aj.changed) patch.answer_json = aj.next;
    if (Object.keys(patch).length === 0) continue;   // ★ 안 바뀌면 UPDATE 안 보낸다
    // ★ 차이 지점 주변만 보여준다 — 앞부분만 자르면 뭐가 바뀌는지 안 보인다
    const o = r.content_latex || '', n2 = String(c || '');
    let d = 0; while (d < o.length && d < n2.length && o[d] === n2[d]) d++;
    const w = (t: string) => t.slice(Math.max(0, d - 45), d + 55).replace(/\n/g, '⏎');
    patches.push({ id: r.id, patch, before: w(o), after: w(n2) });
  }

  console.log(`실제로 바뀌는 문제 ${patches.length}건 / 손 안 대는 것 ${rows.length - patches.length}건\n`);
  console.log('규칙별 적중:');
  for (const [label, n] of [...stats.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label.padEnd(26)} ${n}`);
  }

  console.log('\n바뀌는 자리 12건:');
  for (const p of patches.slice(0, 12)) {
    console.log(`  전: ${p.before}`);
    console.log(`  후: ${p.after}\n`);
  }

  if (!COMMIT) { console.log('실제로 쓰려면 --commit'); return; }

  let ok = 0, fail = 0;
  for (const p of patches) {
    const { error } = await sb.from('problems').update(p.patch).eq('id', p.id);
    if (error) { fail++; console.error(`  실패 ${p.id}: ${error.message}`); continue; }
    ok++;
    if (ok % 200 === 0) console.log(`  … ${ok}건`);
  }
  console.log(`\n── 결과 ──\n  교정 ${ok} / 실패 ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
