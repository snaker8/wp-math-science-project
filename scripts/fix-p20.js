require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const problemId = '0ad80f05-84e8-44eb-9fe1-d96a04919cbc';

async function main() {
  const { data: p } = await supabase.from('problems').select('content_latex').eq('id', problemId).single();
  let content = p.content_latex;

  // egin{tabular} 위치 찾기
  const eginIdx = content.indexOf('egin{tabular}');
  console.log('egin{tabular} idx:', eginIdx);

  if (eginIdx >= 0) {
    // 앞의 백스페이스/백슬래시 포함
    let cutStart = eginIdx - 1;
    if (cutStart < 0) cutStart = eginIdx;

    // end{tabular} 끝 찾기
    const endMarker = 'end{tabular}';
    const endIdx = content.indexOf(endMarker, eginIdx);
    if (endIdx >= 0) {
      // end 앞의 \ or backspace도 포함
      let actualEnd = endIdx + endMarker.length;
      let actualStart = cutStart;
      // 앞의 \n도 제거
      while (actualStart > 0 && content[actualStart - 1] === '\n') actualStart--;

      const before = content.slice(0, actualStart).trimEnd();
      const after = content.slice(actualEnd).trimStart();
      content = before + '\n\n[도형2]\n\n' + after;
      console.log('치환 성공!');
    }
  }

  console.log('has [도형1]:', content.includes('[도형1]'));
  console.log('has [도형2]:', content.includes('[도형2]'));
  console.log('\n=== 최종 ===');
  console.log(content);

  const { error } = await supabase.from('problems').update({ content_latex: content }).eq('id', problemId);
  console.log('\n업데이트:', error ? error.message : '성공');
}
main().catch(console.error);
