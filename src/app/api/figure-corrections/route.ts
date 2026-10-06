// ==========================================================================
// /api/figure-corrections — 도형 교정 이력 CRUD
//
// POST: 사용자가 도형을 교체할 때 before/after 기록
// GET:  유사 교정 사례 검색 (few-shot 예시용)
// ==========================================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { inferFigureTypeFromSvg, fetchProblemTypeCode } from '@/lib/vision/figure-learning';
import { requireAuthScope } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

// ── POST: 교정 기록 저장 ──
export async function POST(request: NextRequest) {
  // ★ 인증 필수 — 비로그인 임의 기록 차단 (호출처는 모두 로그인 대시보드)
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      problemId,
      correctionType,        // svg_paste | svg_file_upload | image_upload | diagram_db | use_original
      correctedImageUrl,
      correctedSvgSource,
      correctionNote,
      figureType: clientFigureType,  // ★ 클라이언트가 넘겨주면 우선 사용
    } = body as {
      problemId: string;
      correctionType: string;
      correctedImageUrl?: string;
      correctedSvgSource?: string;
      correctionNote?: string;
      figureType?: string;
    };

    if (!problemId || !correctionType) {
      return NextResponse.json({ error: 'problemId, correctionType 필수' }, { status: 400 });
    }

    // ── 문제 정보 자동 조회 (서버에서 채움, 실패해도 교정 기록은 저장) ──
    // ★ problems 테이블엔 'subject' 컬럼 없음 (이전엔 잘못 select하여 쿼리 자체 실패 → ai_analysis도 못 가져옴)
    const { data: problem } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, ai_analysis, images')
      .eq('id', problemId)
      .single();

    // ★ 문제를 못 찾아도 교정 기록은 저장 (problemId만으로 충분)
    const ai = (problem?.ai_analysis || {}) as Record<string, unknown>;
    const figureData = ai.figureData as Record<string, unknown> | undefined;
    const originalFigureSource = (ai.figureSource as string) || 'none';
    const originalSvg = (ai.figureSvg as string) || null;
    const originalImageUrl = (ai.upscaledCropUrl as string) || null;
    // ★ figureType 우선순위: 클라이언트 입력 → ai_analysis → SVG 내용 추론
    let figureType = clientFigureType
      || (figureData?.figureType as string)
      || (ai.figureType as string)
      || null;
    if (!figureType && correctedSvgSource) {
      figureType = inferFigureTypeFromSvg(correctedSvgSource);
    }
    if (!figureType && originalSvg) {
      figureType = inferFigureTypeFromSvg(originalSvg);
    }
    // ★ 단원 코드: ai_analysis 에 없으면 classifications 에서 (2026-10-06 — 338건 중 0건이 채워져 있어 "같은 단원 사례" 매칭이 죽어 있었다)
    const mathsecrTypeCode = (ai.typeCode as string) || (ai.expandedTypeCode as string) || (problem ? await fetchProblemTypeCode(problemId) : null);

    if (!problem) {
      console.warn(`[figure-corrections] 문제 ${problemId} 미발견 — 교정 기록만 저장`);
    }

    // ── 저장 ──
    const { data: correction, error: insertErr } = await supabaseAdmin
      .from('figure_corrections')
      .insert({
        problem_id: problem ? problemId : null,
        problem_content: problem?.content_latex?.slice(0, 2000) || null,
        problem_subject: null, // problems 테이블에 subject 컬럼 없음 — figure-corrections 자체 검색에는 미사용
        mathsecr_type_code: mathsecrTypeCode,
        figure_type: figureType,
        original_figure_source: originalFigureSource,
        original_svg: originalSvg?.slice(0, 50000) || null,
        original_figure_data: figureData || null,
        original_image_url: originalImageUrl,
        corrected_svg_source: correctedSvgSource?.slice(0, 50000) || null,
        corrected_image_url: correctedImageUrl || null,
        correction_type: correctionType,
        correction_note: correctionNote || null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[figure-corrections] Insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    console.log(`[figure-corrections] 교정 기록 저장: ${correction?.id} (${correctionType}, figureType=${figureType})`);

    return NextResponse.json({ success: true, id: correction?.id });
  } catch (err) {
    console.error('[figure-corrections] POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}

// ── GET: 유사 교정 사례 검색 (few-shot 예시용) ──
// ※ 서버 파이프라인은 이 라우트가 아닌 lib/vision/correction-examples.ts 로 DB 직접 조회 — 인증 영향 없음.
export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const figureType = searchParams.get('figureType');           // graph, geometry, ...
    const typeCode = searchParams.get('typeCode');               // MS07-01-03-02
    const hasSvg = searchParams.get('hasSvg') === 'true';       // SVG 코드 있는 것만
    const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 20);

    let query = supabaseAdmin
      .from('figure_corrections')
      .select('id, problem_content, figure_type, mathsecr_type_code, original_svg, corrected_svg_source, corrected_image_url, correction_type, original_figure_source, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    // 필터링
    if (figureType) {
      query = query.eq('figure_type', figureType);
    }
    if (typeCode) {
      // 같은 중단원까지 매칭 (MS07-01-03 → MS07-01-03-*)
      const prefix = typeCode.split('-').slice(0, 3).join('-');
      query = query.like('mathsecr_type_code', `${prefix}%`);
    }
    if (hasSvg) {
      query = query.not('corrected_svg_source', 'is', null);
    }

    const { data: corrections, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 활용 카운트 증가 (비동기, 실패 무시)
    if (corrections && corrections.length > 0) {
      const ids = corrections.map(c => c.id);
      Promise.resolve(supabaseAdmin.rpc('increment_example_count', { correction_ids: ids })).catch(() => {});
    }

    return NextResponse.json({
      corrections: corrections || [],
      total: corrections?.length || 0,
    });
  } catch (err) {
    console.error('[figure-corrections] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
