// ============================================================================
// 빠른답 복구 — 해설 본문에 적힌 정답을 answer_json 에 채운다
// ----------------------------------------------------------------------------
// ★ 사고 (2026-09-15, 대표: "해설이 생성되어도 빠른답이 안 올라가는 경우가 있다"):
//   해설 끝에 「따라서 옳지 않은 것은 ③이다」라고 분명히 적혀 있는데 저장된 답은 빈 문자열.
//   생성 코드가 JSON 의 finalAnswer 필드만 보고 본문은 안 봤다.
//   게다가 answer_user_edited=true 가 남아 다음 생성에서도 "사용자가 고친 값"이라며
//   **빈값이 영구 보존**됐다.
//
// 라우트는 고쳤다. 이 스크립트는 **이미 비어 있는 것**만 되살린다. AI 비용 0.
//
//   node scripts/recover-answers-from-solution.mjs            (미리보기)
//   node scripts/recover-answers-from-solution.mjs --commit   (저장)
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

/** 라우트의 answerFromSolutionText 와 같은 규칙 — 결론은 뒤에 온다 */
function answerFromSolutionText(text) {
  if (!text) return '';
  // ★ 결론은 **끝에** 있다 — 마지막 160자만 본다. 중간의 "② 는 틀렸다" 에 끌리면 안 된다.
  const tail = text.slice(-160);
  const m = /(?:∴|따라서|그러므로|정답은|답은|정답\s*[:：])([^\n]{0,40})/.exec(tail);
  if (!m) return '';
  const circled = m[1].match(/[①②③④⑤]/g) || [];
  // ★ 결론 문장에 원형숫자가 **하나뿐일 때만** 쓴다.
  //   "②, ⑤이다" 같은 '모두 고르기'형을 하나로 줄여 저장하면 오답을 심는 것이다.
  if (circled.length !== 1) return '';
  return circled[0];
}

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('problems')
    .select('id, answer_json, solution_latex, answer_type')
    .is('deleted_at', null)
    .eq('answer_type', 'multiple_choice')
    .not('solution_latex', 'is', null)
    .order('id')
    .range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < 1000) break;
}

const targets = rows.filter((r) => {
  if (!r.solution_latex || r.solution_latex.trim().length < 30) return false;
  const aj = r.answer_json || {};
  const cur = String(aj.finalAnswer ?? aj.correct_answer ?? '').trim();
  return cur === '';
});
console.log(`객관식 + 해설 있음 ${rows.length}건 · 답이 빈 것 ${targets.length}건`);

let fixed = 0, noAnswer = 0;
for (const r of targets) {
  const ans = answerFromSolutionText(r.solution_latex);
  if (!ans) { noAnswer++; continue; }
  fixed++;
  if (!COMMIT) {
    const tail = r.solution_latex.replace(/\s+/g, ' ').slice(-70);
    console.log(`  ${r.id.slice(0, 8)} → ${ans}   …${tail}`);
    continue;
  }
  const next = {
    ...(r.answer_json || {}),
    finalAnswer: ans,
    correct_answer: ans,
    // ★ 빈값이 '사용자 편집'으로 굳어 있던 것을 푼다 — 안 그러면 다음 생성에서 또 덮인다
    answer_user_edited: false,
  };
  const { error } = await sb.from('problems').update({ answer_json: next }).eq('id', r.id);
  if (error) console.error(`  [실패] ${r.id}: ${error.message}`);
}
console.log(`\n${COMMIT ? '저장' : '미리보기'} — 복구 ${fixed}건 · 본문에도 답 없음 ${noAnswer}건`);
if (!COMMIT) console.log('실제 저장하려면 --commit');
