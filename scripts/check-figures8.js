const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 모든 figureData 있는 문제 전체 상세 조회
  const { data: allProbs } = await sb.from('problems')
    .select('id,source_name,source_number,content_latex,ai_analysis,images')
    .not('ai_analysis', 'is', null)
    .limit(200);

  for (const p of (allProbs || [])) {
    if (!p.ai_analysis || !p.ai_analysis.figureData) continue;
    const fd = p.ai_analysis.figureData;
    const r = fd.rendering;

    console.log('\n' + '='.repeat(60));
    console.log('ID:', p.id.substring(0, 12));
    console.log('출처:', (p.source_name || '').substring(0, 40), '번호:', p.source_number);
    console.log('type:', fd.figureType, '| conf:', fd.confidence);
    console.log('desc:', (fd.description || '').substring(0, 80));

    if (r) {
      if (r.type === 'graph') {
        console.log('  expr:', JSON.stringify((r.expressions || []).map(e => e.latex)));
        console.log('  pts:', (r.points || []).map(pp => (pp.label||'')+'('+pp.x+','+pp.y+')').join(', '));
        console.log('  range: x', r.xRange, 'y', r.yRange);
        if (r.segments) console.log('  segs:', JSON.stringify(r.segments));
        if (r.shadedRegions) console.log('  shaded:', JSON.stringify(r.shadedRegions));
      } else if (r.type === 'geometry') {
        console.log('  verts:', (r.vertices || []).map(v => v.label+'('+v.x+','+v.y+')').join(', '));
        console.log('  segs:', JSON.stringify(r.segments));
        if (r.shadedRegions) console.log('  shaded:', JSON.stringify(r.shadedRegions));
        if (r.angles) console.log('  angles:', JSON.stringify(r.angles));
        if (r.lengths) console.log('  lengths:', JSON.stringify(r.lengths));
      } else if (r.type === 'table') {
        console.log('  headers:', JSON.stringify(r.headers));
        console.log('  rows:', JSON.stringify(r.rows));
      } else {
        console.log('  rendering:', JSON.stringify(r).substring(0, 200));
      }
    }

    const svgLen = p.ai_analysis.figureSvg ? p.ai_analysis.figureSvg.length : 0;
    console.log('  svg:', svgLen > 0 ? svgLen + 'ch' : '-');
    console.log('  imgs:', (p.images || []).length);
  }
})();
