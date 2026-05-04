// ============================================================================
// GET /api/book-groups - 북그룹 목록 조회
// POST /api/book-groups - 북그룹 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter, resolveInsertInstituteId } from '@/lib/security/institute-guard';

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');

    let query = supabaseAdmin
      .from('book_groups')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (subject) {
      query = query.eq('subject', subject);
    }

    // 격리 — 자기 institute + 공통 풀 (NULL)
    const filteredQuery = applyInstituteFilter(query, scope, { allowCommonPool: true });
    const { data: groups, error } = await filteredQuery;

    if (error) {
      console.error('[API/book-groups] List error:', error.message);
      return NextResponse.json(
        { error: 'Failed to fetch book groups', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ groups: groups || [] });
  } catch (err) {
    console.error('[API/book-groups] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { name, parentId, subject, groupType, instituteId, createdBy } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // INSERT institute_id 결정 — 명시 instituteId 가 scope 안이면 사용, 아니면 자기 institute
    let insertInstituteId: string;
    try {
      insertInstituteId = resolveInsertInstituteId(scope, instituteId);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }

    const insertData: Record<string, any> = {
      name: name.trim(),
      institute_id: insertInstituteId,
      created_by: createdBy || user.id,
    };

    if (parentId) insertData.parent_id = parentId;
    if (subject) insertData.subject = subject;
    if (groupType) insertData.group_type = groupType;

    let { data: group, error } = await supabaseAdmin
      .from('book_groups')
      .insert(insertData)
      .select('*')
      .single();

    // group_type 컬럼이 아직 없으면 해당 필드 제외 후 재시도
    if (error && insertData.group_type && error.message?.includes('group_type')) {
      console.warn('[API/book-groups] group_type column not found, retrying without it');
      delete insertData.group_type;
      const retry = await supabaseAdmin
        .from('book_groups')
        .insert(insertData)
        .select('*')
        .single();
      group = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[API/book-groups] Create error:', error.message);
      return NextResponse.json(
        { error: 'Failed to create book group', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[API/book-groups] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
