// ============================================================================
// POST /api/exams/[examId]/create-similar
//
// 현 시험지의 각 문항을 "같은 유형(type_code)의 다른 문항"으로 교체한 유사 시험지 생성.
//   매쓰플랫 유형기준 모델 — 은행 기반(즉시, AI 생성 X). 대체 후보 없으면 원본 유지.
//   안전 가드: exam INSERT 실패 시 즉시 abort (create-from-problems 패턴 동일).
//
// 반환: { examId, total, replaced, keptOriginal }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertExamAccess } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PER_TYPE_CAP = 25; // 유형별 후보 상한 (problems 유효성 쿼리 폭주 방지)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  const { examId } = await params;

  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const sb = supabaseAdmin;

  const guard = await assertExamAccess(sb, examId, scope);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  // 원 시험지
  const { data: exam, error: examErr } = await sb
    .from('exams')
    .select('id, title, grade, subject, institute_id')
    .eq('id', examId)
    .maybeSingle();
  if (examErr || !exam) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 });

  // 원 문항 (순서)
  const { data: epRows } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  const origRows = (epRows || []) as Array<{ problem_id: string; sequence_number: number }>;
  const origIds = origRows.map((r) => r.problem_id);
  if (origIds.length === 0) return NextResponse.json({ error: '시험지에 문항이 없습니다.' }, { status: 400 });
  const origSet = new Set(origIds);

  // 원 문항 분류 (type_code / expanded_type_code)
  const { data: origCls } = await sb
    .from('classifications')
    .select('problem_id, type_code, expanded_type_code')
    .in('problem_id', origIds);
  const typeOf = new Map<string, string>(); // problem_id → typeCode
  const typeCodes = new Set<string>();
  for (const c of (origCls || []) as Array<{ problem_id: string; type_code: string | null; expanded_type_code: string | null }>) {
    const tc = (c.type_code || c.expanded_type_code || '').trim();
    if (tc) { typeOf.set(c.problem_id, tc); typeCodes.add(tc); }
  }

  // 후보 수집: 같은 type_code 또는 expanded_type_code 의 다른 문항
  const typesArr = [...typeCodes];
  const candByType = new Map<string, string[]>(); // typeCode → 후보 problem_id[]
  const allCandIds = new Set<string>();
  const pushCand = (tc: string | null, pid: string) => {
    const key = (tc || '').trim();
    if (!key || origSet.has(pid)) return;
    const arr = candByType.get(key) || [];
    if (arr.length >= PER_TYPE_CAP || arr.includes(pid)) return;
    arr.push(pid); candByType.set(key, arr); allCandIds.add(pid);
  };
  if (typesArr.length > 0) {
    const [{ data: c1 }, { data: c2 }] = await Promise.all([
      sb.from('classifications').select('problem_id, type_code').in('type_code', typesArr).limit(3000),
      sb.from('classifications').select('problem_id, expanded_type_code').in('expanded_type_code', typesArr).limit(3000),
    ]);
    for (const c of (c1 || []) as Array<{ problem_id: string; type_code: string | null }>) pushCand(c.type_code, c.problem_id);
    for (const c of (c2 || []) as Array<{ problem_id: string; expanded_type_code: string | null }>) pushCand(c.expanded_type_code, c.problem_id);
  }

  // 후보 유효성 — 삭제되지 않은 문항만 (deleted_at IS NULL)
  const validCand = new Set<string>();
  if (allCandIds.size > 0) {
    const { data: valid } = await sb
      .from('problems')
      .select('id')
      .in('id', [...allCandIds])
      .is('deleted_at', null);
    for (const p of (valid || []) as Array<{ id: string }>) validCand.add(p.id);
  }

  // 배정: 원 문항 순서대로, 같은 유형의 미사용 유효 후보로 교체. 없으면 원본 유지.
  const used = new Set<string>();
  let replaced = 0;
  const newIds: string[] = origRows.map((row) => {
    const tc = typeOf.get(row.problem_id);
    if (tc) {
      const pool = candByType.get(tc) || [];
      const pick = pool.find((pid) => validCand.has(pid) && !used.has(pid) && pid !== row.problem_id);
      if (pick) { used.add(pick); replaced++; return pick; }
    }
    used.add(row.problem_id);
    return row.problem_id; // 대체 후보 없음 → 원본 유지
  });

  // 새 시험지 INSERT (자산화 안전 가드 — 실패 시 abort)
  const teacherId = user?.id || null;
  const instId = (exam as { institute_id?: string | null }).institute_id ?? null;
  const baseTitle = (exam as { title?: string }).title || '시험지';
  const newTitle = `${baseTitle} (유사)`;

  const { data: newExam, error: insErr } = await sb
    .from('exams')
    .insert({
      institute_id: instId,
      created_by: teacherId,
      title: newTitle,
      grade: (exam as { grade?: string | null }).grade ?? null,
      subject: (exam as { subject?: string | null }).subject ?? null,
      status: 'DRAFT',
    })
    .select('id')
    .single();
  if (insErr || !newExam) {
    console.error('[create-similar] exam INSERT 실패:', insErr?.message);
    return NextResponse.json({ error: '유사 시험지 생성 실패', detail: insErr?.message }, { status: 500 });
  }
  const newExamId = (newExam as { id: string }).id;

  const rows = newIds.map((pid, i) => ({ exam_id: newExamId, problem_id: pid, sequence_number: i + 1 }));
  const { error: epErr } = await sb.from('exam_problems').insert(rows);
  if (epErr) {
    console.error('[create-similar] exam_problems INSERT 실패:', epErr.message);
    return NextResponse.json({ examId: newExamId, error: '문항 연결 일부 실패', detail: epErr.message }, { status: 207 });
  }

  console.log(`[create-similar] ★ 유사 시험지 생성: ${newExamId} (${replaced}/${origIds.length} 교체) from ${examId}`);
  return NextResponse.json({
    examId: newExamId,
    title: newTitle,
    total: origIds.length,
    replaced,
    keptOriginal: origIds.length - replaced,
  });
}
