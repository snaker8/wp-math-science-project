// ============================================================================
// PUT /api/book-groups/[groupId] - 북그룹 수정 (이름, 부모, 정렬순서)
// DELETE /api/book-groups/[groupId] - 북그룹 완전 삭제 (hard delete)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 격리 가드 — book_group 의 institute 가 scope 안인지 검증.
 *
 * NULL (공통풀):
 *   - 읽기 (requireWrite: false): 모두 통과
 *   - 쓰기 (requireWrite: true): super_admin only (2026-05-17 P0-4)
 */
async function guardBookGroupAccess(
  client: SupabaseClient,
  groupId: string,
  scope: import('@/lib/security/institute-guard').InstituteAccessScope,
  options: { requireWrite?: boolean } = {}
): Promise<NextResponse | null> {
  const { data: group } = await client
    .from('book_groups')
    .select('institute_id')
    .eq('id', groupId)
    .maybeSingle();
  if (!group) return NextResponse.json({ error: 'Book group not found' }, { status: 404 });
  const targetInstituteId = (group as { institute_id: string | null }).institute_id;
  if (targetInstituteId === null) {
    // 공통 풀 — 쓰기 시 super_admin only
    if (options.requireWrite && !scope.isSuperAdmin) {
      return NextResponse.json({ error: 'Common pool write requires super_admin' }, { status: 403 });
    }
    return null;
  }
  try {
    assertInstituteAccess(scope, targetInstituteId);
    return null;
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { groupId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }
  const guardErr = await guardBookGroupAccess(supabaseAdmin, groupId, authed.data.scope, { requireWrite: true });
  if (guardErr) return guardErr;

  try {
    const body = await request.json();
    const { name, parentId, sortOrder, subject } = body;

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (parentId !== undefined) updateData.parent_id = parentId;
    if (sortOrder !== undefined) updateData.sort_order = sortOrder;
    if (subject !== undefined) updateData.subject = subject;

    const { data: group, error } = await supabaseAdmin
      .from('book_groups')
      .update(updateData)
      .eq('id', groupId)
      .select('*')
      .single();

    if (error) {
      console.error('[API/book-groups] Update error:', error.message);
      return NextResponse.json(
        { error: 'Failed to update book group', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ group });
  } catch (err) {
    console.error('[API/book-groups] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { groupId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }
  const guardErr = await guardBookGroupAccess(supabaseAdmin, groupId, authed.data.scope, { requireWrite: true });
  if (guardErr) return guardErr;

  try {
    // 삭제 전: 이 그룹에 속한 시험지를 미분류로 이동
    await supabaseAdmin
      .from('exams')
      .update({ book_group_id: null })
      .eq('book_group_id', groupId);

    // 자식 그룹도 미분류로 이동 후 삭제
    const { data: children } = await supabaseAdmin
      .from('book_groups')
      .select('id')
      .eq('parent_id', groupId);

    if (children && children.length > 0) {
      for (const child of children) {
        // 자식 그룹의 시험지도 미분류로
        await supabaseAdmin
          .from('exams')
          .update({ book_group_id: null })
          .eq('book_group_id', child.id);
      }
      // 자식 그룹 hard delete
      const childIds = children.map((c: any) => c.id);
      await supabaseAdmin
        .from('book_groups')
        .delete()
        .in('id', childIds);
    }

    // 본 그룹 hard delete
    const { error } = await supabaseAdmin
      .from('book_groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('[API/book-groups] Delete error:', error.message);
      return NextResponse.json(
        { error: 'Failed to delete book group', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, groupId });
  } catch (err) {
    console.error('[API/book-groups] Delete unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
