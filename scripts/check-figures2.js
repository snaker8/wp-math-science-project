const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  try {
    // 1) 시험 테이블 확인
    const { data: exams, error: exErr } = await sb.from('exams').select('id,title').limit(5);
    if (exErr) {
      console.log('exams error:', exErr.message);
    } else {
      console.log('exams count:', exams.length);
      for (const e of exams) console.log(' ', e.id.substring(0,12), e.title);
    }

    // 2) problems 테이블 확인
    const { data: probs, error: prErr } = await sb.from('problems').select('id,problem_number,exam_id,has_figure').limit(5);
    if (prErr) {
      console.log('problems error:', prErr.message);
    } else {
      console.log('\nproblems count:', probs.length);
      for (const p of probs) console.log(' ', p.id.substring(0,12), 'no:', p.problem_number, 'fig:', p.has_figure);
    }

    // 3) has_figure = true인 문제들
    const { data: figs, error: figErr } = await sb.from('problems')
      .select('id,problem_number,exam_id')
      .eq('has_figure', true)
      .limit(10);
    if (figErr) {
      console.log('fig query error:', figErr.message);
    } else {
      console.log('\nhas_figure=true:', figs.length);
      for (const f of figs) console.log(' ', f.id.substring(0,12), 'no:', f.problem_number, 'exam:', f.exam_id.substring(0,12));
    }

    // 4) 경남고 검색 — 여러 패턴
    for (const kw of ['경남', '서여고', '2025']) {
      const { data: res } = await sb.from('exams').select('id,title').ilike('title', '%' + kw + '%').limit(5);
      console.log('\n시험 검색 "' + kw + '":', (res || []).length);
      for (const e of (res || [])) console.log(' ', e.id.substring(0,12), e.title);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
})();
