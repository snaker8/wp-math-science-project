/**
 * exams 학교 메타 컬럼 백필 — 제목에서 역산
 * ============================================================================
 *
 * ★ 기본은 드라이런. 실제로 쓰려면 `--commit`.
 *
 * 왜 필요했나 (2026-09-02):
 *   출제 화면의 **학교기출 탭**은 `school_name`/`grade`/`semester`/`exam_round` 로 좁힌다.
 *   그런데 `createExamFromHml` 이 이 컬럼들을 아예 안 채웠다 — 화면 업로드도 마찬가지.
 *   실측: 시험지 1,741건 중 학교명이 있는 건 40건. 적재한 1,700여 건이 탭에 안 잡혔다.
 *
 *   근본은 `hml-save.ts` 에서 고쳤다(제목에서 파생). 이 스크립트는 **이미 쌓인 것**을 메운다.
 *   파서는 앱과 같은 것(`exam-title-meta.ts`)을 쓴다 — 두 벌 두면 갈라진다.
 *
 * 실행:
 *   npx tsx scripts/backfill-exam-school-meta.ts
 *   npx tsx scripts/backfill-exam-school-meta.ts --commit
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parseExamTitleMeta } from '../src/lib/workflow/exam-title-meta';

const COMMIT = process.argv.includes('--commit');

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let rows: Array<{ id: string; title: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('exams')
      .select('id, title')
      .is('deleted_at', null)
      .is('school_name', null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows = rows.concat(data as typeof rows);
    if (data.length < 1000) break;
  }

  const parsed = rows.flatMap((r) => {
    const meta = parseExamTitleMeta(r.title);
    return meta ? [{ ...r, meta }] : [];
  });

  console.log(COMMIT ? '★ 실제 백필' : '드라이런 (쓰지 않음)');
  console.log(`학교명 없는 시험지 ${rows.length}건 / 역산 가능 ${parsed.length}건`);
  console.log(`규칙 밖이라 건너뜀 ${rows.length - parsed.length}건 (진단평가·모의고사·교재 등)\n`);

  const noGrade = parsed.filter((r) => !r.meta.grade);
  console.log(`학교급 판정 실패(grade 미기록) ${noGrade.length}건`);
  noGrade.forEach((r) => console.log(`  ? ${r.title}`));

  // 학교명 정상성 — 중/고 로 안 끝나면 파싱이 샌 것이다
  const schools = [...new Set(parsed.map((r) => r.meta.schoolName))].sort();
  const odd = schools.filter((s) => !/(중|고)$/.test(s));
  console.log(`\n학교 ${schools.length}개 / 이름이 이상한 것 ${odd.length}개`);
  if (odd.length) console.log('  ' + odd.join(' · '));

  console.log('\n표본 6:');
  parsed.slice(0, 6).forEach((r) =>
    console.log(`  ${r.title.padEnd(30)} → ${r.meta.schoolName} / ${r.meta.grade ?? '(미판정)'} / ${r.meta.semester}학기 / ${r.meta.examRound}`),
  );

  if (!COMMIT) { console.log('\n실제로 쓰려면 --commit'); return; }

  let ok = 0, fail = 0;
  for (const r of parsed) {
    const patch: Record<string, unknown> = {
      school_name: r.meta.schoolName,
      semester: r.meta.semester,
      exam_round: r.meta.examRound,
    };
    if (r.meta.grade) patch.grade = r.meta.grade;   // 판정 못 하면 기존 값 유지
    const { error } = await sb.from('exams').update(patch).eq('id', r.id);
    if (error) { fail++; console.error(`  실패 ${r.title}: ${error.message}`); continue; }
    ok++;
    if (ok % 200 === 0) console.log(`  … ${ok}건`);
  }
  console.log(`\n── 결과 ──\n  백필 ${ok} / 실패 ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
