// ============================================================================
// PUT /api/book-groups/[groupId] - 북그룹 수정 (이름, 부모, 정렬순서)
// DELETE /api/book-groups/[groupId] - 북그룹 완전 삭제 (hard delete)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

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
  const { groupId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

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
