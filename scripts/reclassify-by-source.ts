/**
 * 출처 기준 과목 오분류 재분류
 * ============================================================================
 *
 * ★ 유료 API 를 호출한다. `--commit` 없이는 대상만 보여주고 끝난다.
 *
 * 배경 (2026-09-01):
 *   `exams.curriculum_codes`(학년·학기 지정)는 2026-08-30 에 추가된 기능이다.
 *   그 이전 자산화분은 지정할 방법이 없어 AI 가 내용만 보고 과목을 골랐고,
 *   인접 과목끼리 흩어졌다 — 수1 시험지 한 장이 공통수학1·공통수학2·수2 로 갈렸다.
 *   출처(파일명)에 과목이 적혀 있으므로 그걸 못 박아 다시 분류한다.
 *
 * ★ 판정 함정 — `공통수학1` 안에 `수1` 이 들어 있다.
 *   순진하게 `수1` 로 매칭하면 공통수학1 시험지 284건이 통째로 대수로 바뀐다(실측).
 *   반드시 공통수학/공수를 **먼저 배제**한 뒤 판정한다.
 *
 * 실행:
 *   npx tsx scripts/reclassify-by-source.ts            대상만 표시
 *   npx tsx scripts/reclassify-by-source.ts --commit   실제 재분류·저장
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

/** 출처(파일명) → 과목코드. 확신 없으면 null (건드리지 않는다). */
export function subjectFromSource(source: string | null): string | null {
  if (!source) return null;
  const s = source.normalize('NFC');
  // ★ 공통수학1/2 를 먼저 배제 — '공통수학1' 에 '수1' 이 포함되어 오탐이 난다
  if (/공통\s*수학|공수\s*[12]/.test(s)) return null;
  if (/미적분\s*1/.test(s)) return '10';
  if (/미적분/.test(s)) return '12';
  if (/(^|[^통])수\s*1|수학\s*1|수학\s*I(?![IVX])/.test(s)) return '09';
  if (/확률과\s*통계|확통/.test(s)) return '11';
  if (/기하/.test(s)) return '13';
  return null;
}

async function main() {
  const { classifyProblem } = await import('@/lib/workflow/classify');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 살아있는 문제 + 분류 전수
  let rows: Array<{ id: string; source_name: string | null; content_latex: string | null; type_code: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from('classifications')
      .select('type_code, problems!inner(id, source_name, content_latex, deleted_at)')
      .is('problems.deleted_at', null)
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const r of data as unknown as Array<{ type_code: string; problems: { id: string; source_name: string | null; content_latex: string | null } }>) {
      rows.push({ id: r.problems.id, source_name: r.problems.source_name, content_latex: r.problems.content_latex, type_code: r.type_code });
    }
    if (data.length < 1000) break;
  }

  const targets = rows
    .map((r) => ({ ...r, want: subjectFromSource(r.source_name) }))
    .filter((r) => r.want && r.type_code?.slice(0, 4) !== `MS${r.want}`);
  const list = LIMIT ? targets.slice(0, LIMIT) : targets;

  console.log(`${COMMIT ? '★ 실제 재분류' : '대상만 표시 (쓰지 않음)'}`);
  console.log(`전체 분류행 ${rows.length} / 재분류 대상 ${targets.length}\n`);

  const bySrc = new Map<string, number>();
  for (const t of targets) bySrc.set(t.source_name || '-', (bySrc.get(t.source_name || '-') || 0) + 1);
  console.log('출처별:');
  for (const [k, v] of [...bySrc.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(3)}  ${k}`);
  }

  if (!COMMIT) { console.log(`\n실제로 고치려면 --commit`); return; }

  const SUBJ_LABEL: Record<string, string> = { '09': '대수', '10': '미적분1', '11': '확률과통계', '12': '미적분', '13': '기하' };
  let ok = 0, fail = 0, unchanged = 0;
  for (const t of list) {
    if (!t.content_latex?.trim()) { fail++; continue; }
    const r = await classifyProblem({
      content: t.content_latex,
      examSubject: SUBJ_LABEL[t.want!] || '',
      examGrade: '',
      curriculumCodes: [t.want!],          // ★ 과목을 못 박는다 — 이게 이번 수정의 핵심
      logLabel: `재분류 ${t.id.slice(0, 8)}`,
    });
    if (!r?.typeCode) { fail++; continue; }
    if (r.typeCode.slice(0, 4) !== `MS${t.want}`) {
      // 지정한 과목 밖으로 나오면 저장하지 않는다 — 억지로 바꾸지 않는다
      console.warn(`  건너뜀 ${t.id.slice(0, 8)} — 결과 ${r.typeCode} 가 MS${t.want} 밖`);
      unchanged++; continue;
    }
    const { error } = await sb.from('classifications')
      .update({ type_code: r.typeCode, difficulty: r.difficulty, cognitive_domain: r.cognitiveDomain, classification_source: r.model })
      .eq('problem_id', t.id);
    if (error) { console.error(`  저장실패 ${t.id.slice(0, 8)}: ${error.message}`); fail++; continue; }
    ok++;
    if (ok % 10 === 0) console.log(`  … ${ok}건 완료`);
  }
  console.log(`\n── 결과 ──`);
  console.log(`  재분류 ${ok} / 건너뜀 ${unchanged} / 실패 ${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
