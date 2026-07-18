// ============================================================================
// 한글(.hwpx) 내보내기 전수 감사 — 검증 루프의 일괄 실행판 (2026-07-18)
//   DB 의 모든 시험지를 생성(이미지 fetch 생략)→잔재 스캔 → 미변환 클래스 일괄 발견.
//   "버그가 나올 때마다 수정" 대신 선제 발견용. 비용 0 (DB 읽기 + 로컬 변환만).
//   실행: npx tsx scripts/hwpx-audit.ts [--limit N]
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { generateHWPX, scanHwpxArtifacts, type HwpxArtifactWarning } from '../src/lib/export/hwpx-generator';
import JSZip from 'jszip';

const env: Record<string, string> = {};
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ignore */ }
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : 0;

async function main() {
  // 문제 있는 시험지 전체 (페이지네이션 — .select 1000 limit 가드)
  const exams: Array<{ id: string; title: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('exams').select('id, title').is('deleted_at', null)
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) throw error;
    exams.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const targets = LIMIT > 0 ? exams.slice(0, LIMIT) : exams;
  console.log(`대상 시험지: ${targets.length}개`);

  const byKind = new Map<string, { count: number; exams: Set<string>; samples: string[] }>();
  let scanned = 0; let withWarn = 0; let failed = 0;

  for (const exam of targets) {
    try {
      const { data: eps } = await sb.from('exam_problems')
        .select('sequence_number, points, problem_id').eq('exam_id', exam.id)
        .order('sequence_number');
      if (!eps || eps.length === 0) continue;
      const ids = eps.map((r) => r.problem_id);
      const probs: Array<{ id: string; content_latex: string; answer_json: Record<string, unknown>; solution_latex: string | null }> = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await sb.from('problems').select('id, content_latex, answer_json, solution_latex').in('id', ids.slice(i, i + 100));
        probs.push(...((data || []) as typeof probs));
      }
      const pm = new Map(probs.map((p) => [p.id, p]));
      const hwpProblems = eps.map((row) => {
        const p = pm.get(row.problem_id);
        const aj = (p?.answer_json || {}) as { choices?: string[]; correct_answer?: unknown; finalAnswer?: unknown };
        return {
          number: row.sequence_number,
          content: p?.content_latex || '',
          choices: Array.isArray(aj.choices) ? aj.choices : [],
          answer: String(aj.correct_answer ?? aj.finalAnswer ?? ''),
          solution: p?.solution_latex || undefined,
          points: row.points || undefined,
        };
      });
      const buf = (await generateHWPX(hwpProblems, {
        title: exam.title, showAnswerSheet: true, showSolutions: true, columns: 2, skipImages: true,
        header: { schoolName: '', examTitle: exam.title, subject: '', examType: '', grade: '' },
      })) as Buffer;
      const zip = await JSZip.loadAsync(buf);
      const sec = await zip.file('Contents/section0.xml')!.async('string');
      const warns = scanHwpxArtifacts(sec);
      scanned++;
      if (warns.length > 0) {
        withWarn++;
        for (const w of warns) {
          const e = byKind.get(w.kind) || { count: 0, exams: new Set<string>(), samples: [] };
          e.count += w.count;
          e.exams.add(exam.title);
          if (e.samples.length < 5 && !e.samples.includes(w.sample)) e.samples.push(w.sample);
          byKind.set(w.kind, e);
        }
      }
      if (scanned % 50 === 0) console.log(`... ${scanned}/${targets.length}`);
    } catch (err) {
      failed++;
      console.log(`✗ 생성 실패: ${exam.title} — ${String(err).slice(0, 120)}`);
    }
  }

  console.log(`\n=== 감사 결과: ${scanned}개 스캔, 경고 있는 시험지 ${withWarn}개, 생성 실패 ${failed}개 ===`);
  const sorted = [...byKind.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [kind, e] of sorted) {
    console.log(`\n[${kind}] 총 ${e.count}건 / 시험지 ${e.exams.size}개`);
    console.log('  샘플:', e.samples.map((s) => JSON.stringify(s)).join(' | '));
    console.log('  시험지(최대 5):', [...e.exams].slice(0, 5).join(' / '));
  }
  if (sorted.length === 0) console.log('잔재 없음 — 전체 클린 ✓');
}

main().catch((e) => { console.error(e); process.exit(1); });
