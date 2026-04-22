// ============================================================================
// 문제 분류 공용 모듈 — Gemini Flash + GPT-4o 폴백
//
// auto-fix 의 검증된 분류 로직을 단일 함수로 추출:
//   - 수학비서 typeTable 주입 + COMBINED_SUBJECTS 병합
//   - Gemini 3 Flash 1차 호출 (rate-limit backoff)
//   - Gemini 빈 응답 시 GPT-4o 폴백
//   - Gemini 키 없을 때 GPT-4.1-mini 폴백
//   - JSON 파싱 (부분 추출 포함)
//
// 호출자 책임:
//   - DB 쓰기 (classifications, problems.ai_analysis)
//   - difficulty/cognitive_domain 저장용 매핑
//   - 에러 로깅 문맥
// ============================================================================

import { resolveSubjectCode, buildTypeTable } from './mathsecr-prompt';

// ─── 복합 과목: 이전 교육과정 시험지는 여러 과목 범위가 섞임 ───
const COMBINED_SUBJECTS: Record<string, string[]> = {
  '07': ['08'],       // 공통수학1 → +공통수학2 (2015 수학(상) = 다항식+방정식+좌표+집합)
  '08': ['07'],       // 공통수학2 → +공통수학1 (2015 수학(하) 범위 혼재)
  '09': ['10', '11'], // 대수(구 수학I) → +미적분1, 확통
  '10': ['09'],       // 미적분1(구 수학II) → +대수 (같은 학년 범위)
};

export interface ClassifyInput {
  /** 문제 본문 (content_latex). 앞 1500자만 사용됨. */
  content: string;
  /** 시험지 과목 (예: '수학II', '공통수학1') — resolveSubjectCode에 우선 전달 */
  examSubject: string;
  /** 시험지 학년 힌트 (예: '고2 수학') */
  examGrade: string;
  /** 문제 식별용 (로그용, 실패 시 맥락 확보) */
  logLabel?: string;
}

export interface ClassifyResult {
  typeCode: string;
  typeName: string;
  subject: string;
  chapter: string;
  section: string;
  difficulty: number;      // AI 원본 값 (1~10)
  cognitiveDomain: string; // 원본 (호출자가 VALID_COGNITIVE 매핑)
  confidence: number;      // AI 자기평가 (0~1)
  /** 실제 분류를 낸 모델 (gemini-3-flash-preview | gpt-4o | gpt-4.1-mini) */
  model: string;
}

/**
 * 단일 문제 분류 — Gemini 우선, 실패 시 GPT 폴백.
 * 반환값이 null이면 분류 불가 (콘텐츠 없음, 키 없음, 모든 시도 실패).
 */
export async function classifyProblem(input: ClassifyInput): Promise<ClassifyResult | null> {
  const { content, examSubject, examGrade, logLabel } = input;
  const label = logLabel || 'classify';

  if (!content.trim()) {
    console.warn(`[${label}] content 비어있음 — 분류 스킵`);
    return null;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

  if (!OPENAI_API_KEY && !GOOGLE_AI_KEY) {
    console.warn(`[${label}] API 키 모두 없음 — 분류 스킵`);
    return null;
  }

  // ─── typeTable 준비 ───
  let mathsecrTypeTable = '';
  let resolvedCode = '';
  try {
    resolvedCode = resolveSubjectCode(examGrade, examSubject) || '';
    if (resolvedCode) {
      mathsecrTypeTable = buildTypeTable(resolvedCode);
      const extras = COMBINED_SUBJECTS[resolvedCode] || [];
      for (const extra of extras) {
        mathsecrTypeTable += '\n\n' + buildTypeTable(extra);
      }
    }
  } catch (e) {
    console.warn(`[${label}] mathsecr-prompt load 실패:`, e);
  }

  // ★ 예시 코드를 명백히 placeholder로 → Gemini가 그대로 복사하지 못하게 (이전: 실제 유효 코드라 Gemini가 복붙)
  const examplePlaceholder = 'MS??-??-??-??-??';

  const userPrompt = `이 문제는 "${examSubject}" (${examGrade}) 시험지의 문제입니다.
반드시 해당 과목 범위 내에서 분류하세요.

${mathsecrTypeTable ? `아래 유형 테이블에서 가장 적합한 typeCode를 선택하세요:\n${mathsecrTypeTable}\n` : ''}
■ 난이도 (수학비서 기준, 1~10):
● 쉬움(1~2): 개념·정의만 알면 바로 풀림. 단순 용어, 기본 계산, 공식 직접 대입.
● 보통(3~4): 공식 1~2개 적용, 2~3단계 풀이. 기본 응용.
● 어려움(5~6): 2개 이상 개념 연결, 복합 조건, 자료 해석, 서술형.
● 매우어려움(7~10): 고난도 추론, 복합 서술형, 여러 개념 융합, 함정/오개념 포함.
★ 같은 유형이라도 문제마다 난이도가 다릅니다. 문제 내용을 보고 정확히 판정하세요.
★ 서술형/서논술형은 최소 5 이상. 합답형(ㄱㄴㄷ)은 최소 5 이상.

★★★ typeCode는 반드시 위 테이블에 있는 "| 코드 |" 컬럼 값 그대로 하나를 선택.
    아래 JSON은 형식 예시일 뿐, ${examplePlaceholder}를 그대로 복사하면 안 됨.
    실제 문제에 맞는 코드를 테이블에서 찾아 그 자리에 넣으세요.

JSON: {"classification":{"typeCode":"${examplePlaceholder}","typeName":"대단원 > 중단원 > 소단원 > 세부유형","subject":"${examSubject}","chapter":"대단원","section":"중단원","difficulty":4,"cognitiveDomain":"CALCULATION","confidence":0.9}}

문제:
${content.slice(0, 1500)}`;

  const systemPrompt = '한국 수학 교육과정 전문가. 수학비서 분류 체계로 문제를 분류합니다. 반드시 JSON만 응답.';

  let rawContent = '{}';
  let modelUsed = '';

  // ─── 1차: Gemini (있으면) ───
  //   gemini-3-flash-preview는 preview 할당량이 엄격해 Tier 1 유료여도 429 발생.
  //   gemini-2.5-flash는 stable 모델이라 Tier 1 본 한도(1000 RPM) 적용.
  if (GOOGLE_AI_KEY) {
    modelUsed = process.env.CLASSIFY_GEMINI_MODEL || 'gemini-2.5-flash';
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(GOOGLE_AI_KEY);
      const model = genAI.getGenerativeModel({
        model: modelUsed,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8000,
          responseMimeType: 'application/json',
        },
      });

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await model.generateContent(userPrompt);
          rawContent = result.response.text().trim();
          rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '').trim();
          lastError = null;
          break;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          if (lastError.message.includes('429') || lastError.message.includes('503')) {
            const waitSec = Math.min(15 * (attempt + 1), 30);
            console.log(`[${label}] Gemini rate-limited, ${waitSec}s 대기`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }
          break;
        }
      }
      if (lastError) throw lastError;

      // Gemini 빈 응답 → GPT-4o 폴백
      if (!rawContent || rawContent.trim().length < 10) {
        console.warn(`[${label}] Gemini 빈 응답 → GPT-4o 폴백`);
        if (OPENAI_API_KEY) {
          modelUsed = 'gpt-4o';
          const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.1,
              max_tokens: 2000,
              response_format: { type: 'json_object' },
            }),
          });
          if (gptRes.ok) {
            const gptData = await gptRes.json();
            rawContent = gptData.choices?.[0]?.message?.content || '{}';
          }
        }
      }
    } catch (err) {
      console.warn(`[${label}] Gemini 호출 전체 실패:`, err);
      // 아래 GPT 폴백으로 진행
      if (OPENAI_API_KEY) {
        modelUsed = 'gpt-4.1-mini';
      } else {
        return null;
      }
    }
  } else if (OPENAI_API_KEY) {
    // Gemini 키 없음 → 바로 GPT-4.1-mini
    modelUsed = 'gpt-4.1-mini';
  }

  // ─── 2차: rawContent가 여전히 비었으면 GPT-4.1-mini 마지막 시도 ───
  if ((!rawContent || rawContent.trim() === '{}' || rawContent.trim().length < 10) && OPENAI_API_KEY) {
    if (!modelUsed || modelUsed === 'gemini-3-flash-preview') {
      modelUsed = 'gpt-4.1-mini';
    }
    let gptRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: modelUsed === 'gpt-4o' ? 'gpt-4o' : 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
      });
      if (gptRes && gptRes.status !== 429) break;
      const waitSec = Math.min(15 * (attempt + 1), 30);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
    if (gptRes && gptRes.ok) {
      const gptData = await gptRes.json();
      rawContent = gptData.choices?.[0]?.message?.content || '{}';
    }
  }

  console.log(`[${label}] [${modelUsed}] 응답: ${rawContent.slice(0, 200)}`);

  // ─── JSON 파싱 (부분 추출 폴백 포함) ───
  let parsed: Record<string, unknown>;
  try {
    const parsedRaw = JSON.parse(rawContent);
    // ★ Gemini가 종종 배열로 감싸서 반환 — 첫 원소 언랩
    parsed = Array.isArray(parsedRaw) ? (parsedRaw[0] || {}) : parsedRaw;
  } catch {
    const tcMatch = rawContent.match(/"typeCode"\s*:\s*"(MS[\d-]+)"/);
    const tnMatch = rawContent.match(/"typeName"\s*:\s*"([^"]+)"/);
    const diffMatch = rawContent.match(/"difficulty"\s*:\s*(\d+)/);
    const confMatch = rawContent.match(/"confidence"\s*:\s*(\d*\.?\d+)/);
    if (tcMatch) {
      console.log(`[${label}] JSON 부분 추출: ${tcMatch[1]}`);
      parsed = {
        classification: {
          typeCode: tcMatch[1],
          typeName: tnMatch?.[1] || '',
          difficulty: parseInt(diffMatch?.[1] || '3'),
          confidence: parseFloat(confMatch?.[1] || '0.5'),
        },
      };
    } else {
      console.warn(`[${label}] JSON 파싱 실패, 부분 추출도 실패`);
      return null;
    }
  }

  // ★ { classification: {...} } 또는 평탄한 {...} 둘 다 지원
  const cls = (parsed.classification || parsed) as Record<string, unknown>;
  const typeCode = String(cls.typeCode || '');
  if (!typeCode) {
    console.warn(`[${label}] typeCode 비어있음`);
    return null;
  }

  // ★ 과목 prefix 검증 — examSubject와 맞는 subjectCode로 시작하는지.
  //   예: 공통수학1 시험지면 MS07, MS08(COMBINED) 만 허용
  //   Gemini가 다른 과목(MS02 중1-2 등) 코드 생성하면 거부 → null 반환
  if (resolvedCode) {
    const allowed = new Set([resolvedCode, ...(COMBINED_SUBJECTS[resolvedCode] || [])]);
    const codeSubjectMatch = typeCode.match(/^MS(\d{2})/);
    const codeSubject = codeSubjectMatch?.[1] || '';
    if (codeSubject && !allowed.has(codeSubject)) {
      console.warn(`[${label}] ✖ 과목 prefix 불일치: 기대=[${[...allowed].join(',')}] 받음=${codeSubject} (${typeCode}) — 분류 결과 거부`);
      return null;
    }
  }

  // ★ typeName은 항상 mathsecr_types DB의 full_path로 덮어씀 (AI 환각 방지)
  //   AI가 코드는 맞춰도 typeName을 잘못 생성하는 경우 다수 발견됨.
  //   DB에서 코드 유효성 검증 + 정확한 full_path 사용.
  let typeName = String(cls.typeName || '');
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (supabaseUrl && serviceKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: msType } = await sb
        .from('mathsecr_types')
        .select('full_path')
        .eq('code', typeCode)
        .limit(1)
        .maybeSingle();
      if (msType?.full_path) {
        typeName = msType.full_path as string;
        console.log(`[${label}] typeName DB 검증 완료: ${typeCode} → "${typeName}"`);
      } else {
        console.warn(`[${label}] ⚠ typeCode가 DB에 없음: ${typeCode} (AI typeName 유지)`);
      }
    }
  } catch { /* ignore */ }

  return {
    typeCode,
    typeName,
    subject: String(cls.subject || examSubject || ''),
    chapter: String(cls.chapter || ''),
    section: String(cls.section || ''),
    difficulty: parseInt(String(cls.difficulty || '3')) || 3,
    cognitiveDomain: String(cls.cognitiveDomain || 'CALCULATION'),
    confidence: typeof cls.confidence === 'number' ? cls.confidence : parseFloat(String(cls.confidence || '0.5')) || 0.5,
    model: modelUsed,
  };
}
