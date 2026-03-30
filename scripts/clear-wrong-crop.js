require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('No Supabase env vars found');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  // 업스케일된 문제들 찾기
  const { data, error } = await supabase
    .from('problems')
    .select('id, ai_analysis, images, content_latex, source_name')
    .not('ai_analysis', 'is', null)
    .limit(1000);

  if (error) { console.error('Query error:', error); return; }

  // 업스케일된 문제들 필터
  const upscaled = data.filter(p =>
    p.ai_analysis?.figureSource === 'upscaled_crop' ||
    p.ai_analysis?.upscaledCropUrl
  );

  console.log(`=== 업스케일된 문제 ${upscaled.length}개 ===\n`);
  for (const p of upscaled) {
    console.log('ID:', p.id);
    console.log('  출처:', p.source_name);
    console.log('  내용:', (p.content_latex || '').substring(0, 80));
    console.log('  figureSource:', p.ai_analysis?.figureSource);
    console.log('  upscaledCropUrl:', (p.ai_analysis?.upscaledCropUrl || '').substring(0, 80));
    console.log('  hasFigure:', p.ai_analysis?.hasFigure);
    console.log('  figureData:', p.ai_analysis?.figureData ? 'YES' : 'no');
    console.log('  images:', JSON.stringify((p.images || []).map(i => ({type: i.type, label: i.label}))));
    console.log('---');
  }

  // --fix 인자가 있으면 업스케일 데이터 삭제
  if (process.argv.includes('--fix')) {
    console.log('\n=== 잘못된 크롭/업스케일 데이터 삭제 중... ===\n');
    for (const p of upscaled) {
      const analysis = { ...p.ai_analysis };
      delete analysis.upscaledCropUrl;
      delete analysis.upscaleInfo;
      delete analysis.cropImageUrl;
      analysis.figureSource = null;

      // images 배열에서 crop 이미지 제거
      const cleanImages = (p.images || []).filter(img =>
        img.type !== 'crop' && img.type !== 'figure'
      );

      const { error: updateErr } = await supabase
        .from('problems')
        .update({
          ai_analysis: analysis,
          images: cleanImages,
        })
        .eq('id', p.id);

      if (updateErr) {
        console.error('Update error for', p.id, updateErr);
      } else {
        console.log('Cleared:', p.id, '-', (p.content_latex || '').substring(0, 50));
      }
    }

    // Storage에서 업스케일 이미지 파일도 삭제
    const paths = upscaled.map(p => `problem-crops/upscaled/${p.id}.png`);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage
        .from('source-files')
        .remove(paths);
      if (rmErr) console.error('Storage remove error:', rmErr);
      else console.log('Storage files removed:', paths.length);
    }

    console.log('\n완료! 이제 문제를 재생성하면 AI Vision으로 새 그래프가 만들어집니다.');
  } else {
    console.log('\n삭제하려면: node scripts/clear-wrong-crop.js --fix');
  }
}

main().catch(console.error);
