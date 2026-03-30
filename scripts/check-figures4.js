const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // exam_problems 테이블 확인
  const { data: ep, error: epErr } = await sb.from('exam_problems').select('*').limit(3);
  if (epErr) {
    console.log('exam_problems error:', epErr.message);
  } else {
    console.log('=== exam_problems 컬럼 ===');
    if (ep[0]) console.log(Object.keys(ep[0]).join(', '));
    console.log('count:', ep.length);
  }

  // 경남고 시험의 문제들 (exam_problems join)
  const { data: exam } = await sb.from('exams').select('id').ilike('title','%경남%').single();
  if (exam) {
    console.log('\n경남고 exam_id:', exam.id);

    const { data: eps } = await sb.from('exam_problems')
      .select('problem_id,order_index')
      .eq('exam_id', exam.id)
      .order('order_index');

    console.log('경남고 문제 수:', (eps||[]).length);

    // 각 문제의 figureData 확인
    for (const ep of (eps || [])) {
      const { data: prob } = await sb.from('problems')
        .select('id,ai_analysis,images')
        .eq('id', ep.problem_id)
        .single();

      if (prob) {
        const fd = prob.ai_analysis ? prob.ai_analysis.figureData : null;
        const svgLen = prob.ai_analysis && prob.ai_analysis.figureSvg ? prob.ai_analysis.figureSvg.length : 0;
        const hasFig = prob.ai_analysis ? prob.ai_analysis.hasFigure : false;
        const imgCount = (prob.images || []).length;

        if (hasFig || fd) {
          console.log(
            '\n문제', ep.order_index,
            '| hasFig:', hasFig,
            '| figureData:', fd ? fd.figureType + '(conf:' + fd.confidence + ')' : 'NONE',
            '| svg:', svgLen > 0 ? svgLen + 'ch' : '-',
            '| imgs:', imgCount
          );
          if (fd && fd.rendering) {
            console.log('  rendering.type:', fd.rendering.type);
            if (fd.rendering.expressions) {
              console.log('  expressions:', JSON.stringify(fd.rendering.expressions.map(e => e.latex)));
            }
            if (fd.rendering.points) {
              console.log('  points:', fd.rendering.points.map(p => p.label+'('+p.x+','+p.y+')').join(', '));
            }
            if (fd.rendering.vertices) {
              console.log('  vertices:', fd.rendering.vertices.map(v => v.label+'('+v.x+','+v.y+')').join(', '));
            }
            console.log('  xRange:', fd.rendering.xRange, 'yRange:', fd.rendering.yRange);
            if (fd.rendering.segments) console.log('  segments:', JSON.stringify(fd.rendering.segments));
            if (fd.rendering.shadedRegions) console.log('  shadedRegions:', JSON.stringify(fd.rendering.shadedRegions));
          }
        }
      }
    }
  }
})();
