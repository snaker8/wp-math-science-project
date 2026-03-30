const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // book_groups 전체
  const { data: bgs } = await sb.from('book_groups').select('*');
  console.log('=== book_groups ===');
  for (const bg of (bgs || [])) {
    console.log(bg.id.substring(0,8), '| name:', bg.name, '| type:', bg.group_type, '| parent:', bg.parent_id ? bg.parent_id.substring(0,8) : '-');
  }

  // book_files 테이블
  for (const t of ['book_files', 'book_problems', 'file_problems', 'ocr_jobs', 'ocr_results']) {
    const { data, error } = await sb.from(t).select('*').limit(3);
    if (error) {
      // skip
    } else {
      console.log('\n' + t + ':', data.length, 'rows');
      if (data[0]) console.log('  cols:', Object.keys(data[0]).join(', '));
      for (const d of data) {
        const keys = Object.keys(d);
        const summary = keys.filter(k => typeof d[k] === 'string' || typeof d[k] === 'number').map(k => k + ':' + String(d[k]).substring(0,50)).join(' | ');
        console.log('  ', summary);
      }
    }
  }

  // 경남고 시험의 problems 확인 (source_name으로)
  const { data: probs } = await sb.from('problems').select('id,source_name,ai_analysis,images').ilike('source_name','%경남%').limit(30);
  console.log('\n=== source_name에 경남 포함 ===');
  console.log('count:', (probs||[]).length);
  for (const p of (probs || [])) {
    const fd = p.ai_analysis ? p.ai_analysis.figureData : null;
    const hasFig = p.ai_analysis ? p.ai_analysis.hasFigure : false;
    console.log('id:', p.id.substring(0,8), '| src:', p.source_name, '| fig:', hasFig, '| figData:', fd ? fd.figureType : '-');
  }

  // 또는 모든 figureData가 있는 문제
  const { data: allProbs } = await sb.from('problems').select('id,source_name,ai_analysis').not('ai_analysis', 'is', null).limit(100);
  let figCount = 0;
  console.log('\n=== figureData가 있는 모든 문제 ===');
  for (const p of (allProbs || [])) {
    const fd = p.ai_analysis ? p.ai_analysis.figureData : null;
    if (fd) {
      figCount++;
      console.log('id:', p.id.substring(0,8), '| src:', (p.source_name||'').substring(0,20), '| type:', fd.figureType, '| conf:', fd.confidence);
    }
  }
  console.log('Total with figureData:', figCount);
})();
