// ============================================================================
// 한글(.hwpx) 내보내기 전수 감사 — 검증 루프의 일괄 실행판 (2026-07-18)
//   DB 의 모든 시험지를 생성(이미지 fetch 생략)→잔재 스캔 → 미변환 클래스 일괄 발견.
//   "버그가 나올 때마다 수정" 대신 선제 발견용. 비용 0 (DB 읽기 + 로컬 변환만).
//   실행: npx tsx scripts/hwpx-audit.ts [--limit N]
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import { generateHWPX, scanHwpxArtifacts, __droppedCommandsEntries, DROP_OK, type HwpxArtifactWarning } from '../src/lib/export/hwpx-generator';
import JSZip from 'jszip';

const env: Record<string, string> = {};
for (const f of ['.env.local', '.env']) {
  try {
    // ★ split(/\r?\n/) 필수 — `.env.local` 이 CRLF 라 `\n` 으로만 자르면 줄 끝에 `\r` 이 남고
    //   `(.*)$` 의 `.` 는 `\r` 을 못 먹어 **전 항목 매칭 실패** → supabaseUrl is required 로 즉사.
    //   맨 앞 BOM(﻿)도 제거 — 첫 줄이 주석이 아니면 첫 키 이름이 깨진다.
    for (const line of fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
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
  const dropped = new Map<string, { count: number; exams: Set<string> }>();
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
      // ★ "조용히 지워진 LaTeX 명령" 은 산출물에 흔적이 안 남아 scanHwpxArtifacts 로는 못 본다.
      //   (근호·분수가 통째로 사라지는 제일 위험한 클래스) — 생성 직후 원본 맵을 읽어 따로 센다.
      for (const [cmd, n] of __droppedCommandsEntries()) {
        if (DROP_OK.has(cmd)) continue;   // 구조·서식 명령은 지워지는 게 정상
        if (dropped.has(cmd)) { const e = dropped.get(cmd)!; e.count += n; e.exams.add(exam.title); }
        else dropped.set(cmd, { count: n, exams: new Set([exam.title]) });
      }
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

  // 조용히 지워진 명령 (DROP_OK 로 걸러진 구조·서식 명령은 이미 제외돼 있다)
  const dropSorted = [...dropped.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`\n=== 삭제된 LaTeX 명령 (기호가 통째로 사라지는 클래스) ===`);
  if (dropSorted.length === 0) console.log('삭제 없음 ✓');
  for (const [cmd, e] of dropSorted) {
    console.log(`  \\${cmd}: ${e.count}건 / 시험지 ${e.exams.size}개 — ${[...e.exams].slice(0, 3).join(' / ')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
