const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 경남고 figureData 있는 문제들 상세
  const ids = ['c4f30e1e', '6b0fb945', 'c7d73e08', '4b5b8948'];

  for (const prefix of ids) {
    const { data: probs } = await sb.from('problems')
      .select('id,source_name,source_number,content_latex,ai_analysis,images')
      .ilike('id', prefix + '%')
      .limit(1);

    if (probs && probs[0]) {
      const p = probs[0];
      const fd = p.ai_analysis.figureData;
      const svgLen = p.ai_analysis.figureSvg ? p.ai_analysis.figureSvg.length : 0;

      console.log('\n' + '='.repeat(60));
      console.log('ID:', p.id.substring(0, 12));
      console.log('출처:', p.source_name, '번호:', p.source_number);
      console.log('내용:', (p.content_latex || '').substring(0, 100));
      console.log('이미지 수:', (p.images || []).length);
      if (p.images && p.images.length > 0) {
        for (const img of p.images) {
          console.log('  img:', img.type || 'unknown', img.label || '', (img.url || '').substring(0, 80));
        }
      }
      console.log('\nfigureData:');
      console.log('  type:', fd.figureType, '| conf:', fd.confidence);
      console.log('  description:', fd.description);

      if (fd.rendering) {
        const r = fd.rendering;
        console.log('  rendering.type:', r.type);

        if (r.expressions) {
          console.log('  expressions:', JSON.stringify(r.expressions));
        }
        if (r.points) {
          console.log('  points:', r.points.map(p => (p.label||'?')+'('+p.x+','+p.y+')').join(', '));
        }
        if (r.vertices) {
          console.log('  vertices:', r.vertices.map(v => v.label+'('+v.x+','+v.y+')').join(', '));
        }
        if (r.xRange) console.log('  xRange:', r.xRange, 'yRange:', r.yRange);
        if (r.segments) console.log('  segments:', JSON.stringify(r.segments));
        if (r.shadedRegions) console.log('  shadedRegions:', JSON.stringify(r.shadedRegions));
        if (r.headers) console.log('  headers:', JSON.stringify(r.headers));
        if (r.rows) console.log('  rows:', JSON.stringify(r.rows));
      }

      console.log('  figureSvg:', svgLen > 0 ? svgLen + ' chars' : 'NONE');
    }
  }
})();
