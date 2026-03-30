const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 서여고 시험 확인
  const { data: exam } = await sb.from('exams').select('id').ilike('title','%서여고%').single();
  console.log('서여고 exam_id:', exam ? exam.id : 'NOT FOUND');

  if (exam) {
    const { data: eps } = await sb.from('exam_problems')
      .select('problem_id,sequence_number')
      .eq('exam_id', exam.id)
      .order('sequence_number');

    console.log('서여고 문제 수:', (eps||[]).length);

    for (const ep of (eps || [])) {
      const { data: prob } = await sb.from('problems')
        .select('id,ai_analysis,images')
        .eq('id', ep.problem_id)
        .single();

      if (prob) {
        const fd = prob.ai_analysis ? prob.ai_analysis.figureData : null;
        const hasFig = prob.ai_analysis ? prob.ai_analysis.hasFigure : false;

        if (hasFig || fd) {
          console.log(
            '\n문제', ep.sequence_number,
            '| hasFig:', hasFig,
            '| figureData:', fd ? fd.figureType : 'NONE'
          );
          if (fd && fd.rendering) {
            if (fd.rendering.expressions) {
              console.log('  expressions:', JSON.stringify(fd.rendering.expressions.map(e => e.latex)));
            }
            if (fd.rendering.points) {
              console.log('  points:', fd.rendering.points.map(p => p.label+'('+p.x+','+p.y+')').join(', '));
            }
            if (fd.rendering.vertices) {
              console.log('  vertices:', fd.rendering.vertices.map(v => v.label+'('+v.x+','+v.y+')').join(', '));
            }
          }
        }
      }
    }
  }

  // cloud_files / cloud_jobs 테이블에 경남고 데이터가 있는지 확인
  for (const table of ['cloud_files', 'cloud_jobs', 'book_groups', 'upload_jobs']) {
    const { data, error } = await sb.from(table).select('*').limit(3);
    if (error) {
      console.log('\n' + table + ': NOT EXISTS or ERROR -', error.message);
    } else {
      console.log('\n' + table + ':', data.length, 'rows');
      if (data[0]) console.log('  columns:', Object.keys(data[0]).join(', '));
    }
  }
})();
