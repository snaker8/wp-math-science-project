// ============================================================================
// 답안 이미지 OCR — Gemini Vision 기반.
//
// 빠른답 매칭 (/api/exams/[examId]/match-answers) 과 채점표 자동입력
// (/api/sessions/[id]/grading-sheet) 에서 공유.
//
// 출력 포맷:
//   ParsedAnswer = { problemNumber, answer, answerType }
//     - answerType: 'choice' (객관식 ① / 1~5), 'numeric' (숫자), 'text'
// ============================================================================

import type { ParsedAnswer } from './answer-parser';

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

const CIRCLED_TO_DIGIT: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
};

// ----------------------------------------------------------------------------
// Gemini Vision — 학생 답안표 이미지에서 "번호. 답" 추출
//
// 사용처:
//   - 빠른답 매칭: 정답표 PDF/이미지 → 정답 추출 (기존)
//   - 채점표 자동입력: 학생이 푼 답안표 사진 → 학생 답 추출 (신규)
// ----------------------------------------------------------------------------
export async function extractAnswersWithGemini(file: File): Promise<ParsedAnswer[]> {
  if (!GEMINI_API_KEY) throw new Error('Gemini API 키가 설정되지 않았습니다.');

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');
  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const mimeType = isPdf ? 'application/pdf' : (file.type || 'image/jpeg');

  const prompt = `이 파일에서 정답표(또는 학생 답안표)를 찾아서 텍스트로 추출해줘. 문제 번호와 답을 각 줄에 하나씩 나열해. 형식은 '문제번호. 답' (예: 1. ①, 2. 5, 3. -1, 4. 1/2, 5. 해설참조) 형태로 해줘. 마지막 문항까지 빠짐없이 모두 추출해.

[중요 원칙]
1. 객관식 답이 원문자(①, ②, ③, ④, ⑤)로 되어 있다면 반드시 해당 특수문자를 그대로 사용해. 절대 (1)이나 1로 바꾸지 마.
2. '해설참조', '별도첨부' 같이 텍스트로 된 답도 절대 생략하지 말고 그대로 적어.
3. 수식은 LaTeX 포맷($...$)을 절대 쓰지 마. 대신 유니코드 기호(√, ³, ², /, π 등)를 사용하여 사람이 바로 읽을 수 있는 텍스트로 변환해.
4. 손글씨로 적힌 답도 최대한 정확히 인식해 (학생 답안표에 사용).
5. 불필요한 말(인사, 설명)은 생략하고 데이터만 줘.`;

  const model = process.env.GEMINI_VISION_MODEL || 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Vision API 실패: ${res.status} — ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) throw new Error('Gemini Vision 응답이 비어있습니다');

  return parseAnswerLines(rawText);
}

// ----------------------------------------------------------------------------
// "1. ①\n2. -3\n3. 1/2" 같은 텍스트를 ParsedAnswer[] 로 파싱.
// 멀티라인 답 ("17. (1)12\n(2)-2/3") 도 한 행으로 병합.
// ----------------------------------------------------------------------------
export function parseAnswerLines(rawText: string): ParsedAnswer[] {
  const mergedLines: string[] = [];
  for (const raw of rawText.split('\n').map((l) => l.trim())) {
    if (!raw) continue;
    if (/^\d{1,2}\s*[.)]/.test(raw)) mergedLines.push(raw);
    else if (mergedLines.length > 0) mergedLines[mergedLines.length - 1] += ' ' + raw;
  }

  const answers: ParsedAnswer[] = [];
  for (const line of mergedLines) {
    const m = line.match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
    if (!m) continue;
    const num = parseInt(m[1]);
    let ans = m[2].trim();
    if (num < 1 || num > 50 || !ans) continue;

    let answerType: ParsedAnswer['answerType'] = 'text';
    if (/^[①②③④⑤]\s*$/.test(ans)) {
      ans = CIRCLED_TO_DIGIT[ans.trim()] || ans;
      answerType = 'choice';
    } else if (/^[1-5]$/.test(ans)) {
      answerType = 'choice';
    } else if (/^-?\d+(?:[.,]\d+)?$/.test(ans)) {
      answerType = 'numeric';
    }

    answers.push({ problemNumber: num, answer: ans, answerType });
  }

  return answers;
}
