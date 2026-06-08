// ============================================================================
// 진단평가 세트(A/B/C) 종합 리포트 — 집계 코어 (인증 비의존)
//
// authed 라우트(/api/diagnostics/comprehensive-report)와 학부모 공개 라우트
// (/api/share/diagnostic-report/[token]) 가 공용으로 호출.
//   - authed: requireAuthScope + 학생 institute 격리 후 호출
//   - public: 토큰 검증(학생+세트 일치) 후 호출
//
// 채점 데이터: diagnostics.sessions(EX) + items. items 에 난이도가 없어
// exam_problems.sequence_number ↔ items.seq 로 classifications.difficulty 조인.
// 학생 신원 병합: studentId(user) + promoted roster_students 세션 합산.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSetTitle, extractVariant, makeSetKey, type DiagnosticExamRow } from './exam-sets';

interface SeqMeta { difficulty: number | null; typeCode: string | null; }

export interface VariantItem {
  seq: number; isCorrect: boolean; difficulty: number | null;
  typeCode: string | null; typeName: string | null;
}
export interface VariantUnitStat { code: string; name: string; total: number; correct: number; pct: number; }
export interface VariantResult {
  variant: string | null; examId: string; title: string;
  graded: boolean; total: number; correct: number; pct: number | null;
  items: VariantItem[]; byUnit: VariantUnitStat[];
}
export interface ComprehensiveReportPayload {
  student: { id: string; name: string; grade: number | null; source: 'user' | 'roster' };
  set: { setKey: string; bookGroupId: string | null; setTitle: string; variantCount: number; gradedVariantCount: number };
  overall: { total: number; correct: number; pct: number | null };
  variants: VariantResult[];
  byDifficulty: Array<{ difficulty: number; total: number; correct: number; pct: number | null }>;
  byUnit: Array<{ code: string; name: string; total: number; correct: number; pct: number }>;
  byType: Array<{ code: string; unitCode: string; name: string; total: number; correct: number; pct: number }>;
}

export type ComputeResult =
  | { ok: true; payload: ComprehensiveReportPayload; studentInstituteId: string | null }
  | { ok: false; status: number; error: string };

export async function computeComprehensiveReport(
  sb: SupabaseClient,
  studentId: string,
  setKey: string,
  // ★ 자유 조합(③): 명시된 시험지 id 들이 주어지면 세트(setKey) 대신 그 조합으로 합산.
  //   기존 세트 리포트 호출자(setKey만 전달)는 영향 없음(백워드 호환).
  examIdsOverride?: string[],
): Promise<ComputeResult> {
  const sepIdx = setKey.indexOf('::');
  if (sepIdx < 0) return { ok: false, status: 400, error: 'setKey 형식 오류' };
  const bookGroupRaw = setKey.slice(0, sepIdx);
  const setTitle = setKey.slice(sepIdx + 2);
  const bookGroupId = bookGroupRaw === 'none' ? null : bookGroupRaw;

  // ── 1) 학생 신원 해석 ──
  let studentName = '';
  let studentGrade: number | null = null;
  let studentInstituteId: string | null = null;
  let studentSource: 'user' | 'roster' = 'user';
  const identityIds: string[] = [studentId];

  const { data: userRow } = await sb
    .from('users').select('id, full_name, email, grade, institute_id').eq('id', studentId).maybeSingle();

  if (userRow) {
    const u = userRow as { full_name: string | null; email: string | null; grade: number | null; institute_id: string | null };
    studentName = u.full_name || u.email?.split('@')[0] || '(이름 없음)';
    studentGrade = u.grade ?? null;
    studentInstituteId = u.institute_id ?? null;
    studentSource = 'user';
    const { data: rosters } = await sb.from('roster_students').select('id').eq('promoted_user_id', studentId);
    for (const r of (rosters ?? []) as Array<{ id: string }>) {
      if (!identityIds.includes(r.id)) identityIds.push(r.id);
    }
  } else {
    const { data: rosterRow } = await sb
      .from('roster_students').select('id, full_name, grade, institute_id').eq('id', studentId).maybeSingle();
    if (!rosterRow) return { ok: false, status: 404, error: '학생을 찾을 수 없습니다' };
    const r = rosterRow as { full_name: string | null; grade: number | null; institute_id: string | null };
    studentName = r.full_name || '(이름 없음)';
    studentGrade = r.grade ?? null;
    studentInstituteId = r.institute_id ?? null;
    studentSource = 'roster';
  }

  // ── 2) 변형 exam 해석 ──
  //   자유 조합: examIdsOverride 의 시험지들(is_diagnostic 무관 — 임의 시험지 허용).
  //   세트: setKey(book_group + 정규화 제목) 매칭 진단 exam.
  let variantExams: DiagnosticExamRow[];
  if (examIdsOverride && examIdsOverride.length > 0) {
    const { data: examRows } = await sb
      .from('exams')
      .select('id, title, book_group_id, institute_id')
      .in('id', examIdsOverride);
    variantExams = (examRows ?? []) as DiagnosticExamRow[];
  } else {
    let examQuery = sb.from('exams').select('id, title, book_group_id, institute_id').eq('is_diagnostic', true);
    examQuery = bookGroupId ? examQuery.eq('book_group_id', bookGroupId) : examQuery.is('book_group_id', null);
    const { data: examRows } = await examQuery;
    variantExams = ((examRows ?? []) as DiagnosticExamRow[]).filter((e) => normalizeSetTitle(e.title) === setTitle);
  }
  if (variantExams.length === 0) return { ok: false, status: 404, error: '시험지를 찾을 수 없습니다' };

  const examIdToVariant = new Map<string, string | null>();
  for (const e of variantExams) examIdToVariant.set(e.id, extractVariant(e.title));
  const variantExamIds = variantExams.map((e) => e.id);

  // ── 3) 변형별 seq → 난이도/유형 맵 ──
  const seqMetaByExam = new Map<string, Map<number, SeqMeta>>();
  for (const examId of variantExamIds) {
    const { data: epRows } = await sb.from('exam_problems').select('sequence_number, problem_id').eq('exam_id', examId);
    const eps = (epRows ?? []) as Array<{ sequence_number: number; problem_id: string }>;
    const problemIds = eps.map((ep) => ep.problem_id);
    const diffByProblem = new Map<string, { difficulty: number | null; typeCode: string | null }>();
    if (problemIds.length > 0) {
      const { data: clsRows } = await sb.from('classifications').select('problem_id, difficulty, type_code').in('problem_id', problemIds);
      for (const c of (clsRows ?? []) as Array<{ problem_id: string; difficulty: string | number | null; type_code: string | null }>) {
        const dRaw = c.difficulty == null ? null : parseInt(String(c.difficulty), 10);
        const d = dRaw != null && Number.isFinite(dRaw) ? Math.min(10, Math.max(1, dRaw)) : null;
        diffByProblem.set(c.problem_id, { difficulty: d, typeCode: c.type_code ?? null });
      }
    }
    const seqMap = new Map<number, SeqMeta>();
    for (const ep of eps) {
      const meta = diffByProblem.get(ep.problem_id);
      seqMap.set(ep.sequence_number, { difficulty: meta?.difficulty ?? null, typeCode: meta?.typeCode ?? null });
    }
    seqMetaByExam.set(examId, seqMap);
  }

  // ── 4) 학생 세션 + items ──
  const { data: sessRows } = await sb
    .schema('diagnostics' as never)
    .from('sessions')
    .select('id, exam_id, student_id, conducted_at')
    .in('student_id', identityIds)
    .in('exam_id', variantExamIds);
  const sessions = (sessRows ?? []) as Array<{ id: string; exam_id: string; student_id: string; conducted_at: string | null }>;

  const sessionByVariantExam = new Map<string, { id: string; conducted_at: string | null }>();
  for (const s of sessions) {
    const prev = sessionByVariantExam.get(s.exam_id);
    if (!prev || (s.conducted_at ?? '') > (prev.conducted_at ?? '')) {
      sessionByVariantExam.set(s.exam_id, { id: s.id, conducted_at: s.conducted_at });
    }
  }

  const usedSessionIds = Array.from(sessionByVariantExam.values()).map((v) => v.id);
  const itemsBySession = new Map<string, Array<{ seq: number; is_correct: boolean; mathsecr_code: string | null }>>();
  if (usedSessionIds.length > 0) {
    const { data: itemRows } = await sb
      .schema('diagnostics' as never)
      .from('items')
      .select('session_id, seq, is_correct, mathsecr_code')
      .in('session_id', usedSessionIds);
    for (const it of (itemRows ?? []) as Array<{ session_id: string; seq: number; is_correct: boolean; mathsecr_code: string | null }>) {
      const arr = itemsBySession.get(it.session_id) ?? [];
      arr.push({ seq: it.seq, is_correct: it.is_correct, mathsecr_code: it.mathsecr_code });
      itemsBySession.set(it.session_id, arr);
    }
  }

  // ── 4b) QR/인쇄 채점(print_sessions + session_results) 합산 ──
  //   print_sessions.student_id = users.id(uuid). identityIds 로 매칭(roster id 는 매칭 안 됨).
  //   단원코드는 session_problems.type_code_snapshot(=MS 코드). 보류 문항 제외(히트맵과 동일).
  const qrItemsByExam = new Map<string, Array<{ seq: number; is_correct: boolean; mathsecr_code: string | null }>>();
  {
    const { data: psRows } = await sb
      .schema('diagnostics' as never)
      .from('print_sessions')
      .select('id, exam_id, student_id, issued_at, completed_at')
      .in('student_id', identityIds)
      .in('exam_id', variantExamIds);
    const psList = (psRows ?? []) as Array<{ id: string; exam_id: string; completed_at: string | null; issued_at: string | null }>;
    // exam 당 최신 print_session 1건
    const psByExam = new Map<string, string>(); // exam_id → session_id
    const examBySession = new Map<string, string>(); // session_id → exam_id
    for (const p of psList) {
      if (!psByExam.has(p.exam_id)) {
        psByExam.set(p.exam_id, p.id);
        examBySession.set(p.id, p.exam_id);
      }
    }
    const psIds = Array.from(psByExam.values());
    if (psIds.length > 0) {
      const [{ data: srRows }, { data: spRows }] = await Promise.all([
        sb.schema('diagnostics' as never).from('session_results')
          .select('session_id, sequence_number, is_correct, teacher_note').in('session_id', psIds),
        sb.schema('diagnostics' as never).from('session_problems')
          .select('session_id, sequence_number, type_code_snapshot').in('session_id', psIds),
      ]);
      const codeBySessionSeq = new Map<string, string | null>();
      for (const sp of (spRows ?? []) as Array<{ session_id: string; sequence_number: number; type_code_snapshot: string | null }>) {
        codeBySessionSeq.set(`${sp.session_id}:${sp.sequence_number}`, sp.type_code_snapshot ?? null);
      }
      for (const sr of (srRows ?? []) as Array<{ session_id: string; sequence_number: number; is_correct: boolean; teacher_note: string | null }>) {
        if ((sr.teacher_note ?? '').includes('자동채점 보류')) continue; // 보류 제외
        const examId = examBySession.get(sr.session_id);
        if (!examId) continue;
        const code = codeBySessionSeq.get(`${sr.session_id}:${sr.sequence_number}`) ?? null;
        const arr = qrItemsByExam.get(examId) ?? [];
        arr.push({ seq: sr.sequence_number, is_correct: sr.is_correct, mathsecr_code: code });
        qrItemsByExam.set(examId, arr);
      }
    }
  }

  // ── 5) 집계 ──
  const diffBuckets = new Map<number, { total: number; correct: number }>();
  for (let d = 1; d <= 10; d++) diffBuckets.set(d, { total: 0, correct: 0 });
  const unitBuckets = new Map<string, { total: number; correct: number }>();
  const typeBuckets = new Map<string, { total: number; correct: number; unitCode: string }>();
  const variantResults: VariantResult[] = [];
  let overallTotal = 0;
  let overallCorrect = 0;

  for (const e of variantExams) {
    const sess = sessionByVariantExam.get(e.id);
    const variant = examIdToVariant.get(e.id) ?? null;
    // 진단/엑셀(items) + QR(session_results) 합산
    const diagItems = sess ? (itemsBySession.get(sess.id) ?? []) : [];
    const qrItems = qrItemsByExam.get(e.id) ?? [];
    const items = [...diagItems, ...qrItems];
    if (items.length === 0) {
      variantResults.push({ variant, examId: e.id, title: e.title, graded: false, total: 0, correct: 0, pct: null, items: [], byUnit: [] });
      continue;
    }
    const seqMap = seqMetaByExam.get(e.id) ?? new Map<number, SeqMeta>();
    const variantItems: VariantItem[] = [];
    const variantUnitBuckets = new Map<string, { total: number; correct: number }>();
    let vTotal = 0;
    let vCorrect = 0;
    for (const it of items) {
      vTotal++;
      if (it.is_correct) vCorrect++;
      const meta = seqMap.get(it.seq);
      const code = it.mathsecr_code || meta?.typeCode || null;
      const unitCode = code ? code.split('-').slice(0, 2).join('-') : null;
      const leafCode = code && code.split('-').length >= 3 ? code : null;
      variantItems.push({ seq: it.seq, isCorrect: it.is_correct, difficulty: meta?.difficulty ?? null, typeCode: leafCode, typeName: null });
      if (meta?.difficulty != null) {
        const b = diffBuckets.get(meta.difficulty)!;
        b.total++;
        if (it.is_correct) b.correct++;
      }
      if (unitCode) {
        const ub = unitBuckets.get(unitCode) ?? { total: 0, correct: 0 };
        ub.total++;
        if (it.is_correct) ub.correct++;
        unitBuckets.set(unitCode, ub);
        const vub = variantUnitBuckets.get(unitCode) ?? { total: 0, correct: 0 };
        vub.total++;
        if (it.is_correct) vub.correct++;
        variantUnitBuckets.set(unitCode, vub);
      }
      if (leafCode && unitCode) {
        const tb = typeBuckets.get(leafCode) ?? { total: 0, correct: 0, unitCode };
        tb.total++;
        if (it.is_correct) tb.correct++;
        typeBuckets.set(leafCode, tb);
      }
    }
    variantItems.sort((a, b) => a.seq - b.seq);
    overallTotal += vTotal;
    overallCorrect += vCorrect;
    const variantByUnit: VariantUnitStat[] = Array.from(variantUnitBuckets.entries())
      .map(([code, b]) => ({ code, name: code, total: b.total, correct: b.correct, pct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct);
    variantResults.push({
      variant, examId: e.id, title: e.title, graded: true,
      total: vTotal, correct: vCorrect,
      pct: vTotal > 0 ? Math.round((vCorrect / vTotal) * 1000) / 10 : null,
      items: variantItems, byUnit: variantByUnit,
    });
  }

  // 이름 조인
  const unitCodes = Array.from(unitBuckets.keys());
  const typeCodes = Array.from(typeBuckets.keys());
  const allCodes = Array.from(new Set([...unitCodes, ...typeCodes]));
  const nameByCode = new Map<string, string>();
  if (allCodes.length > 0) {
    const { data: mtRows } = await sb.from('mathsecr_types').select('code, full_path').in('code', allCodes);
    for (const mt of (mtRows ?? []) as Array<{ code: string; full_path: string | null }>) {
      if (mt.full_path) nameByCode.set(mt.code, mt.full_path);
    }
  }

  const byDifficulty = Array.from(diffBuckets.entries()).map(([difficulty, b]) => ({
    difficulty, total: b.total, correct: b.correct, pct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : null,
  }));
  const byUnit = Array.from(unitBuckets.entries()).map(([code, b]) => ({
    code, name: nameByCode.get(code) || code, total: b.total, correct: b.correct, pct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct);
  const byType = Array.from(typeBuckets.entries()).map(([code, b]) => ({
    code, unitCode: b.unitCode, name: nameByCode.get(code) || code, total: b.total, correct: b.correct, pct: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct);

  for (const v of variantResults) {
    for (const u of v.byUnit) u.name = nameByCode.get(u.code) || u.code;
    for (const it of v.items) it.typeName = it.typeCode ? (nameByCode.get(it.typeCode) || it.typeCode) : null;
  }

  const variantRank: Record<string, number> = { A: 0, B: 1, C: 2 };
  variantResults.sort((a, b) => (variantRank[a.variant ?? 'Z'] ?? 9) - (variantRank[b.variant ?? 'Z'] ?? 9));
  const gradedVariantCount = variantResults.filter((v) => v.graded).length;

  const payload: ComprehensiveReportPayload = {
    student: { id: studentId, name: studentName, grade: studentGrade, source: studentSource },
    set: { setKey: makeSetKey(bookGroupId, setTitle), bookGroupId, setTitle, variantCount: variantExams.length, gradedVariantCount },
    overall: { total: overallTotal, correct: overallCorrect, pct: overallTotal > 0 ? Math.round((overallCorrect / overallTotal) * 1000) / 10 : null },
    variants: variantResults,
    byDifficulty, byUnit, byType,
  };
  return { ok: true, payload, studentInstituteId };
}
