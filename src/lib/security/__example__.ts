// ============================================================================
// institute-guard 사용 예시 — 실제 API route 에서 어떻게 쓰는지 demonstration
//
// 이 파일은 실제로 import 되지 않음 (예시 + 타입 검증용).
// ============================================================================

import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import {
  getUserAccessScope,
  applyInstituteFilter,
  assertInstituteAccess,
  resolveInsertInstituteId,
} from './institute-guard';

// ─── Pattern 1: SELECT with institute filter ──────────────────────────────
export async function exampleListExams() {
  const sb = await createSupabaseServerClient();
  if (!sb || !supabaseAdmin) {
    return new Response('Supabase not configured', { status: 500 });
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const scope = await getUserAccessScope(supabaseAdmin, user.id, user.app_metadata);

  const baseQuery = supabaseAdmin
    .from('exams')
    .select('id, title, institute_id')
    .order('created_at', { ascending: false });

  const filteredQuery = applyInstituteFilter(baseQuery, scope);
  const { data, error } = await filteredQuery;

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ exams: data });
}

// ─── Pattern 2: SELECT with common pool (problems) ─────────────────────────
export async function exampleListProblems() {
  const sb = await createSupabaseServerClient();
  if (!sb || !supabaseAdmin) return new Response('config', { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const scope = await getUserAccessScope(supabaseAdmin, user.id, user.app_metadata);

  const baseQuery = supabaseAdmin.from('problems').select('id, content, institute_id');
  const filteredQuery = applyInstituteFilter(baseQuery, scope, { allowCommonPool: true });
  const { data } = await filteredQuery;

  return Response.json({ problems: data });
}

// ─── Pattern 3: assertInstituteAccess for direct ID access ─────────────────
export async function exampleGetExamById(examId: string) {
  const sb = await createSupabaseServerClient();
  if (!sb || !supabaseAdmin) return new Response('config', { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const scope = await getUserAccessScope(supabaseAdmin, user.id, user.app_metadata);

  const { data: exam, error } = await supabaseAdmin
    .from('exams')
    .select('*')
    .eq('id', examId)
    .maybeSingle();

  if (error) return new Response(error.message, { status: 500 });
  if (!exam) return new Response('not found', { status: 404 });

  try {
    assertInstituteAccess(scope, exam.institute_id);
  } catch {
    return new Response('forbidden', { status: 403 });
  }

  return Response.json({ exam });
}

// ─── Pattern 4: INSERT with resolved institute_id ──────────────────────────
export async function exampleCreateExam(payload: { title: string; institute_id?: string }) {
  const sb = await createSupabaseServerClient();
  if (!sb || !supabaseAdmin) return new Response('config', { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const scope = await getUserAccessScope(supabaseAdmin, user.id, user.app_metadata);

  let resolvedInstituteId: string;
  try {
    resolvedInstituteId = resolveInsertInstituteId(scope, payload.institute_id);
  } catch (e) {
    return new Response((e as Error).message, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('exams')
    .insert({
      title: payload.title,
      institute_id: resolvedInstituteId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ exam: data });
}
