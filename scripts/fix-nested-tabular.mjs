// ============================================================================
// 중첩 tabular 복구 — 표 안에 표로 저장돼 화면에서 깨진 문제 되살리기
// ----------------------------------------------------------------------------
// 사고: 대화 테두리 박스(1열 표) 안에 데이터 표가 또 들어가 tabular 가 중첩됐다.
//   렌더러가 첫 \end{tabular} 에서 짝을 잘못 맞춰 표를 인라인으로 흘리고 **빈칸이 사라진다**
//   (온천중 25-1-2 #21 — "표의 빈칸을 채우시오" 가 성립 안 하는 문제가 됐다).
// 파서는 PR #547 에서 막았다. 이 스크립트는 **이미 저장된 것**만 되살린다.
//
// 하는 일: 바깥 껍데기(tabular 열기/닫기 + spec + \hline)만 벗기고, 바깥 레벨의 행 구분 \\ 을
//   줄바꿈으로 바꾼다. **안쪽 표는 한 글자도 안 건드린다.**
//
//   node scripts/fix-nested-tabular.mjs           (미리보기만)
//   node scripts/fix-nested-tabular.mjs --commit  (실제 저장)
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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Supabase 환경변수 없음'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');
const B = '\\begin{tabular}';
const E = '\\end{tabular}';

/** 바깥 tabular 를 균형 맞춰 찾고, 그 안에 또 tabular 가 있으면 바깥만 벗긴다 */
function unwrapNested(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const b = src.indexOf(B, i);
    if (b < 0) { out += src.slice(i); break; }
    out += src.slice(i, b);
    let depth = 0, j = b, end = -1;
    while (j < src.length) {
      const nb = src.indexOf(B, j);
      const ne = src.indexOf(E, j);
      if (ne < 0) break;
      if (nb >= 0 && nb < ne) { depth++; j = nb + B.length; }
      else { depth--; j = ne + E.length; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) { out += src.slice(b); break; }   // 짝이 안 맞으면 손대지 않는다
    const block = src.slice(b, end);
    if (block.slice(B.length).includes(B)) {
      let body = block
        .replace(/^\\begin\{tabular\}\s*\{[^}]*\}/, '')
        .replace(/\\end\{tabular\}$/, '');
      const keep = [];
      body = body.replace(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/g, (m) => {
        keep.push(m); return `__T${keep.length - 1}__`;
      });
      body = body.replace(/\s*\\hline\s*/g, ' ').replace(/\s*\\\\\s*/g, '\n');
      body = body.replace(/__T(\d+)__/g, (_, k) => '\n' + keep[+k] + '\n');
      out += '\n' + body.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') + '\n';
    } else {
      out += block;
    }
    i = end;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** 첫 tabular 안에 또 tabular 가 열리는가 */
function isNested(c) {
  const first = c.indexOf(B);
  if (first < 0) return false;
  const rest = c.slice(first + B.length);
  const nb = rest.indexOf(B);
  const ne = rest.indexOf(E);
  return nb >= 0 && (ne < 0 || nb < ne);
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('problems').select('id, content_latex')
    .is('deleted_at', null).like('content_latex', '%\\begin{tabular}%')
    .order('id').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < 1000) break;
}

const targets = rows.filter((r) => r.content_latex && isNested(r.content_latex));
console.log(`표 있는 문제 ${rows.length}건 · 중첩 ${targets.length}건`);

let changed = 0, skipped = 0;
for (const r of targets) {
  const next = unwrapNested(r.content_latex);
  if (!next || next === r.content_latex) { skipped++; continue; }
  if (isNested(next)) { console.log(`  [건너뜀] ${r.id} — 벗긴 뒤에도 중첩`); skipped++; continue; }
  // 안전: 내용이 크게 줄면 손대지 않는다 (벗기기는 길이를 거의 안 바꾼다)
  if (next.length < r.content_latex.length * 0.8) {
    console.log(`  [건너뜀] ${r.id} — 길이 급감 ${r.content_latex.length}→${next.length}`);
    skipped++; continue;
  }
  changed++;
  if (!COMMIT) {
    console.log(`\n--- ${r.id} (미리보기) ---\n${next.slice(0, 300)}`);
    continue;
  }
  const { error } = await sb.from('problems').update({ content_latex: next }).eq('id', r.id);
  if (error) console.error(`  [실패] ${r.id}: ${error.message}`);
}
console.log(`\n${COMMIT ? '저장' : '미리보기'} — 대상 ${changed}건 · 건너뜀 ${skipped}건`);
if (!COMMIT) console.log('실제 저장하려면 --commit');
