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

import { resolveSubjectCode, buildTypeTable, buildL1L2Table, buildL3L4Table } from './mathsecr-prompt';
import { cachedSystem } from '@/lib/claude/cache';

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
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
  // 분류 공급자 우선순위: 'anthropic'(기본) | 'gemini' | 'openai'
  // Claude Sonnet 4.6은 한국어 분류 정확도가 가장 높음. Gemini/GPT는 fallback.
  const CLASSIFY_PROVIDER = (process.env.CLASSIFY_PROVIDER || 'anthropic').toLowerCase();
  const CLAUDE_CLASSIFY_MODEL = process.env.CLAUDE_CLASSIFY_MODEL || 'claude-sonnet-4-6';

  if (!OPENAI_API_KEY && !GOOGLE_AI_KEY && !ANTHROPIC_API_KEY) {
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

  // ─── 1차 (기본): Claude Sonnet 4.6 — 2단계 분류 ───
  //   문제: 기존 단일 호출은 mathsecr 전체 트리(한 과목당 251K 토큰)를 매번 전송.
  //        캐시 5분 만료 + 자산화 중 OCR/Vision으로 배치 간격 5분 초과 → cache write 반복 → 비용 폭발.
  //   해결: 2단계로 분할 호출.
  //     1단계: L1(대단원) + L2(중단원)만 프롬프트에 (5~10K 토큰) → Claude가 L1·L2 결정
  //     2단계: 결정된 L1·L2 하위의 L3(소단원) + L4(세부유형)만 (3~15K 토큰) → 최종 typeCode 결정
  //   효과: 호출당 토큰 251K → 10~20K (95% 감소). 캐시 만료돼도 cache write 비용 미미.
  //   정확도: 좁은 범위에 집중 → 기존 대비 유지 또는 향상.
  if (CLASSIFY_PROVIDER === 'anthropic' && ANTHROPIC_API_KEY && resolvedCode) {
    modelUsed = CLAUDE_CLASSIFY_MODEL;
    try {
      const twoStageResult = await classifyWithClaudeTwoStage({
        apiKey: ANTHROPIC_API_KEY,
        model: CLAUDE_CLASSIFY_MODEL,
        subjectCode: resolvedCode,
        examSubject,
        examGrade,
        content,
        label,
      });
      if (twoStageResult) {
        rawContent = JSON.stringify({ classification: twoStageResult });
      } else {
        console.warn(`[${label}] Claude 2단계 분류 결과 없음 → Gemini/GPT 폴백`);
      }
    } catch (err) {
      console.warn(`[${label}] Claude 2단계 분류 실패 → Gemini/GPT 폴백:`, err);
    }
  }

  // ─── 2차 (폴백): Gemini ───
  //   gemini-3-flash-preview는 preview 할당량이 엄격해 Tier 1 유료여도 429 발생.
  //   gemini-2.5-flash는 stable 모델이라 Tier 1 본 한도(1000 RPM) 적용.
  if ((!rawContent || rawContent.trim() === '{}' || rawContent.trim().length < 10) && GOOGLE_AI_KEY) {
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
  }

  // ─── 3차 (최종 폴백): Claude도 Gemini도 실패/부재 시 GPT-4.1-mini ───
  if ((!rawContent || rawContent.trim() === '{}' || rawContent.trim().length < 10) && OPENAI_API_KEY) {
    // Claude/Gemini가 실패해서 여기 왔으면 modelUsed도 실제 사용 모델로 바꿈
    if (modelUsed !== 'gpt-4o') {
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
  // DB full_path로 subject/chapter/section 자동 파싱 — AI 응답이 잘려도 메타데이터 보장
  let dbSubject = '';
  let dbChapter = '';
  let dbSection = '';
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
        .select('full_path, subject_name, level1_name, level2_name')
        .eq('code', typeCode)
        .limit(1)
        .maybeSingle();
      if (msType?.full_path) {
        typeName = msType.full_path as string;
        dbSubject = String(msType.subject_name || '');
        dbChapter = String(msType.level1_name || '');  // 대단원
        dbSection = String(msType.level2_name || '');  // 중단원
        console.log(`[${label}] typeName DB 검증 완료: ${typeCode} → "${typeName}"`);
      } else {
        console.warn(`[${label}] ⚠ typeCode가 DB에 없음: ${typeCode} (AI typeName 유지)`);
      }
    }
  } catch { /* ignore */ }

  return {
    typeCode,
    typeName,
    // AI 응답에서 못 받은 필드는 DB에서 파싱한 값으로 채움 (auto-fix 불필요 재트리거 방지)
    subject: String(cls.subject || dbSubject || examSubject || ''),
    chapter: String(cls.chapter || ''),
    section: String(cls.section || ''),
    difficulty: parseInt(String(cls.difficulty || '3')) || 3,
    cognitiveDomain: String(cls.cognitiveDomain || 'CALCULATION'),
    confidence: typeof cls.confidence === 'number' ? cls.confidence : parseFloat(String(cls.confidence || '0.5')) || 0.5,
    model: modelUsed,
  };
}

// ============================================================================
// 2단계 Claude 분류 헬퍼 — mathsecr 트리 축소 버전
// Stage 1: 대단원(L1) + 중단원(L2) 선택 (5~10K 토큰)
// Stage 2: 1단계 결정 하위의 소단원(L3) + 세부유형(L4) 선택 (3~15K 토큰)
// ============================================================================

async function classifyWithClaudeTwoStage(params: {
  apiKey: string;
  model: string;
  subjectCode: string;
  examSubject: string;
  examGrade: string;
  content: string;
  label: string;
}): Promise<Record<string, unknown> | null> {
  const { apiKey, model, subjectCode, examSubject, examGrade, content, label } = params;

  // ── Stage 1: L1 + L2 선택 ──
  const l1l2Table = buildL1L2Table(subjectCode);
  if (!l1l2Table) {
    console.warn(`[${label}] L1L2 테이블이 비어 있음 — 2단계 분류 불가`);
    return null;
  }

  const stage1System = `한국 수학 교육과정 전문가. 수학비서 분류 체계에서 가장 적합한 대단원·중단원을 선택합니다.
반드시 아래 테이블의 "1단계코드" 컬럼 값 중 하나를 그대로 JSON으로만 응답. 설명 텍스트 금지.

참조 테이블 (MS${subjectCode} = ${examSubject}):
${l1l2Table}`;
  const stage1User = `학년: ${examGrade}
문제:
${content.slice(0, 1500)}

위 문제에 가장 적합한 "1단계코드" (대단원+중단원)를 고르세요.
JSON: {"stage1Code":"MS${subjectCode}-??-??"}`;

  const stage1Raw = await callClaudeOnce({
    apiKey, model, systemPrompt: stage1System, userPrompt: stage1User,
    label: `${label}:stage1`, maxTokens: 100,
  });
  if (!stage1Raw) return null;

  const stage1Code = extractStage1Code(stage1Raw, subjectCode);
  if (!stage1Code) {
    console.warn(`[${label}] Stage 1 코드 추출 실패. 원문: ${stage1Raw.substring(0, 200)}`);
    return null;
  }
  console.log(`[${label}] ✓ Stage 1: ${stage1Code}`);

  const m = stage1Code.match(/^MS(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, subj, l1, l2] = m;

  // ── Stage 2: L3 + L4 선택 ──
  const l3l4Table = buildL3L4Table(subj, l1, l2);
  if (!l3l4Table) {
    // L3 이하가 없는 경우 stage1Code가 leaf — 그대로 반환
    console.warn(`[${label}] L3L4 테이블 비어있음 (${stage1Code}는 leaf로 간주)`);
    return {
      typeCode: stage1Code,
      typeName: '',
      subject: examSubject,
      chapter: '',
      section: '',
      difficulty: 3,
      cognitiveDomain: 'CALCULATION',
      confidence: 0.6,
    };
  }

  const stage2System = `한국 수학 교육과정 전문가. 이미 결정된 범위(${stage1Code}) 하위에서 최종 소단원·세부유형을 선택합니다.
반드시 아래 테이블의 "최종코드" 값 중 하나를 그대로 JSON으로만 응답. 설명 텍스트 금지.

참조 테이블 (${stage1Code} 하위):
${l3l4Table}

★ 난이도 (수학비서 1~10):
- 1~2 개념/정의 직접, 3~4 기본 응용, 5~6 복합 2개념 연결, 7~10 고난도 추론/복합 서술
- 서술형·합답형(ㄱㄴㄷ)은 최소 5 이상`;
  const stage2User = `문제:
${content.slice(0, 1500)}

위 문제의 최종 typeCode(소단원+세부유형)와 난이도·인지영역을 JSON으로 응답:
{"typeCode":"${stage1Code}-??-??","difficulty":5,"cognitiveDomain":"CALCULATION","confidence":0.9}

cognitiveDomain은 CALCULATION|UNDERSTANDING|INFERENCE|PROBLEM_SOLVING 중 하나.`;

  const stage2Raw = await callClaudeOnce({
    apiKey, model, systemPrompt: stage2System, userPrompt: stage2User,
    label: `${label}:stage2`, maxTokens: 200,
  });
  if (!stage2Raw) return null;

  const result = parseStage2Response(stage2Raw, stage1Code, examSubject);
  if (result) {
    console.log(`[${label}] ✓ Stage 2: ${result.typeCode} (diff=${result.difficulty}, conf=${result.confidence})`);
  }
  return result;
}

/** Claude 단일 호출 (2단계 각 stage 공통)
 *  ★ Sonnet 4.6은 assistant prefill 미지원 — user 메시지로 끝내야 함.
 *    대신 user 프롬프트 말미에 "JSON만 출력" 강제 지시 추가.
 */
async function callClaudeOnce(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  label: string;
  maxTokens: number;
}): Promise<string | null> {
  const { apiKey, model, systemPrompt, userPrompt, label, maxTokens } = params;
  const strictUser = `${userPrompt}\n\n⚠️ 중요: 응답은 반드시 JSON 객체 하나만. 설명·주석·코드블록 마커 금지. 첫 글자는 { 로 시작.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: cachedSystem(systemPrompt),
          messages: [
            { role: 'user', content: strictUser },
          ],
          temperature: 0.1,
        }),
      });
      if (!cr.ok) {
        if ((cr.status === 429 || cr.status === 529) && attempt < 2) {
          const waitSec = Math.min(10 * (attempt + 1), 30);
          console.log(`[${label}] Claude rate-limited/overloaded, ${waitSec}s 대기`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        const errText = await cr.text().catch(() => '');
        console.warn(`[${label}] Claude ${cr.status}: ${errText.substring(0, 200)}`);
        return null;
      }
      const cd = await cr.json();
      const tb = Array.isArray(cd.content) ? cd.content.find((c: { type: string }) => c.type === 'text') : null;
      const rt = (tb?.text || '').trim();
      const usage = cd.usage || {};
      if (usage.cache_read_input_tokens || usage.cache_creation_input_tokens) {
        console.log(`[${label}] usage: in=${usage.input_tokens || 0}, cache_read=${usage.cache_read_input_tokens || 0}, cache_create=${usage.cache_creation_input_tokens || 0}, out=${usage.output_tokens || 0}`);
      }
      return rt.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/, '').trim();
    } catch (e) {
      console.warn(`[${label}] Claude 호출 예외:`, e);
      return null;
    }
  }
  return null;
}

function extractStage1Code(raw: string, subjectCode: string): string | null {
  // 1) JSON 파싱
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.stage1Code === 'string' && /^MS\d{2}-\d{2}-\d{2}$/.test(parsed.stage1Code)) {
      return parsed.stage1Code;
    }
  } catch { /* ignore */ }
  // 2) 정규식 폴백
  const re = new RegExp(`MS${subjectCode}-\\d{2}-\\d{2}`);
  const m = raw.match(re);
  return m ? m[0] : null;
}

function parseStage2Response(raw: string, stage1Code: string, examSubject: string): Record<string, unknown> | null {
  const validCognitive = new Set(['CALCULATION', 'UNDERSTANDING', 'INFERENCE', 'PROBLEM_SOLVING']);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 부분 추출
    const tcMatch = raw.match(new RegExp(`"typeCode"\\s*:\\s*"(${stage1Code.replace(/-/g, '\\-')}-\\d{2}(?:-\\d{2})?)"`));
    const diffMatch = raw.match(/"difficulty"\s*:\s*(\d+)/);
    const cogMatch = raw.match(/"cognitiveDomain"\s*:\s*"([A-Z_]+)"/);
    const confMatch = raw.match(/"confidence"\s*:\s*(\d*\.?\d+)/);
    if (!tcMatch) {
      // 코드 자체가 없으면 정규식으로 MS...-XX-XX 찾기
      const altMatch = raw.match(new RegExp(`${stage1Code}-\\d{2}(?:-\\d{2})?`));
      if (!altMatch) return null;
      parsed = {
        typeCode: altMatch[0],
        difficulty: diffMatch ? parseInt(diffMatch[1]) : 3,
        cognitiveDomain: cogMatch?.[1] || 'CALCULATION',
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
      };
    } else {
      parsed = {
        typeCode: tcMatch[1],
        difficulty: diffMatch ? parseInt(diffMatch[1]) : 3,
        cognitiveDomain: cogMatch?.[1] || 'CALCULATION',
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
      };
    }
  }

  const typeCode = String(parsed.typeCode || '');
  if (!typeCode.startsWith(stage1Code + '-')) {
    console.warn(`[stage2] typeCode가 stage1Code 하위가 아님: ${typeCode} (expected prefix ${stage1Code})`);
    return null;
  }

  const cog = String(parsed.cognitiveDomain || 'CALCULATION');
  return {
    typeCode,
    typeName: '',  // DB에서 full_path로 덮어씀 (classifyProblem 후단)
    subject: examSubject,
    chapter: '',   // DB에서 덮어씀
    section: '',   // DB에서 덮어씀
    difficulty: typeof parsed.difficulty === 'number' ? parsed.difficulty : parseInt(String(parsed.difficulty || '3')) || 3,
    cognitiveDomain: validCognitive.has(cog) ? cog : 'CALCULATION',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : parseFloat(String(parsed.confidence || '0.85')) || 0.85,
  };
}
