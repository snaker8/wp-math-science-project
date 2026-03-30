const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const examId = '26b46c74-58d';  // 경남고

  // 컬럼명 확인
  const { data: cols } = await sb.from('problems').select('*').limit(1);
  if (cols && cols[0]) {
    console.log('=== problems 컬럼들 ===');
    console.log(Object.keys(cols[0]).join(', '));
  }

  // 경남고 시험의 모든 문제
  const { data: probs, error } = await sb.from('problems')
    .select('id,order_index,has_figure,ai_analysis,images')
    .eq('exam_id', '26b46c74-58db-4e3b-97e9-3d2e0e1b75ee')
    .order('order_index');

  if (error) {
    // exam_id가 부분 매치 안되면 full id로 다시
    const { data: exam } = await sb.from('exams').select('id').ilike('title','%경남%').single();
    if (exam) {
      const { data: probs2 } = await sb.from('problems')
        .select('id,order_index,has_figure,ai_analysis,images')
        .eq('exam_id', exam.id)
        .order('order_index');

      console.log('\n=== 경남고 문제 (', (probs2||[]).length, '개) ===');
      for (const p of (probs2 || [])) {
        const fd = p.ai_analysis ? p.ai_analysis.figureData : null;
        const svgLen = p.ai_analysis && p.ai_analysis.figureSvg ? p.ai_analysis.figureSvg.length : 0;
        const imgCount = (p.images || []).length;
        console.log(
          '문제', p.order_index,
          '| fig:', p.has_figure,
          '| figureData:', fd ? fd.figureType + '(' + fd.confidence + ')' : '-',
          '| svg:', svgLen > 0 ? svgLen + 'ch' : '-',
          '| imgs:', imgCount
        );

        // 도형 있는 문제 상세
        if (fd && fd.rendering) {
          console.log('  type:', fd.rendering.type);
          if (fd.rendering.expressions) {
            console.log('  expressions:', fd.rendering.expressions.map(e => e.latex));
          }
          if (fd.rendering.points) {
            console.log('  points:', fd.rendering.points.map(p => p.label + '(' + p.x + ',' + p.y + ')').join(', '));
          }
          console.log('  xRange:', fd.rendering.xRange, 'yRange:', fd.rendering.yRange);
        }
      }
    }
  } else {
    console.log('경남고 문제:', (probs||[]).length);
  }
})();
