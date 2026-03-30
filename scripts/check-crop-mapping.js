require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const examId = '28781c14-6791-4ba9-9b89-742205dd94b0';

  const { data, error } = await c
    .from('exam_problems')
    .select('sequence_number, problems(id, source_number, content_latex, images, ai_analysis)')
    .eq('exam_id', examId)
    .order('sequence_number');

  if (error) { console.error('Error:', error.message); return; }

  for (const row of data) {
    const p = row.problems;
    const imgs = Array.isArray(p.images) ? p.images : [];
    const crop = imgs.find(i => i.type === 'crop');
    const ai = p.ai_analysis || {};
    const contentSnippet = (p.content_latex || '').substring(0, 80).replace(/\n/g, ' ');

    console.log('#' + row.sequence_number + ' (src:' + p.source_number + ') id=' + p.id.substring(0, 8) + '...');
    console.log('  content: ' + contentSnippet + '...');
    console.log('  crop: ' + (crop ? crop.url.substring(crop.url.length - 60) : 'NONE'));
    console.log('  upscaledCropUrl: ' + (ai.upscaledCropUrl || 'NONE'));
    console.log('  figureSource: ' + (ai.figureSource || 'NONE') + ', hasFigure: ' + (ai.hasFigure || false));
    console.log('  figureData type: ' + (ai.figureData ? ai.figureData.figureType : 'NONE'));
    console.log('');
  }
})();
