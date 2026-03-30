require('dotenv').config({ override: true });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const openaiKey = process.env.OPENAI_API_KEY;

const examId = '00ae2e6f-f1a6-4125-99a3-99fa5ab9835d';

async function main() {
  const { data: eps } = await supabase.from('exam_problems').select('problem_id,sequence_number').eq('exam_id', examId).eq('sequence_number', 17);
  const pid = eps[0].problem_id;
  const { data: p } = await supabase.from('problems').select('id,source_number,content_latex,ai_analysis,answer_json').eq('id', pid).single();

  const content = p.content_latex || '';
  const choices = p.answer_json?.choices || [];
  const nums = ['①','②','③','④','⑤'];
  const choicesText = choices.length > 0 ? '\n선택지:\n' + choices.map((c,i) => '  ' + (nums[i]||'') + ' ' + c).join('\n') : '';

  console.log('#17 분류 중...');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: '한국 중2-1 수학 전문가. JSON만 응답. LaTeX 수식 사용 금지 - 일반 텍스트로 작성.' },
        { role: 'user', content: '중2-1 수학. 단원: 1.유리수와순환소수 2.식의계산 3.부등식 4.연립방정식 5.일차함수\n난이도1~5.\nJSON: {"classification":{"typeName":"유형","subject":"중2-1 수학","chapter":"대단원","difficulty":3,"cognitiveDomain":"CALCULATION"},"solution":{"finalAnswer":"정답"}}\n\n문제:\n' + content.slice(0,2000) + choicesText }
      ],
      temperature: 0.1, max_tokens: 1000, response_format: { type: 'json_object' }
    })
  });

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';

  let analysis;
  try {
    analysis = JSON.parse(raw);
  } catch {
    // 강제 이스케이프 후 재시도
    const escaped = raw.replace(/\\/g, '\\\\');
    try {
      analysis = JSON.parse(escaped);
    } catch {
      console.log('파싱 실패, 수동 분류');
      analysis = { classification: { typeName: '식의 계산', subject: '중2-1 수학', chapter: '식의 계산', difficulty: 3, cognitiveDomain: 'CALCULATION' } };
    }
  }

  const cls = analysis.classification || {};
  const ai = p.ai_analysis || {};
  Object.assign(ai, analysis);
  ai.subject = cls.subject || '중2-1 수학';
  ai.unit = cls.chapter || '';
  ai.difficulty = cls.difficulty || 3;
  ai.cognitiveDomain = cls.cognitiveDomain || 'CALCULATION';
  ai.reanalyzedAt = new Date().toISOString();
  ai.reanalyzedModel = 'gpt-4o';

  await supabase.from('problems').update({ ai_analysis: ai }).eq('id', p.id);
  console.log('완료! ' + (cls.chapter||'?') + ' | ' + (cls.typeName||'?') + ' | diff:' + cls.difficulty + ' | ans:' + (analysis.solution?.finalAnswer||'?').slice(0,20));
}
main().catch(console.error);
