// ============================================================================
// HWP 수식 변환표 누락 4종 복구 — dyad(직선) · arch(호) · BARxx(선분) · 󰁚(평행)
// ----------------------------------------------------------------------------
// 한글 수식의 dyad 는 **직선**(양쪽 화살표)인데 변환표에 없어 글자 그대로 새어 나왔다.
// 중1 기본도형은 직선·반직선·선분 표기로 문제가 갈린다 — 글자로 새면 문제가 성립하지 않는다.
// 파서는 PR 에서 막았다. 이 스크립트는 **이미 저장된 것**만 고친다.
//
//   node scripts/fix-hwp-equation-tokens.mjs            (미리보기)
//   node scripts/fix-hwp-equation-tokens.mjs --commit   (저장)
// ============================================================================
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const COMMIT = process.argv.includes('--commit');

/** `cmd{ AB }` / `cmd{{ {AB}} }` / `cmd AB` 를 모두 잡아 LaTeX 로 */
function wrapCmd(s, cmd, make) {
  const braced = new RegExp(`(?<![\\\\A-Za-z])${cmd}\\s*\\{([^{}]*\\{[^{}]*\\{[^{}]*\\}[^{}]*\\}[^{}]*|[^{}]*\\{[^{}]*\\}[^{}]*|[^{}]*)\\}`, 'gi');
  return s
    .replace(braced, (_m, inner) => {
      const name = (inner.match(/[A-Za-z][A-Za-z0-9]*/) || [''])[0];
      return name ? make(name) : make('');
    })
    .replace(new RegExp(`(?<![\\\\A-Za-z])${cmd}\\s+([A-Za-z][A-Za-z0-9]*)`, 'gi'), (_m, n) => make(n));
}

function fixEq(s) {
  if (!s) return s;
  let out = s;
  if (out.includes('dyad')) out = wrapCmd(out, 'dyad', (n) => (n ? `\\overleftrightarrow{${n}}` : '\\overleftrightarrow'));
  if (/(?<![A-Za-z\\])arch/i.test(out)) out = wrapCmd(out, 'arch', (n) => (n ? `\\stackrel{\\frown}{${n}}` : ''));
  out = out.replace(/(?<![\\A-Za-z])BAR([A-Z][A-Za-z0-9]*)/g, '\\overline{$1}');
  out = out.replace(/\u{F005A}/gu, ' \\parallel ');
  return out;
}
const fixDyad = fixEq;

/** 객체 안의 **문자열 값에만** fixEq 를 적용.
 *  ★ 직렬화한 JSON 문자열에 바로 치환하면 \parallel 의 백슬래시가 이스케이프를 깨뜨린다
 *    (첫 실행에서 실제로 터졌다 — "Bad escaped character in JSON"). */
function walk(v) {
  if (typeof v === 'string') return fixEq(v);
  if (Array.isArray(v)) return v.map(walk);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = walk(val);
    return out;
  }
  return v;
}

// 전체를 훑어 바뀌는 것만 고른다 (명령어가 4종이라 텍스트 검색보다 이게 확실하다)
const all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('problems').select('id, content_latex, solution_latex, answer_json')
    .is('deleted_at', null).order('id').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < 1000) break;
}
const pool = new Map();
for (const r of all) {
  const text = `${r.content_latex || ''}\n${r.solution_latex || ''}`;
  const ajChanged = r.answer_json && JSON.stringify(walk(r.answer_json)) !== JSON.stringify(r.answer_json);
  if (fixEq(text) !== text || ajChanged) pool.set(r.id, r);
}
console.log(`문제 ${all.length}건 중 고칠 것 ${pool.size}건`);

let n = 0;
for (const r of pool.values()) {
  const patch = {};
  const c = fixDyad(r.content_latex);
  if (c !== r.content_latex) patch.content_latex = c;
  const s = fixDyad(r.solution_latex);
  if (s !== r.solution_latex) patch.solution_latex = s;
  if (r.answer_json) {
    const before = JSON.stringify(r.answer_json);
    const walked = walk(r.answer_json);
    if (JSON.stringify(walked) !== before) patch.answer_json = walked;
  }
  if (Object.keys(patch).length === 0) continue;
  n++;
  if (!COMMIT) {
    const before = (r.content_latex || '').match(/.{0,30}(dyad|arch|BAR[A-Z]|\u{F005A}).{0,30}/iu);
    const after = (patch.content_latex || '').match(/.{0,40}(overleftrightarrow|frown|overline|parallel).{0,20}/i);
    console.log(`\n${r.id}\n  전: ${before ? before[0] : '(보기/해설)'}\n  후: ${after ? after[0] : '(보기/해설)'}`);
    continue;
  }
  const { error: e2 } = await sb.from('problems').update(patch).eq('id', r.id);
  if (e2) console.error(`  [실패] ${r.id}: ${e2.message}`);
}
console.log(`\n${COMMIT ? '저장' : '미리보기'} — ${n}건`);
if (!COMMIT) console.log('실제 저장하려면 --commit');
