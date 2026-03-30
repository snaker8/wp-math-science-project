// 기존 DB에 저장된 public URL을 프록시 URL로 변환
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function fix() {
  const { data: problems, error } = await supabase
    .from('problems')
    .select('id, ai_analysis')
    .not('ai_analysis', 'is', null)
    .limit(1000);

  if (error) { console.log('Error:', error.message); return; }

  let fixed = 0;
  for (const p of problems) {
    const ai = p.ai_analysis;
    if (!ai || !ai.upscaledCropUrl) continue;

    // public Supabase URL을 프록시 URL로 변환
    if (ai.upscaledCropUrl.includes('supabase.co/storage')) {
      const match = ai.upscaledCropUrl.match(/\/source-files\/(.+)$/);
      if (match) {
        const storagePath = decodeURIComponent(match[1]);
        const proxyUrl = `/api/storage/image?path=${encodeURIComponent(storagePath)}`;

        await supabase
          .from('problems')
          .update({
            ai_analysis: { ...ai, upscaledCropUrl: proxyUrl }
          })
          .eq('id', p.id);

        console.log(`Fixed: ${p.id} → ${proxyUrl}`);
        fixed++;
      }
    }
  }

  console.log(`\nDone: ${fixed} URLs fixed`);
}

fix().catch(console.error);
