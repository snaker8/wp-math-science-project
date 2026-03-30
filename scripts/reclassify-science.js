// 과학 문제 일괄 재분류 스크립트 (GPT-4o + 상세 난이도 판정 프롬프트)
require('dotenv').config();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

const examId = '32ec4a4c-a932-4e0e-8846-268c49e05dd4';

const PROMPT = `당신은 한국 고등학교 과학 교육과정 전문가이자 수능/모의고사 과학 출제위원급 전문가입니다.

■ 과목: 공통과학1 (2015 개정 통합과학 / 2022 개정 공통과학1)

■ 공통과학 소단원 + 유형분류 (2022 개정, 하이탑 기준) — 32소단원 76유형
1-1-1.기본량과 측정: 01.시간과 공간, 02.기본량과 유도량, 03.측정과 측정 표준
1-1-2.신호와 디지털 정보: 01.신호와 정보
2-1-1.우주 초기의 원소: 01.스펙트럼과 우주의 원소 분포, 02.빅뱅과 우주 초기 원소의 생성
2-1-2.지구와 생명체를 이루는 원소의 생성: 01.지구와 생명체를 구성하는 원소의 생성, 02.태양계와 지구의 형성
2-2-1.원소의 주기성: 01.원소와 주기율표, 02.원소의 주기성이 나타나는 까닭
2-2-2.화학 결합과 물질의 성질: 01.화학 결합의 원리, 02.화학 결합의 종류와 물질의 성질
2-2-3.자연의 구성 물질: 01.지각과 생명체의 구성 물질, 02.지각을 구성하는 물질의 규칙성, 03.생명체를 구성하는 물질의 규칙성, 04.단백질, 05.핵산
2-2-4.물질의 전기적 성질과 활용: 01.물질의 전기적 성질, 02.반도체
3-1-1.지구시스템의 구성요소: 01.지구 시스템의 구성 요소
3-1-2.지구시스템의 상호작용: 01.지구 시스템의 에너지 이동과 물질 순환, 02.지구시스템의 상호 작용
3-1-3.지권의 변화: 01.변동대와 판 구조론, 02.판의 경계와 지각 변동, 03.지권의 변화가 지구 시스템에 미치는 영향
3-2-1.중력장 내의 운동: 01.자유 낙하 운동, 02.수평 방향으로 던진 물체의 운동, 03.지구 주위를 공전하는 물체의 운동
3-2-2.운동량과 충격량: 01.관성과 관성 법칙, 02.운동량과 충격량, 03.충돌과 안전장치
3-3-1.생명 시스템의 기본 단위: 01.생명 시스템, 02.세포의 구조와 기능
3-3-2.물질대사와 효소: 01.물질대사, 02.효소
3-3-3.세포 내 정보의 흐름: 01.세포막의 구조와 기능, 02.확산, 03.삼투, 04.유전자와 단백질, 05.유전정보의 흐름
4-1-1.지질 시대의 환경과 생물: 01.화석과 지질 시대, 02.지질 시대의 환경과 생물, 03.대멸종과 생물다양성
4-1-2.자연선택과 진화: 01.변이와 자연 선택, 02.변이와 자연선택에 의한 생물의 진화
4-1-3.생물다양성과 보전: 01.생물 다양성, 02.생물다양성의 감소 원인과 보전
4-2-1.산화와 환원: 01.산소의 이동과 산화 환원 반응, 02.전자의 이동과 산화 환원 반응, 03.일상생활 속 산화 환원 반응
4-2-2.산과 염기의 중화반응: 01.산과 염기, 02.지시약, 03.중화 반응, 04.중화 반응이 일어날 때의 변화, 05.일상생활 속 중화반응
4-2-3.물질 변화에서 에너지 출입: 01.물질 변화와 에너지 출입, 02.우리 주변에서 에너지 출입을 이용한 예
5-1-1.생태계의 구성 요소: 01.생태계를 구성하는 요소, 02.생물과 환경의 상호작용
5-1-2.생태계의 평형: 01.먹이 관계와 생태 피라미드
5-1-3.환경 변화가 생태계에 미치는 영향: 01.생태계평형과 환경변화
5-2-1.온실 효과와 지구 온난화: 01.온실효과와 지구 온난화, 02.엘니뇨, 03.사막화
5-2-2.지구 환경 변화와 인간 생활: 01.미래의 지구 환경변화와 대처방안
5-3-1.태양 에너지의 생성과 전환: 01.태양 에너지의 생성과 전환, 02.태양 에너지의 전환과 흐름
5-3-2.발전: 01.전자기 유도, 02.발전
5-3-3.에너지 효율과 신재생 에너지: 01.에너지 전환과 보존, 02.에너지 효율, 03.신재생 에너지
6-1-1.과학의 유용성과 빅데이터의 활용: 01.과학의 유용성과 필요성, 02.과학 기술 사회에서의 빅데이터의 활용
6-1-2.과학 기술의 발전과 과학 윤리: 01.과학 기술과 미래 사회, 02.과학 관련 사회적 쟁점과 과학 윤리

■ 난이도 6단계 (사고 과정의 복잡도 기준 — "문항 길이/그림 유무/계산량"이 아닌 학생의 사고 과정 복잡도로 결정)
※ 기본 태그 1~5 중 1개만 선택. 6(특이)는 필요 시 추가 중복.

1(개념): 정의/용어/사실을 '알면 바로'. 단순 분류, 한 문장 개념 진위 판단.
  - 판정: 계산 없거나 개념 확인 수준. 자료(그래프/표)가 있어도 읽을 필요 없이 답이 나오면 1.

2(이해): 원리/개념을 '한 번 적용'하거나 '단순 계산' 1회로 해결.
  - 판정: "개념 1개 + 절차 1개(대입/비교)"로 끝남. 자료해석이 본질 아님, 추론 길지 않음.

3(해석): 자료(그래프/표/실험결과)를 읽고 해석하는 것이 핵심.
  - 판정: 자료를 안 읽으면 못 푸는 구조. 계산 있어도 "자료에서 값/관계 추출"이 더 중요하면 3.

4(응용): 복합 조건/합답형(ㄱㄴㄷ)/상위·타단원 연계 등 '여러 개념을 묶어' 해결.
  - 판정: 단일 공식으로 끝나지 않음. "개념 A 적용 → 결과를 개념 B에 다시 적용" 연결.
  - ★ 합답형(ㄱㄴㄷ)은 원칙적으로 4(응용)에 우선 배치.

5(최고난도): 비정형 추론/모델링/복합 계산/숨은 조건 추론.
  - 판정: 풀이가 여러 갈래 분기, 계산·추론·연계 동시에 높음. 합답형+고난도추론→5.

6(특이, 중복 태그): 범위 밖/문항 오류/형식 특이.
  - 부여 사유: 범위 밖, 문항 오류/불완전, 형식 특이, 과도한 융합.

■ 경계 사례 규칙 (일관성 확보):
- 자료 있지만 "읽기만 하면 답" → 3(해석)
- 자료해석 + 개념 2개 이상 연결 → 4(응용)
- 자료해석 + 숨은 조건 추론/모델링 → 5(최고난도)
- 계산 길어도 공식 대입 반복이면 2(이해) 또는 3(해석, 자료 기반이면)
- 합답형(ㄱㄴㄷ)은 원칙적으로 4(응용). 추론 구조가 고난도면 5(최고난도)

반드시 아래 JSON 구조로만 응답:
{
  "classification": {
    "typeCode": "IS1-소단원번호-유형번호",
    "typeName": "유형 이름",
    "subject": "공통과학1",
    "scienceSubject": "IS1",
    "chapter": "대단원 (예: 2-2.물질의 규칙성과 결합)",
    "section": "소단원 (반드시 위 32개 목록에서 선택)",
    "subsection": "유형분류 (반드시 위 76개 목록에서 선택)",
    "difficulty": 3,
    "difficultyLabel": "해석",
    "difficultyScores": {
      "concept_count": 1, "step_count": 2, "calc_complexity": 1,
      "thinking_level": 2, "data_interpretation": 2, "trap_misconception": 0, "total": 8,
      "extra_tag": ""
    },
    "cognitiveDomain": "UNDERSTANDING 또는 CALCULATION 또는 INFERENCE 또는 PROBLEM_SOLVING",
    "confidence": 0.85
  },
  "solution": {
    "approach": "풀이 핵심 전략 요약",
    "steps": [{"stepNumber": 1, "description": "풀이 과정 (30자 이상)", "explanation": "근거"}],
    "finalAnswer": "최종 정답 (객관식: 반드시 번호 포함. 합답형: ㄱ,ㄷ + 해당 선택지 번호)"
  }
}

★ finalAnswer: 반드시 번호로 답하세요.
★ 합답형: 각 보기(ㄱ,ㄴ,ㄷ)를 하나씩 검증 후 정답 명시.
★ section: 반드시 위 32개 소단원 목록에서 정확히 선택.`;

async function main() {
  const epRes = await fetch(url + '/rest/v1/exam_problems?exam_id=eq.' + examId + '&select=problem_id&order=sequence_number.asc', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const eps = await epRes.json();
  const ids = eps.map(e => e.problem_id);

  const pRes = await fetch(url + '/rest/v1/problems?id=in.(' + ids.join(',') + ')&select=id,source_number,content_latex,ai_analysis,answer_json&order=source_number.asc', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const problems = await pRes.json();
  console.log('GPT-4o 재분류 (상세 프롬프트) — ' + problems.length + '문제\n');

  for (const p of problems) {
    const contentText = p.content_latex || '';
    const choices = p.answer_json?.choices || [];
    const nums = ['①','②','③','④','⑤'];
    const choicesText = choices.length > 0
      ? '\n선택지:\n' + choices.map((c, i) => '  ' + (nums[i]||'') + ' ' + c).join('\n')
      : '';

    if (!contentText.trim()) { console.log('#' + p.source_number + ' — 내용 없음'); continue; }
    process.stdout.write('#' + p.source_number + ' ');

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: '당신은 한국 고등학교 과학 교육과정 전문가이자 수능/모의고사 과학 출제위원급 전문가입니다. 반드시 유효한 JSON으로만 응답하세요. 설명 텍스트 없이 JSON만 출력하세요.' },
            { role: 'user', content: PROMPT + '\n\n문제:\n' + contentText.slice(0, 3000) + choicesText }
          ],
          temperature: 0.1,
          max_tokens: 3000,
          response_format: { type: 'json_object' }
        })
      });

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '{}';
      const analysis = JSON.parse(raw);

      const cls = analysis.classification || {};
      const sol = analysis.solution || {};

      const aiAnalysis = {
        ...(p.ai_analysis || {}),
        ...analysis,
        subject: cls.subject || '공통과학1',
        unit: cls.chapter || '',
        difficulty: cls.difficulty || 3,
        difficultyLabel: cls.difficultyLabel || '',
        cognitiveDomain: cls.cognitiveDomain || 'UNDERSTANDING',
        reanalyzedAt: new Date().toISOString(),
        reanalyzedModel: 'gpt-4o',
      };

      await fetch(url + '/rest/v1/problems?id=eq.' + p.id, {
        method: 'PATCH',
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ ai_analysis: aiAnalysis })
      });

      const scores = cls.difficultyScores || {};
      console.log(
        '<' + cls.difficulty + '>' + cls.difficultyLabel +
        ' | ' + cls.cognitiveDomain +
        ' | ' + (cls.section || '').slice(0, 28) +
        ' | ans:' + (sol.finalAnswer || '?').slice(0, 20) +
        ' | scores:' + (scores.total || '?')
      );
    } catch (err) {
      console.error('ERR:', err.message);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  console.log('\n=== 완료 ===');
}

main().catch(console.error);
