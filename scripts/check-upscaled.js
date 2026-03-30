require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('No Supabase env vars found');
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  // 1. problem-crops/upscaled/ 폴더 확인
  const { data: files, error } = await supabase.storage
    .from('source-files')
    .list('problem-crops/upscaled', { limit: 10 });

  console.log('=== Files in problem-crops/upscaled/ ===');
  if (error) {
    console.log('Error:', error.message);
  } else if (!files || files.length === 0) {
    console.log('No files found (folder is empty or does not exist)');
  } else {
    files.forEach(f => console.log(`  ${f.name} (${f.metadata?.size || '?'} bytes)`));
  }

  // 2. ai_analysis에 upscaledCropUrl이 있는 문제 찾기
  const { data: problems, error: pErr } = await supabase
    .from('problems')
    .select('id, ai_analysis')
    .not('ai_analysis', 'is', null)
    .limit(500);

  if (pErr) {
    console.log('\nDB Error:', pErr.message);
    return;
  }

  const upscaledProblems = (problems || []).filter(p =>
    p.ai_analysis && (p.ai_analysis.upscaledCropUrl || p.ai_analysis.figureSource === 'upscaled_crop')
  );

  console.log(`\n=== Problems with upscaledCropUrl (${upscaledProblems.length}) ===`);
  upscaledProblems.forEach(p => {
    const ai = p.ai_analysis;
    console.log(`  ID: ${p.id}`);
    console.log(`    figureSource: ${ai.figureSource}`);
    console.log(`    upscaledCropUrl: ${ai.upscaledCropUrl}`);
    console.log(`    upscaleInfo: ${JSON.stringify(ai.upscaleInfo)}`);
    console.log();
  });
}

check().catch(console.error);
