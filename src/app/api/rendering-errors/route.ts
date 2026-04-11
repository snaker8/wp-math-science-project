import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { problemId, errorType, errorDetail, rawInput, correction, metadata } = body;

    if (!errorType || !errorDetail) {
      return NextResponse.json({ error: 'errorType and errorDetail required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    await supabaseAdmin.from('rendering_errors').insert({
      problem_id: problemId || null,
      error_type: errorType,
      error_detail: errorDetail.substring(0, 2000),
      raw_input: rawInput?.substring(0, 2000) || null,
      correction: correction || null,
      metadata: metadata || {},
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[RenderingErrors] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('rendering_errors')
      .select('*')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // 에러 타입별 통계
    const stats: Record<string, number> = {};
    (data || []).forEach(row => {
      stats[row.error_type] = (stats[row.error_type] || 0) + 1;
    });

    return NextResponse.json({ errors: data, stats, total: data?.length || 0 });
  } catch (err) {
    console.error('[RenderingErrors] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
