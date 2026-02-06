# Supabase Edge Functions - AI 기능

OpenAI GPT-4o API를 활용한 수학 문제 자동 분류 및 유사 문제 생성 Edge Functions.

## 함수 목록

### 1. `ai-auto-tag` - 자동 유형 분류

문제 텍스트와 LaTeX를 분석하여 유형, 난이도, 인지 영역을 자동 분류합니다.

**Request:**
```json
{
  "problemText": "x^2 - 5x + 6 = 0의 두 근의 합을 구하시오.",
  "latex": "x^2 - 5x + 6 = 0",
  "subject": "수학"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "skillId": "M2-3-2-015",
    "skillName": "이차방정식의 근과 계수의 관계",
    "skillPath": ["수학", "방정식", "이차방정식", "근과 계수의 관계"],
    "difficulty": 2,
    "difficultyLabel": "하",
    "cognitiveType": "calculation",
    "cognitiveLabel": "계산",
    "confidence": 0.95,
    "reasoning": "이차방정식의 근과 계수의 관계를 이용한 기본 문제입니다."
  }
}
```

### 2. `ai-twin-problem` - 유사 문제 생성

원본 문제의 수학적 구조를 유지하면서 숫자/변수만 변경한 쌍둥이 문제를 생성합니다.

**Request:**
```json
{
  "originalLatex": "x^2 - 5x + 6 = 0",
  "originalText": "x^2 - 5x + 6 = 0의 두 근의 합을 구하시오.",
  "difficulty": 2,
  "preserveStructure": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "problemLatex": "x^2 - 7x + 12 = 0",
    "problemText": "x^2 - 7x + 12 = 0의 두 근의 합을 구하시오.",
    "answer": "7",
    "answerLatex": "7",
    "solution": "이차방정식 x^2 - 7x + 12 = 0에서...",
    "solutionLatex": "...",
    "changesApplied": ["계수 -5를 -7로 변경", "상수항 6을 12로 변경"]
  }
}
```

## 배포 방법

### 1. Supabase CLI 설치

```bash
npm install -g supabase
```

### 2. Supabase 프로젝트 연결

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### 3. 환경 변수 설정

Supabase Dashboard > Project Settings > Edge Functions에서:

```
OPENAI_API_KEY=sk-your-openai-api-key
```

### 4. 함수 배포

```bash
# 모든 함수 배포
supabase functions deploy

# 개별 함수 배포
supabase functions deploy ai-auto-tag
supabase functions deploy ai-twin-problem
```

### 5. 로컬 테스트

```bash
# 로컬 Supabase 시작
supabase start

# 환경 변수 파일 생성
echo "OPENAI_API_KEY=sk-your-key" > supabase/.env.local

# 함수 실행
supabase functions serve --env-file supabase/.env.local
```

## 프론트엔드 사용법

```typescript
import { autoTagProblem, generateTwinProblem } from '@/lib/api/ai-functions';

// 자동 분류
const tagResult = await autoTagProblem({
  problemText: '문제 텍스트',
  latex: 'LaTeX 수식',
});

// 유사 문제 생성
const twinResult = await generateTwinProblem({
  originalLatex: '원본 LaTeX',
  difficulty: 3,
});
```

## 비용 고려사항

- GPT-4o 모델 사용 (input: $2.50/1M tokens, output: $10/1M tokens)
- 문제당 평균 토큰 사용량: ~500-1000 tokens
- 대량 처리 시 배치 API 또는 캐싱 고려 권장
