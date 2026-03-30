require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // 문제 3의 전체 데이터 확인
  const { data } = await supabase
    .from('problems')
    .select('id, images, ai_analysis, content_latex')
    .eq('id', 'b6b8c2bc-4dbb-463d-af83-51983e55fe39')
    .single();

  console.log('=== 문제 3 images 배열 ===');
  console.log(JSON.stringify(data.images, null, 2));

  console.log('\n=== ai_analysis 주요 필드 ===');
  const a = data.ai_analysis || {};
  console.log('cropImageUrl:', a.cropImageUrl);
  console.log('hasFigure:', a.hasFigure);
  console.log('figureSource:', a.figureSource);
  console.log('figureData:', a.figureData ? 'YES' : 'no');

  // 같은 시험의 다른 문제들도 확인
  const { data: ep } = await supabase
    .from('exam_problems')
    .select('exam_id')
    .eq('problem_id', 'b6b8c2bc-4dbb-463d-af83-51983e55fe39')
    .single();

  if (ep) {
    const { data: allEp } = await supabase
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', ep.exam_id)
      .order('sequence_number');

    console.log('\n=== 시험 전체 문제 images 현황 ===');
    for (const p of (allEp || [])) {
      const { data: prob } = await supabase
        .from('problems')
        .select('images, ai_analysis')
        .eq('id', p.problem_id)
        .single();
      const imgs = (prob && prob.images) || [];
      const types = imgs.map(function(i) {
        return i.type + ':' + (i.url || '').substring(0, 60);
      });
      const hasUpscale = prob && prob.ai_analysis && prob.ai_analysis.upscaledCropUrl;
      const hasFig = prob && prob.ai_analysis && prob.ai_analysis.hasFigure;
      console.log('#' + p.sequence_number, p.problem_id.substring(0, 8),
        'imgs(' + imgs.length + '):', types.length > 0 ? types.join(' | ') : 'none',
        hasUpscale ? '[업스케일]' : '',
        hasFig ? '[도형]' : '');
    }
  }

  // Storage에서 이 문제의 크롭 파일들 확인
  console.log('\n=== Storage: problem-crops/ ===');
  const { data: crops } = await supabase.storage
    .from('source-files')
    .list('problem-crops', { limit: 50, search: 'b6b8c2bc' });
  console.log(JSON.stringify(crops, null, 2));

  // content_latex에서 이미지 참조 확인
  console.log('\n=== content_latex 이미지 참조 ===');
  const latex = data.content_latex || '';
  const imgRefs = latex.match(/!\[.*?\]\(.*?\)|\\includegraphics.*?\}|<img[^>]+>/g);
  console.log(imgRefs || 'none');

  // content_latex 중 URL 패턴 찾기
  const urls = latex.match(/https?:\/\/[^\s)"']+|\/api\/storage[^\s)"']+/g);
  console.log('\nURLs in content:', urls || 'none');
}
main().catch(console.error);
