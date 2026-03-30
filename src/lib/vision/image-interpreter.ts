// ============================================================================
// Vision 이미지 해석 서비스 (Gemini 3 Flash / GPT-4o / Claude Sonnet)
// 수학 문제의 그래프/도형/표 이미지를 분석하여 구조화된 데이터로 변환
// 코드 렌더러(figure-renderer.ts)가 JSON → SVG 생성
// ============================================================================

import type {
  InterpretedFigure,
  FigureType,
  GraphRendering,
  GeometryRendering,
  TableRendering,
  DiagramRendering,
} from '@/types/ocr';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  shouldRetryWithVP,
  applyVisualPrompting,
  createVPEnhancedPrompt,
  compareResults,
} from './visual-prompting';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || '';

// 환경변수로 모델 전환: 'gemini' | 'gpt' | 'claude' (기본: gemini)
const VISION_PROVIDER = (process.env.VISION_PROVIDER || 'gemini') as 'gemini' | 'claude' | 'gpt';
const GPT_MODEL = 'gpt-4o';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
// 모델 옵션:
// - 'gemini-3.1-flash-lite-preview' — 가장 빠름, 비용 최저, 2.5 Pro 수준 성능
// - 'gemini-2.5-pro' — 최고 정확도 (느림/비쌈)
// - 'gemini-2.5-flash' — 중간 (빠름/저렴)
// ★ gemini-3-flash-preview는 Vision에서 graph를 photo로 오분류 (2026.03 기준)

// ============================================================================
// 1단계: 구조 분석 프롬프트 (JSON 응답)
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `당신은 수학 교육 자료의 시각적 요소를 분석하는 전문가입니다.
주어진 이미지는 수학 문제에 포함된 그래프, 도형, 표 등입니다.

이미지를 분석하여 **반드시 아래 JSON 형식으로만** 응답하세요.

{
  "figureType": "graph" | "geometry" | "table" | "number_line" | "diagram" | "photo",
  "description": "이미지에 대한 간단한 한국어 설명",
  "confidence": 0.0~1.0,
  "rendering": { ... }
}

## figureType 판별 기준 (★ 우선순위 중요):
- **graph**: 좌표 평면(x축/y축)이 보이면 **무조건 graph**. 포물선, 직선, 삼각함수 등 함수 그래프뿐만 아니라, 좌표 위에 삼각형·사각형 등이 그려진 경우도 graph. 예: "이차함수 그래프 아래 직사각형 내접" → graph
- **geometry**: 좌표 평면 **없이** 순수 기하 도형만 있는 경우 (삼각형, 원, 사각형 등)
- **table**: 값의 표 (x, f(x), 조립제법 등)
- **number_line**: 수직선, 구간 표시
- **diagram**: 벤다이어그램, 트리, 순서도 등 기타 다이어그램
- **photo**: 사진이거나 수학적으로 해석 불가한 이미지
★★ 핵심: 좌표축(x, y)이 보이면 → 반드시 "graph". geometry로 분류하지 마세요!

## rendering 구조 (figureType별):

### graph:
{
  "type": "graph",
  "expressions": [
    {"latex": "y=-x^2+8x-12", "color": "#2563eb", "style": "solid"},
    {"latex": "y=x+2", "color": "#dc2626", "style": "solid"}
  ],
  "xRange": [-2, 10],
  "yRange": [-5, 8],
  "points": [{"x": 0, "y": 0, "label": "O"}, {"x": 2, "y": 0, "label": "B"}, {"x": 6, "y": 0, "label": "C"}, {"x": 5, "y": 7, "label": "A"}],
  "annotations": [],
  "shadedRegions": [{"vertices": ["A","B","C"], "color": "yellow"}],
  "segments": [["A","B"], ["B","C"], ["C","A"]]
}
★ graph 좌표 규칙:
- expressions의 latex는 "y=..." 형식으로, x만 변수로 사용 (미지수 a,b 등은 실제 값으로 대입)
- ★★★ 미지수(a,b,k 등) 값 결정법 (반드시 따르세요!):
  이미지의 시각적 단서에서 미지수의 구체적인 값을 결정하세요:
  (1) **점근선**: 수평 점선 y=c가 보이면 → 해당 상수 = c (예: y=(1/4)^{x-a}+b에서 점근선 y=-4 → b=-4)
  (2) **x절편(x-intercept)**: 곡선이 x축과 만나는 점에서 y=0 대입하여 파라미터 역산
      예: y=(1/4)^{x-a}-4에서 x축 교점 x=1 → 0=(1/4)^{1-a}-4 → (1/4)^{1-a}=4 → 1-a=-1 → a=2
  (3) **y절편(y-intercept)**: 곡선이 y축과 만나는 점에서 x=0 대입
  (4) **꼭짓점**: 포물선 꼭짓점 (h,k) → y=a(x-h)²+k
  (5) **접선**: "접한다" 조건 → 판별식=0 풀기
  (6) **삼각함수 y=a·sin(bx+c)+d**: 이미지에서 반드시 다음을 읽으세요:
      - 최댓값(M)과 최솟값(m) → a=(M-m)/2, d=(M+m)/2
      - ★★ d≠0이면 곡선은 원점(0,0)을 지나지 않습니다! 최대·최소가 대칭이 아니면 d≠0입니다.
      - 주기(T): 연속 두 봉우리(또는 골) 사이 x거리 → b=2π/T
      - 위상이동(c): y=d와 만나며 증가하는 x좌표를 x₀라 하면 c=-b·x₀
      예 A (대칭): 최댓값 2, 최솟값 -2 → a=2, d=0 (원점 통과 O)
         → expressions: [{"latex":"y=2\\\\sin(0.5*x)","style":"solid"}]
      예 B (비대칭 — 가장 흔함!): 최댓값 3, 최솟값 -1, 주기 π
         → d=(3+(-1))/2=1 ≠ 0, a=(3-(-1))/2=2, b=2π/π=2
         → 곡선이 y=0이 아닌 y=1을 중심으로 진동!
         → expressions: [{"latex":"y=2\\\\sin(2*x)+1","style":"solid"}]
         ★ 검증: f(π/4)=2sin(π/2)+1=2+1=3 ✓(최댓값), f(3π/4)=2sin(3π/2)+1=-2+1=-1 ✓(최솟값)
      ★★ 최댓값과 최솟값의 절대값이 다르면 반드시 d≠0입니다! (예: max=3, min=-1 → d=1)
  ★★★ 파라미터 결정 후 반드시 검증하세요:
    ① y=0 대입 → x-intercept 계산 → 이미지의 x축 교점과 일치하는지 확인
    ② x=0 대입 → y-intercept 계산 → 이미지의 y축 교점과 일치하는지 확인
    ③ 불일치하면 파라미터를 재조정하세요!
  예: y=(1/4)^{x-a}+b, 점근선 y=-4, x축 교점 x=1
    → b=-4, y=0 대입: (1/4)^{1-a}=4 → 1-a=-1 → a=2
    → expressions: [{"latex":"y=(0.25)^{x-2}-4","style":"solid"}]
    ★ 검증: x=1 → (0.25)^{-1}-4 = 4-4 = 0 ✓ (x절편 일치)
  예: y=ax²+bx+c, 꼭짓점 (2,3), x축 교점 0,4 → expressions: ["y=-0.75x^2+3x"]
- expressions에는 반드시 **숫자만** 사용 (a,b,k 등 문자 금지). 이것이 SVG 렌더링에 필수입니다!
- ★★★ expressions에는 메인 곡선 1개만 넣으세요! (점근선 dashed 제외). 원본 수식을 2개 이상 넣지 마세요!
  나쁜 예: [{"latex":"y=a\\sin(bx+c)+d"}, {"latex":"y=2\\sin(2x)+1"}] ← 2개는 금지!
  좋은 예: [{"latex":"y=2\\\\sin(2*x)+1","style":"solid"}] ← 숫자로 대입한 1개만!
- ★ 원본 수식(미지수 포함)은 annotations에 넣으세요: ["y=a\\sin(bx+c)+d"]
- ★★ 접선 조건: 문제에서 "접한다", "한 점에서만 만난다" 등의 조건이 있으면,
  연립방정식의 판별식=0을 풀어 미지수의 실제 값을 구한 후 대입하세요.
  예: y=-x^2+8x-12와 y=x+a가 접하면 → x^2-7x+(12+a)=0, D=49-4(12+a)=0 → a=1/4
  → 접점 x=7/2, y=15/4 → expressions: ["y=-x^2+8x-12", "y=x+0.25"]
- points에 이미지에 표시된 모든 점(O, A, B, C 등)의 좌표를 정확히 기입하세요
- ★ 이미지에 없는 점(A, B, C 등)을 임의로 만들어내지 마세요! 이미지에 라벨이 표시된 점만 포함하세요.
- ★ x축과의 교점(y=0)은 방정식을 풀어 정확한 좌표를 구하세요
  예: -x^2+8x-12=0 → x=2, x=6 → B(2,0), C(6,0)
- ★★★ 축 눈금 표시 — 이미지에 실제로 적혀있는 숫자만 포함하세요:
  이미지의 축 위에 눈금 숫자가 보이면 points에 포함합니다.
  ★ 이미지에 없는 숫자를 임의로 추가하지 마세요! 보이는 것만 포함!
  - x축: {"x":1, "y":0, "label":"1"} 또는 {"x":1.57, "y":0, "label":"π/2"}
  - y축: {"x":0, "y":3, "label":"3"} 또는 {"x":0, "y":-1, "label":"-1"}
  - 원점 O가 보이면 → {"x":0, "y":0, "label":"O"}
  ★★ 곡선이 x축과 만나는 부근의 숫자를 특히 주의깊게 확인하세요! (예: 곡선이 x축과 교차하는 지점에 "1", "2" 등이 적혀있는 경우 반드시 포함)
- ★★ 점근선: 이미지에 수평 점선(점근선)이 있으면 expressions에 dashed 스타일로 추가:
  예: 점근선 y=-4 → {"latex":"y=-4", "style":"dashed", "color":"#9ca3af"}
- ★★★ annotations: 반드시 이미지 그래프 위에 텍스트로 직접 적혀있는 수식만 넣으세요!
  - 이미지에 "y=a sin(bx+c)+d" 같은 수식이 그래프 옆에 적혀있으면 → annotations에 포함
  - 이미지에 수식 텍스트가 없고 곡선만 있으면 → annotations: [] (빈 배열)
  - 문제 본문(content_latex)에만 있는 수식은 절대 annotations에 넣지 마세요!
  - 점근선 수식(y=-4 등)은 annotations에 넣지 마세요! expressions의 dashed 스타일로만 처리합니다.
- shadedRegions: 이미지에 색칠된 영역이 있으면 점 라벨로 다각형 지정
- segments: 이미지에 직선 외 별도 선분(삼각형 변, 사각형 변 등)이 있으면 점 라벨 쌍으로 지정

★ 그래프 + 도형 결합 예시 (이차함수 아래 직사각형 내접):
이미지: y=-2x^2+5x 포물선 아래에 직사각형 ABCD가 내접 (A, B는 x축, D, C는 포물선 위)
→ figureType: "graph"
→ expressions: [{"latex": "y=-2x^{2}+5x", "color": "#2563eb", "style": "solid"}]
→ points: [{"x":0,"y":0,"label":"O"}, {"x":0.5,"y":0,"label":"A"}, {"x":2,"y":0,"label":"B"}, {"x":0.5,"y":2,"label":"D"}, {"x":2,"y":2,"label":"C"}]
→ segments: [["A","D"], ["D","C"], ["C","B"], ["A","B"]]
→ shadedRegions: [{"vertices":["A","B","C","D"], "color":"gray"}]
→ xRange: [-1, 3], yRange: [-1, 4]
★ 좌표 정확성 필수: D, C는 포물선 위의 점이므로 f(0.5)=-2(0.25)+2.5=2, f(2)=-2(4)+10=2 → 같은 높이 ✓
★ 직사각형이므로 D와 C의 y좌표가 반드시 같아야 함. 수식에 대입하여 검증하세요!
이렇게 포물선 함수 + 도형의 꼭짓점/선분/음영을 함께 지정하면 됩니다.

★ xRange, yRange 설정 규칙 (★매우 중요 — SVG 크기에 직접 영향):
- 이미지에서 보이는 실제 영역에 맞춰 **좁게** 설정하세요
- 모든 points가 범위 안에 있어야 합니다
- ★ 범위를 너무 넓게 설정하면 도형이 매우 작게 보입니다!
- 곡선의 주요 부분(꼭짓점, x축 교점, 관심 영역)만 보이면 됩니다
- 좌우/상하 여유는 1~2 유닛 정도만 두세요
- 예: y=-2x²+5x (교점: 0, 2.5 / 꼭짓점: 1.25, 3.125) → xRange: [-1, 4], yRange: [-2, 5]
- 예: y=x²-4x+3 (교점: 1, 3 / 꼭짓점: 2, -1) → xRange: [-1, 5], yRange: [-3, 5]
- ★ 삼각함수: 이미지에서 보이는 주기 수만큼 범위 설정 (보통 2~3주기)
  예: y=2sin(2x)+1 (주기=π), 이미지에서 약 2주기 보임 → xRange: [-1, 7], yRange: [-2, 4]
  ★ 삼각함수의 x축 눈금은 π 기반으로 표시 (이미지에 표시된 것):
  예: π/2 → {"x":1.5708, "y":0, "label":"π/2"}, 3π/2 → {"x":4.7124, "y":0, "label":"3π/2"}
  y축 눈금은 최댓값/최솟값: 예: {"x":0, "y":3, "label":"3"}, {"x":0, "y":-1, "label":"-1"}
- 나쁜 예: xRange: [-10, 10] ← 이런 넓은 범위는 절대 사용하지 마세요!

### geometry:
{
  "type": "geometry",
  "latex": "도형을 설명하는 LaTeX (예: \\\\triangle ABC)",
  "vertices": [{"label": "A", "x": 0, "y": 0}, {"label": "B", "x": 4, "y": 0}, {"label": "C", "x": 2, "y": 3}],
  "segments": [["A","B"], ["B","C"], ["C","A"]],
  "dashedSegments": [["A","D"]],
  "angles": [{"vertex": "A", "value": "60°"}],
  "lengths": [{"from": "A", "to": "B", "value": "5"}],
  "shadedRegions": [{"vertices": ["A","B","C"], "color": "yellow"}],
  "rightAngles": ["C"]
}

#### geometry 좌표 규칙 (★매우 중요 — 코드가 이 좌표로 직접 SVG를 생성합니다):
- 이 좌표 데이터가 곧바로 SVG 렌더링에 사용됩니다. **정확한 좌표가 핵심입니다**.
- 문제 텍스트의 수학적 조건(길이, 각도, 위치관계)을 사용하여 좌표를 계산하세요.
- **밑변을 x축 위에 배치**: 가장 긴 변 또는 기준이 되는 변의 양 끝점을 (0,0)과 (길이,0)에 놓으세요.
- **높이는 y축으로**: 위쪽 꼭짓점은 y값을 양수로 설정하세요.
- 예: "BC=10인 삼각형" → B(0,0), C(10,0), A는 위쪽
- 예: "정삼각형 ABC, 한 변 6" → B(0,0), C(6,0), A(3, 5.2)
- 예: "직각이등변삼각형 ABC, BC=10, ∠BAC=90°" → B(0,0), C(10,0), A(5, 5)
- 도형 내부 점(D, E, F 등)은 기준 삼각형의 좌표를 기준으로 비례 계산
- segments에 포함된 모든 꼭짓점은 반드시 vertices 배열에 있어야 합니다
- 좌표는 소수점 1자리까지 사용 가능

#### segments vs dashedSegments 구분 (★중요):
- **segments**: 이미지에서 실선(진한 선)으로 그려진 모든 선분. 도형의 변, 보조선 모두 포함
- **dashedSegments**: 이미지에서 **명확히 점선/파선**으로 그려진 선분만 해당
- ★ 도형의 변(삼각형 변, 사각형 변 등)은 거의 항상 segments (실선)
- ★ 보조선이라도 실선이면 segments에 넣으세요. 오직 이미지에서 점선으로 보이는 것만 dashedSegments
- 확신이 없으면 segments에 넣으세요 (실선 기본)

#### 회전체 문제 (축 l 주위로 회전하는 도형) ★중요:
- 이미지에 직선 l (회전축)이 있고 도형이 그 축을 기준으로 회전하는 문제:
- **회전축 l은 도형의 꼭짓점에 반드시 접해야 합니다**: 축 위에 있는 꼭짓점의 x좌표와 축의 x좌표가 정확히 같아야 함
- **회전축 표현**: vertices에 축의 위/아래 점 2개를 추가하고 (예: "L1", "L2"), segments에 ["L1","L2"] 추가
- **축 라벨**: lengths에 축 라벨 추가: {"from": "L1", "to": "L2", "value": "l"} (이탤릭 소문자 l)
- **회전 화살표**: geoAnnotations 배열에 추가: {"type": "rotation", "center": "L1", "direction": "cw"} (시계방향) 또는 "ccw" (반시계방향)
- 예: 직각삼각형 ABC를 직선 l 기준으로 회전 → A(0,4), B(0,0), C(6,0), 축 l이 C를 지남 → L1(6,-1), L2(6,5), segments에 ["L1","L2"] 추가, C의 x좌표=6=축의 x좌표
- **수식 라벨의 위첨자/아래첨자**: 이미지의 $4a^2$은 "4a²"(위첨자), $2a_2$는 "2a₂"(아래첨자). 반드시 이미지를 정확히 읽어 위첨자는 ^{}, 아래첨자는 _{}로 구분하세요

#### 기타 필드:
- shadedRegions: 음영 영역. color는 "yellow"을 기본으로 사용. 이미지에서 명확히 파란색/빨간색이 아닌 한 항상 "yellow"
- rightAngles: 이미지에서 **직각 기호(ㄱ 또는 □)가 명확히 그려진** 꼭짓점만. 문제 텍스트에 직각이 언급되어도 이미지에 기호가 없으면 넣지 마세요

### table:
{
  "type": "table",
  "latex": "\\\\begin{array}{c|ccc} x & 1 & 2 & 3 \\\\\\\\ \\\\hline f(x) & 3 & 7 & 13 \\\\end{array}",
  "headers": ["x", "1", "2", "3"],
  "rows": [["f(x)", "3", "7", "13"]]
}
#### table 규칙:
- headers: 첫 번째 행 (열 머리글). 비어있으면 ""
- rows: 나머지 데이터 행들
- 빈 셀은 "" (빈 문자열)로 표시
- ★ 손글씨, 낙서, 필기 흔적이 있는 셀은 **반드시 무시**하고 "" (빈 문자열)로 처리하세요
- ★ 인쇄된 깨끗한 텍스트/숫자만 인식하세요. 손글씨로 보이는 문자(β, p, B 등)는 빈 셀입니다

#### 조립제법(합성나눗셈) 표 형식 (★매우 중요):
조립제법 표는 다음 구조를 따릅니다:
- headers[0] = 나누는 수 또는 변수 (예: "k", "2", "" 등 — 이미지에 보이는 그대로)
- headers[1..n] = 다항식 계수 ("a", "b", "c", "11" 등)
- rows[0] = 중간 계산 행 (빈 셀 또는 계산 결과)
- rows[마지막] = 결과 행 ("1", "1", "-3", "", "14" 등)
- 결과 행의 마지막 값은 나머지
★ headers[0]은 이미지에 보이는 값을 그대로 출력하세요 ("k", "2", "" 등). 절대 생략하지 마세요.

예: P(x)=ax³+bx²+cx+11 을 x-k로 나누는 조립제법 표:
headers: ["k", "a", "b", "c", "11"]
rows: [["", "", "", "", ""], ["1", "1", "-3", "", "14"]]
→ headers[0]="k"는 나누는 수 열
→ 첫 번째 데이터 행의 비어있는 셀들은 사용자가 채워야 할 빈칸(□)
→ 결과 행의 "1","1","-3"은 몫의 계수, "14"는 나머지

### number_line / diagram:
{
  "type": "number_line" 또는 "diagram",
  "latex": "관련 LaTeX 수식",
  "description": "상세 텍스트 설명"
}

### photo (해석 불가):
null

중요:
- LaTeX 수식에서 백슬래시는 이중으로 이스케이프하세요 (\\\\frac, \\\\sqrt 등)
- 확신이 낮으면 confidence를 낮게 설정하세요
- 해석 불가하면 figureType을 "photo"로 하고 rendering을 null로 하세요
- JSON만 응답하세요. 다른 텍스트를 추가하지 마세요.
- 음영 색상은 이미지에서 보이는 실제 색상을 사용하세요 (보통 yellow/노란색)`;

// ============================================================================
// 2단계: geometry SVG 생성 프롬프트 (raw SVG 응답, JSON 아님)
// ============================================================================

const SVG_GENERATION_PROMPT = `You are a math figure reproduction specialist for Korean math textbooks.
Your job: Look at the ORIGINAL IMAGE carefully and produce a CLEAN, SIMPLE SVG that matches the original as closely as possible.

CRITICAL OUTPUT RULES:
- Output ONLY valid SVG code (starting with <svg and ending with </svg>)
- No explanations, no markdown, just raw SVG
- Keep it SIMPLE and CLEAN — like a professional digital textbook figure
- ★★★ The ORIGINAL IMAGE is the ground truth. Always match the image, not just the text description.

SVG STYLE RULES FOR GEOMETRY:
1. viewBox="0 0 400 300" width="100%", transparent background
2. ★ SIZE: Fill 80-90% of the viewBox. The figure should be LARGE, not tiny.
3. Outlines: stroke="#374151" stroke-width="2" fill="none"
4. Labels (A, B...): fill="#1f2937" font-size="16" font-weight="bold", placed OUTSIDE the figure
5. Subscripts (r₁, r₂): "r" + <tspan dy="3" font-size="10">
6. ★★ SHADING: Replace hatching/shading with fill="rgba(250,204,21,0.35)" (yellow).
   - Shade the ENTIRE shaded region as ONE single closed path. Draw it BEFORE outlines.
   - For 부채꼴의 띠 (annular sector): the shaded region is the BAND between the two arcs.
     Path: M(outerLeft) → outer arc to (outerRight) → L(innerRight) → inner arc back to (innerLeft) → Z
     Example: M(D) A r2 r2 0 0 1 (C) L(A) A r1 r1 0 0 0 (B) Z
   - Do NOT shade small corner pieces separately. Shade the WHOLE band at once.
7. Match the original's label positions exactly (left/right/above/below). Do NOT swap labels.
8. Dashed lines only where the original shows dashes. Solid lines where original is solid.
9. Vertex dots: ONLY if the original shows dots. If no dots in original, omit them.
10. Do NOT add elements not in the original (no extra axes, markers, or decorations).
11. ★★ DIMENSION LINES (길이 표시): If the original shows dimension numbers (e.g., 9, 12):
   - Draw CURVED dashed lines outside the figure using <path d="M... Q... ..." stroke-dasharray="4,3"/>
   - Use quadratic bezier curves (Q control-point end-point) for a natural arc shape
   - Add small arrow tips at both ends of the curve
   - Place the dimension number text centered outside the curve
   - Stroke: stroke="#888" stroke-width="1"
   - Example vertical: <path d="M 290,25 Q 300,120 290,215" stroke-dasharray="4,3"/>
   - Example horizontal: <path d="M 25,248 Q 140,258 255,248" stroke-dasharray="4,3"/>
12. ★★ RIGHT ANGLE MARKS: Always draw right angle squares (10x10px polyline) at 90° angles.
13. ★★ NO HATCHING: Never use hatching/cross-hatching. Use solid fill with rgba(250,204,21,0.35) instead.

★★★ ARCS AND CURVES (CRITICAL):
- Use SVG arc commands <path d="M... A rx ry 0 large-arc-flag sweep-flag x y"> for ALL curves
- Draw ONLY partial arcs matching the original — NEVER extend to full circle
- ★★ ARC DIRECTION AND ORIENTATION:
  - Look at the original image carefully: which direction do arcs curve? UP, DOWN, LEFT, or RIGHT?
  - In SVG, y increases DOWNWARD. So "upward" visually = smaller y values.
  - sweep-flag=1 means clockwise, sweep-flag=0 means counter-clockwise
  - Try BOTH sweep values mentally and pick the one that matches the original
- ★★ SYMMETRY: If the original is vertically symmetric, the SVG MUST also be symmetric.
- ★★★ ARC ANGLE: Carefully estimate the arc's angle from the original (e.g., 90°, 120°, 150°, 180°).
  A fan that doesn't reach horizontal = less than 180°. Do NOT default to 180° semicircle!
  Match the EXACT angle visible in the original image.
- 부채꼴 (sector): center at bottom, two radii going outward at the correct angle, one arc on top
- 부채꼴의 띠 (annular sector): center at bottom, two concentric partial arcs, two radii
  - The shaded region is between the inner and outer arcs
- ★★ DASHED RADIUS LINES: If the original shows dashed lines from center to points (indicating r₁, r₂ measurements),
  draw them as stroke-dasharray="6,4" with the radius labels (r₁, r₂) next to them.
  These measurement lines are CRITICAL — they show which distances are r₁ and r₂.
- NEVER approximate curves with straight line segments
- NEVER rotate or tilt a figure that is upright in the original

SVG STYLE RULES FOR TABLES:
1. Use viewBox with appropriate dimensions for the table size
2. Clean grid lines: stroke="#374151" stroke-width="1" for inner, stroke-width="2" for outer borders
3. Header row: light gray background fill="#f3f4f6"
4. Text: font-family="sans-serif" font-size="14" fill="#1f2937"
5. For 조립제법 (synthetic division): draw L-shaped divider (vertical line after first column + horizontal line before last row)
6. ★ CRITICAL: IGNORE ALL handwriting, scribbles, pen marks, or unclear marks in cells
   - If a cell has handwriting/scribbles on it, render it as an EMPTY cell (small empty rectangle □)
   - Only reproduce PRINTED text/numbers. Any letter that looks handwritten (like a scribbled 'p', 'β', etc.) = EMPTY cell
   - The original image may have student handwriting on a printed table — IGNORE all handwriting
7. Empty cells: draw a small rect (20x20, stroke="#9ca3af", fill="none", rx="2") centered in the cell`;

// ============================================================================
// 수식 자동 감지 (content_latex에서 함수/그래프 정보 추출)
// ============================================================================

interface DetectedEquations {
  /** 감지된 함수 수식들 (y=..., f(x)=... 등) */
  equations: string[];
  /** 그래프 관련 키워드 발견 여부 */
  hasGraphKeywords: boolean;
  /** 이미지가 반드시 graph 타입이어야 하는지 */
  forceGraph: boolean;
  /** AI에게 전달할 강화된 힌트 문자열 */
  hint: string;
}

/**
 * content_latex에서 함수 수식과 그래프 관련 키워드를 자동 감지
 * 이미 OCR에서 추출된 수식 정보를 활용하여 Vision AI에 강력한 힌트 제공
 */
function detectEquationsFromContent(content: string): DetectedEquations {
  const equations: string[] = [];

  // 1. 함수 수식 패턴 감지 (LaTeX + 일반 텍스트)
  const equationPatterns = [
    // y = ... 형태 (LaTeX - 넓은 매칭: \left, \right, \frac, ^{}, 등 포함)
    /y\s*=\s*(?:\\left)?[-(+]?\s*(?:\\frac\{[^}]*\}\{[^}]*\}|\d+)\s*(?:\\right)?\s*\^\s*\{[^}]+\}\s*[-+]\s*[a-z\d]+/g,
    // y = (1/4)^{x-a} + b 스타일 (지수함수)
    /y\s*=\s*\\left\s*\(\s*\\frac\{[^}]+\}\{[^}]+\}\s*\\right\s*\)\s*\^\s*\{[^}]+\}[^.]*$/gm,
    // y = ... 형태 (일반 LaTeX)
    /y\s*=\s*[-+]?\s*\d*[a-z]?\s*(?:\\?(?:frac|sqrt|cdot))?\s*[-+\d\s\\{}^_xX().a-z]+/g,
    // f(x) = ... 형태
    /f\s*\(\s*x\s*\)\s*=\s*[-+\d\s\\{}^_xX().a-z]+/g,
    // g(x) = ... 형태
    /g\s*\(\s*x\s*\)\s*=\s*[-+\d\s\\{}^_xX().a-z]+/g,
    // y=ax^2+bx+c 등 다항식
    /y\s*=\s*[-+]?\s*\d*x\^?\{?\d*\}?\s*(?:[-+]\s*\d*x?\s*(?:\^?\{?\d*\}?)?)*/g,
    // 이차함수 y=-2x²+5x 스타일
    /y\s*=\s*[-+]?\d*x\s*[\^²³]\s*[-+]?\s*\d*x?/g,
  ];

  for (const pattern of equationPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const m of matches) {
        // ★ LaTeX 인라인 수식 잔여물 정리: \), \(, $, \\ 등
        const cleaned = m.trim()
          .replace(/\s*\\[\)\]]\s*$/g, '')   // 끝의 \) \] 제거
          .replace(/^\s*\\[\(\[]\s*/g, '')   // 앞의 \( \[ 제거
          .replace(/^\$+|\$+$/g, '')         // $ 제거
          .trim();
        if (cleaned.length > 3 && !equations.includes(cleaned)) {
          equations.push(cleaned);
        }
      }
    }
  }

  // 2. 그래프 관련 키워드 감지
  const graphKeywords = [
    '그래프', '좌표', '포물선', '이차함수', '일차함수', '삼차함수',
    '직선', 'x축', 'y축', '원점', '접선', '접한다', '교점',
    '함수의 그래프', '함수 y', '함수 f',
    '꼭짓점', '축의 방정식', '최댓값', '최솟값',
    '증가', '감소', '볼록', '오목',
    '\\text{그래프}', '\\text{좌표}',
  ];

  const hasGraphKeywords = graphKeywords.some(kw => content.includes(kw));

  // 3. 그래프 강제 판별: 함수 수식이 있거나 그래프 키워드가 있으면
  const forceGraph = equations.length > 0 || hasGraphKeywords;

  // 4. AI에게 전달할 힌트 생성
  let hint = '';
  if (equations.length > 0) {
    hint += `\n\n★★★ 최우선 지시 — 이 문제의 함수 수식 ★★★\n`;
    hint += `이 문제에서 사용되는 함수 수식은 다음과 같습니다:\n`;
    equations.forEach(eq => { hint += `  • ${eq}\n`; });
    hint += `\n★ 반드시 이 수식을 기반으로 expressions를 작성하세요. 다른 수식을 사용하지 마세요!\n`;
    hint += `★ expressions에는 이 수식 1개만 넣으세요 (점근선 제외). 임의로 다른 곡선을 추가하지 마세요!\n`;
    hint += `★ 수식에 미지수(a,b,k 등)가 있으면 이미지에서 시각적 단서(점근선, x절편, y절편)를 읽어 구체적인 숫자로 대입하세요.\n`;
    hint += `★ figureType은 반드시 "graph"입니다.\n`;
    hint += `★★ annotations: 이미지에 "${equations[0]}" 같은 수식이 그래프 위/옆에 텍스트로 적혀있으면 annotations에 반드시 포함하세요! (미지수 포함 원본 수식 그대로)\n`;
    hint += `★★★ 파라미터 결정 후 반드시 검증: y=0 대입하여 x절편을 계산하고, 이미지의 x축 교점과 일치하는지 확인하세요! 불일치하면 파라미터를 재조정하세요.\n`;
    hint += `★★★ x축/y축에 적힌 숫자를 꼼꼼히 확인! 곡선이 x축과 만나는 부근에 숫자(1, 2, -3 등)가 적혀있으면 points에 반드시 포함하세요!\n`;
    hint += `  예: x축에 "1"이 적혀있으면 → {"x":1, "y":0, "label":"1"}\n`;
    hint += `\n예시 1 (지수함수): 수식이 y=(1/4)^{x-a}+b이고 이미지에서 점근선 y=-4, x축 교점 x=1\n`;
    hint += `  → b=-4, y=0 대입: (1/4)^{1-a}=4 → 1-a=-1 → a=2\n`;
    hint += `  → expressions: [{"latex":"y=(0.25)^{x-2}-4","style":"solid"}, {"latex":"y=-4","style":"dashed"}]\n`;
    hint += `  → points: [{"x":0,"y":0,"label":"O"}, {"x":1,"y":0,"label":"1"}, {"x":0,"y":-4,"label":"-4"}]\n`;
    hint += `  → 검증: x=1 → (0.25)^{-1}-4=4-4=0 ✓\n`;

    // ★ 삼각함수 감지 시 추가 가이드
    const hasTrig = equations.some(eq => /\\?sin|\\?cos|\\?tan/.test(eq));
    if (hasTrig) {
      hint += `\n★★★ 삼각함수 파라미터 결정법 (이 문제에 해당합니다!) ★★★\n`;
      hint += `이미지에서 반드시 다음을 읽으세요:\n`;
      hint += `  ① 최댓값(M)과 최솟값(m) → a=(M-m)/2, d=(M+m)/2\n`;
      hint += `  ★★ d≠0이면 곡선은 원점(0,0)을 지나지 않습니다!\n`;
      hint += `  ★★ max와 min의 절대값이 다르면 반드시 d≠0! (예: max=3, min=-1 → d=1)\n`;
      hint += `  ② 주기(T): 연속 두 봉우리(또는 골) 사이 x거리 → b=2π/T\n`;
      hint += `  ③ 위상이동: y=d와 만나며 증가하는 x좌표를 x₀ → c=-b·x₀\n`;
      hint += `예시 (비대칭 — 가장 흔함): y=a·sin(bx+c)+d, 최댓값=3, 최솟값=-1, 주기=π\n`;
      hint += `  → a=(3-(-1))/2=2, d=(3+(-1))/2=1, b=2π/π=2\n`;
      hint += `  → expressions: [{"latex":"y=2\\\\sin(2*x)+1","style":"solid"}]\n`;
      hint += `  → 검증: f(π/4)=2sin(π/2)+1=3 ✓(최댓값), f(3π/4)=2sin(3π/2)+1=-1 ✓(최솟값)\n`;
      hint += `★ expressions의 latex에서 sin, cos, tan 앞에 반드시 \\\\를 붙이세요: "y=2\\\\sin(2*x)+1"\n`;
      hint += `★ π는 숫자로 변환하지 마세요! \\\\pi를 사용하세요: "y=2\\\\sin(2*x)+1"\n`;
    }
  } else if (hasGraphKeywords) {
    hint += `\n\n★★ 참고: 이 문제 텍스트에 그래프/좌표 관련 키워드가 포함되어 있습니다.\n`;
    hint += `이미지에 좌표축이 보이면 반드시 figureType="graph"로 분류하세요.\n`;
  }

  if (equations.length > 0 || hasGraphKeywords) {
    console.log(`[Vision] 수식 자동 감지: equations=${JSON.stringify(equations)}, graphKeywords=${hasGraphKeywords}, forceGraph=${forceGraph}`);
  }

  return { equations, hasGraphKeywords, forceGraph, hint };
}

// ============================================================================
// 핵심 함수
// ============================================================================

/**
 * 이미지를 Vision AI(Claude Sonnet 또는 GPT-4o)로 해석
 * @param imageUrl - 이미지 URL 또는 base64 data URL
 * @param context - 문제 텍스트 (맥락 제공, 선택)
 * @returns 해석된 도형 데이터
 */
export async function interpretImage(
  imageUrl: string,
  context?: string
): Promise<InterpretedFigure> {
  const provider = VISION_PROVIDER;

  // ★ content_latex에서 base64 이미지 제거 (73KB+ 문제 방지)
  if (context) {
    context = context
      .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '')  // ![alt](data:image/...) 제거
      .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, '')  // base64 직접 제거
      .replace(/\n{3,}/g, '\n\n')
      .trim() || undefined;
  }

  // content_latex에서 수식 자동 감지
  const detected = context ? detectEquationsFromContent(context) : null;

  // API 키 확인 + 자동 fallback 순서: gemini → gpt → claude
  const providerKeyMap: Record<string, string> = { gemini: GOOGLE_AI_KEY, gpt: OPENAI_API_KEY, claude: ANTHROPIC_API_KEY };
  const fallbackOrder: Array<'gemini' | 'gpt' | 'claude'> =
    provider === 'gemini' ? ['gemini', 'gpt', 'claude'] :
    provider === 'gpt'    ? ['gpt', 'gemini', 'claude'] :
                            ['claude', 'gemini', 'gpt'];

  // 사용 가능한 provider 필터링
  const availableProviders = fallbackOrder.filter(p => providerKeyMap[p]);
  if (availableProviders.length === 0) {
    return createFallbackFigure(imageUrl, 'API 키 미설정 (Gemini/GPT/Claude 중 하나 필요)');
  }

  const callProvider = async (p: 'gemini' | 'gpt' | 'claude'): Promise<InterpretedFigure> => {
    switch (p) {
      case 'gemini': return interpretImageWithGemini(imageUrl, context, detected);
      case 'gpt':    return interpretImageWithGPT(imageUrl, context, detected);
      case 'claude': return interpretImageWithClaude(imageUrl, context, detected);
    }
  };

  try {
    // 1차 시도: 기본 provider
    const primaryProvider = availableProviders[0];
    let result = await callProvider(primaryProvider);

    // ★ forceGraph인데 photo 반환 → 다른 모델로 재시도
    if (result.figureType === 'photo' && detected?.forceGraph) {
      for (const retryP of availableProviders.slice(1)) {
        console.log(`[Vision] ★ ${primaryProvider}가 photo 반환 → ${retryP}로 재시도 (forceGraph=true)`);
        try {
          const retryResult = await callProvider(retryP);
          if (retryResult.figureType !== 'photo') {
            console.log(`[Vision] ★ ${retryP} 재시도 성공: ${retryResult.figureType}`);
            return postProcessResult(retryResult, detected);
          }
        } catch (retryErr) {
          console.warn(`[Vision] ${retryP} 재시도 실패:`, retryErr);
        }
      }
    }

    result = postProcessResult(result, detected);

    // ★★ postProcess 후에도 photo가 되었으면 (타입 불일치로 expressions 비워짐 등) → 다른 모델 재시도
    if (result.figureType === 'photo' && result.confidence === 0 && detected?.forceGraph) {
      for (const retryP of availableProviders.slice(1)) {
        console.log(`[Vision] ★ postProcess 후 photo → ${retryP}로 재시도`);
        try {
          const retryResult = await callProvider(retryP);
          const retryProcessed = postProcessResult(retryResult, detected);
          if (retryProcessed.figureType !== 'photo') {
            console.log(`[Vision] ★ ${retryP} 재시도 성공: ${retryProcessed.figureType}`);
            return retryProcessed;
          }
        } catch (retryErr) {
          console.warn(`[Vision] ${retryP} 재시도 실패:`, retryErr);
        }
      }
    }

    // ================================================================
    // ★ EVPM: Visual Prompting 재시도 (저신뢰 graph/geometry 결과)
    // 주석 이미지를 생성하여 같은 VLM으로 2차 해석 시도
    // ================================================================
    if (shouldRetryWithVP(result)) {
      console.log(`[Vision] ★★ EVPM 재시도 시작: confidence=${result.confidence.toFixed(2)}, type=${result.figureType}`);

      try {
        const vpResult = await applyVisualPrompting(imageUrl, result, context);

        if (vpResult.applied && vpResult.annotatedImageUrl) {
          // VP 강화 프롬프트 생성
          const vpPromptHint = createVPEnhancedPrompt(
            vpResult.annotationsUsed || [],
            vpResult.axesDetected,
          );
          const vpContext = (context || '') + vpPromptHint;

          // VP 주석 이미지로 2차 VLM 호출
          const vpDetected = vpContext ? detectEquationsFromContent(vpContext) : null;
          const vpProvider = availableProviders[0];
          console.log(`[Vision] EVPM: ${vpProvider}로 주석 이미지 해석 중...`);

          const vpInterpreted = await callProvider(vpProvider);
          // ★ vpInterpreted는 원본 이미지로 호출됨 — 주석 이미지로 재호출 필요
          // 실제로는 주석 이미지 URL을 사용해야 하므로, 별도 함수로 호출
          let vpReinterpret: InterpretedFigure;
          switch (vpProvider) {
            case 'gemini':
              vpReinterpret = await interpretImageWithGemini(vpResult.annotatedImageUrl, vpContext, vpDetected);
              break;
            case 'gpt':
              vpReinterpret = await interpretImageWithGPT(vpResult.annotatedImageUrl, vpContext, vpDetected);
              break;
            case 'claude':
              vpReinterpret = await interpretImageWithClaude(vpResult.annotatedImageUrl, vpContext, vpDetected);
              break;
            default:
              vpReinterpret = await interpretImageWithGemini(vpResult.annotatedImageUrl, vpContext, vpDetected);
          }

          const vpProcessed = postProcessResult(vpReinterpret, detected);

          // 결과 비교
          const comparison = compareResults(result, vpProcessed);
          console.log(`[Vision] EVPM 결과: winner=${comparison.winner}, reason=${comparison.reason}`);

          if (comparison.winner === 'vp') {
            console.log(`[Vision] ★★ EVPM 채택! ${result.confidence.toFixed(2)} → ${vpProcessed.confidence.toFixed(2)}`);
            // originalImageUrl은 원본으로 유지 (주석 이미지가 아닌)
            vpProcessed.originalImageUrl = result.originalImageUrl || imageUrl;
            return vpProcessed;
          }
        }
      } catch (vpErr) {
        console.warn(`[Vision] EVPM 재시도 실패:`, vpErr);
        // VP 실패해도 원본 결과는 유지
      }
    }

    // ================================================================
    // ★★★ 2단계: geometry/table → AI 직접 SVG 생성
    // 구조화된 JSON(vertices/segments)으로는 호(arc), 곡선 등을 표현 못함
    // GPT-4o에게 원본 이미지를 보고 직접 SVG를 그리게 함
    // ================================================================
    if (
      (result.figureType === 'geometry' || result.figureType === 'table' || result.figureType === 'diagram') &&
      result.confidence >= 0.3
    ) {
      // ★ geometry도 2단계 SVG 생성 실행 (노란 음영, 점선 치수 등 스타일 규칙 적용)
      console.log(`[Vision] ★★ 2단계: ${result.figureType} → AI 직접 SVG 생성 시작`);
      try {
        const svgResult = await generateSvgStep2(imageUrl, result, context);
        if (svgResult) {
          // rendering.svg에 저장 → figure-renderer.ts가 SVG 우선 사용
          if (result.rendering && result.rendering.type === 'geometry') {
            (result.rendering as GeometryRendering).svg = svgResult;
            console.log(`[Vision] ★★ 2단계 SVG 생성 성공! (${svgResult.length}자)`);
          } else if (result.rendering) {
            // table/diagram도 svg 필드에 저장
            (result.rendering as unknown as Record<string, unknown>).svg = svgResult;
            console.log(`[Vision] ★★ 2단계 SVG 생성 성공 (${result.figureType})! (${svgResult.length}자)`);
          }
        }
      } catch (svgErr) {
        console.warn(`[Vision] 2단계 SVG 생성 실패 (프로그래밍 SVG 폴백 사용):`, svgErr);
        // 실패해도 1단계 결과(구조 데이터)는 유지
      }
    }

    return result;
  } catch (error) {
    console.error(`[Vision] ${availableProviders[0]} failed:`, error);

    // 순차 fallback: 2번째, 3번째 provider 시도
    for (const fbProvider of availableProviders.slice(1)) {
      console.log(`[Vision] Falling back to ${fbProvider}...`);
      try {
        const fbResult = await callProvider(fbProvider);
        return postProcessResult(fbResult, detected);
      } catch (fbError) {
        console.error(`[Vision] Fallback ${fbProvider} also failed:`, fbError);
      }
    }

    return createFallbackFigure(imageUrl, error instanceof Error ? error.message : '알 수 없는 오류');
  }
}

/**
 * AI 응답 후처리: content_latex에서 감지된 수식 정보로 결과 보정
 * - geometry로 분류되었지만 수식이 감지된 경우 → graph로 강제 전환
 * - graph인데 expressions가 비어있으면 감지된 수식 주입
 */
function postProcessResult(
  result: InterpretedFigure,
  detected: DetectedEquations | null
): InterpretedFigure {
  if (!detected || !detected.forceGraph) return result;

  // Case 0: AI가 photo로 분류했지만 수식/그래프 키워드가 확실히 있는 경우 → graph로 강제 전환
  if (result.figureType === 'photo' && detected.forceGraph && detected.equations.length > 0) {
    console.log(`[Vision] ★ 후처리 보정: photo → graph (forceGraph=true, 감지된 수식: ${detected.equations.join(', ')})`);

    const graphRendering: GraphRendering = {
      type: 'graph',
      expressions: detected.equations.map(eq => ({
        latex: eq.replace(/^y\s*=\s*/, 'y=').replace(/^f\s*\(\s*x\s*\)\s*=\s*/, 'y='),
        color: '#2563eb',
        style: 'solid' as const,
        hidden: false,
      })),
      xRange: [-5, 10],
      yRange: [-8, 10],
      points: [],
      annotations: [],
    };

    return {
      ...result,
      figureType: 'graph',
      confidence: 0.7,
      rendering: graphRendering,
    };
  }

  // Case 1: AI가 geometry로 분류했지만 실제 수식이 감지된 경우에만 graph로 전환
  // ★ 키워드만 있고 수식이 없으면 geometry 유지 (부채꼴, 좌표 위 도형 등)
  if (result.figureType === 'geometry' && detected.forceGraph && detected.equations.length > 0) {
    console.log(`[Vision] ★ 후처리 보정: geometry → graph (감지된 수식: ${detected.equations.join(', ')})`);

    // geometry 렌더링 데이터에서 points, segments 등을 보존하여 graph로 전환
    const geoRendering = result.rendering as GeometryRendering | null;
    const graphRendering: GraphRendering = {
      type: 'graph',
      expressions: detected.equations.map(eq => ({
        latex: eq.replace(/^y\s*=\s*/, 'y=').replace(/^f\s*\(\s*x\s*\)\s*=\s*/, 'y='),
        color: '#2563eb',
        style: 'solid' as const,
        hidden: false,
      })),
      xRange: [-5, 10],
      yRange: [-5, 10],
      points: geoRendering?.vertices?.map(v => ({ x: v.x, y: v.y, label: v.label })) || [],
      annotations: [],
      segments: geoRendering?.segments,
      shadedRegions: geoRendering?.shadedRegions,
    };

    return {
      ...result,
      figureType: 'graph',
      rendering: graphRendering,
    };
  }

  // Case 1.5: ★ graph expressions 검증 — 비정상 latex 제거 (한글, base64, 200자 초과 등)
  if (result.figureType === 'graph') {
    const graphRendering = result.rendering as GraphRendering | null;
    if (graphRendering && graphRendering.expressions.length > 0) {
      const before = graphRendering.expressions.length;
      graphRendering.expressions = graphRendering.expressions.filter(e => {
        const ltx = e.latex || '';
        // 200자 초과 → 문제 텍스트 혼입
        if (ltx.length > 200) {
          console.warn(`[Vision] ★ 비정상 expression 제거 (${ltx.length}자 초과):`, ltx.substring(0, 80));
          return false;
        }
        // 한글 포함 → 수식이 아님
        if (/[\uAC00-\uD7AF]/.test(ltx)) {
          console.warn(`[Vision] ★ 비정상 expression 제거 (한글 포함):`, ltx.substring(0, 80));
          return false;
        }
        // base64 데이터 포함
        if (/base64/.test(ltx) || /data:image/.test(ltx)) {
          console.warn(`[Vision] ★ 비정상 expression 제거 (base64 포함)`);
          return false;
        }
        return true;
      });
      if (graphRendering.expressions.length < before) {
        console.log(`[Vision] ★ 비정상 expression ${before - graphRendering.expressions.length}개 제거됨`);
      }
    }
  }

  // Case 1.8: ★★★ 감지된 수식 타입과 AI 결과 불일치 → 강제 교정
  // 예: content_latex에 지수함수가 있는데 AI가 cos/sin 반환 → 감지 수식으로 대체
  if (result.figureType === 'graph' && detected.equations.length > 0) {
    const graphRendering = result.rendering as GraphRendering | null;
    if (graphRendering) {
      const detectedEq = detected.equations[0];
      const solidExprs = graphRendering.expressions.filter(e => e.style !== 'dashed');
      const dashedExprs = graphRendering.expressions.filter(e => e.style === 'dashed');

      // 감지된 수식의 함수 타입 판별
      const detectedIsExp = /\^|\\frac.*\^|exp/i.test(detectedEq) && !/sin|cos|tan/i.test(detectedEq);
      const detectedIsTrig = /sin|cos|tan/i.test(detectedEq);
      const detectedIsLog = /log|ln/i.test(detectedEq);

      if (solidExprs.length > 0) {
        const aiExpr = solidExprs[0].latex;
        const aiIsTrig = /sin|cos|tan/i.test(aiExpr);
        const aiIsExp = /\^|exp/i.test(aiExpr) && !aiIsTrig;
        const aiIsLog = /log|ln/i.test(aiExpr);

        // 타입 불일치 감지
        const mismatch =
          (detectedIsExp && aiIsTrig) ||  // 지수 → 삼각 (잘못됨)
          (detectedIsExp && aiIsLog) ||   // 지수 → 로그 (잘못됨)
          (detectedIsTrig && !aiIsTrig) ||  // 삼각 → 비삼각 (잘못됨)
          (detectedIsLog && !aiIsLog);    // 로그 → 비로그 (잘못됨)

        if (mismatch) {
          console.warn(`[Vision] ★★★ 수식 타입 불일치! 감지: "${detectedEq}" ↔ AI: "${aiExpr}"`);
          // ★ 감지 수식에 미지수(a,b,k 등)가 포함되어 있으면 교체하면 렌더링 불가
          // 미지수 판별: x 외의 알파벳 소문자가 있으면 미지수 포함
          const hasUnresolved = /[a-w](?![a-z])/i.test(
            detectedEq.replace(/\\?(sin|cos|tan|log|ln|exp|frac|left|right|sqrt|pi|cdot|text)/gi, '')
                       .replace(/x/g, '')
          );
          if (hasUnresolved) {
            // ★ 미지수 있음 → AI 결과 유지 (이전: 제거 → photo → GPT 폴백 유발)
            // AI가 이미지의 시각적 분석으로 결정한 수식이 있으므로 그대로 사용
            console.warn(`[Vision] → 감지 수식에 미지수 포함 — AI 결과 유지 (불필요 폴백 방지)`);
          } else {
            // 미지수 없음 → 감지 수식으로 교체
            console.warn(`[Vision] → AI의 solid expression을 감지된 수식으로 대체`);
            graphRendering.expressions = [
              {
                latex: detectedEq.replace(/^y\s*=\s*/, 'y=').replace(/^f\s*\(\s*x\s*\)\s*=\s*/, 'y='),
                color: '#2563eb',
                style: 'solid' as const,
                hidden: false,
              },
              ...dashedExprs,
            ];
          }
        }
      }
    }
  }

  // Case 2: graph인데 expressions가 비어있으면 감지된 수식 주입
  // ★ 단, 미지수(a,b,k 등) 포함 수식은 렌더링 불가하므로 주입하지 않음
  if (result.figureType === 'graph' && detected.equations.length > 0) {
    const graphRendering = result.rendering as GraphRendering | null;
    if (graphRendering && graphRendering.expressions.length === 0) {
      const renderableEqs = detected.equations.filter(eq => {
        const stripped = eq.replace(/\\?(sin|cos|tan|log|ln|exp|frac|left|right|sqrt|pi|cdot|text)/gi, '').replace(/x/g, '');
        return !/[a-w]/i.test(stripped);
      });
      // ★ 상수 수식(y=숫자)만 있으면 메인 곡선이 없는 것 → 주입해도 빈 그래프
      const mainCurves = renderableEqs.filter(eq => /x/.test(eq));
      const constants = renderableEqs.filter(eq => !/x/.test(eq));
      if (mainCurves.length > 0) {
        console.log(`[Vision] ★ 후처리: graph에 감지된 수식 주입: ${renderableEqs.join(', ')}`);
        graphRendering.expressions = [
          ...mainCurves.map(eq => ({
            latex: eq.replace(/^y\s*=\s*/, 'y=').replace(/^f\s*\(\s*x\s*\)\s*=\s*/, 'y='),
            color: '#2563eb',
            style: 'solid' as const,
            hidden: false,
          })),
          ...constants.map(eq => ({
            latex: eq.replace(/^y\s*=\s*/, 'y='),
            color: '#9ca3af',
            style: 'dashed' as const,
            hidden: false,
          })),
        ];
      } else {
        console.warn(`[Vision] ★ 감지된 수식 모두 미지수 포함 — 주입 불가, 빈 graph 반환`);
        // ★ expressions 비어있는 graph → photo로 전환하여 fallback 유도
        result.figureType = 'photo';
        result.rendering = null;
        result.confidence = 0;
      }
    }
  }

  // Case 3: ★★★ 문제에서 수식 1개만 감지 → solid expression을 1개로 강제 제한
  // AI가 2개 이상의 solid 곡선을 반환하는 문제 방지 (예: 삼각함수에서 원본+변환 2개 반환)
  if (result.figureType === 'graph' && detected.equations.length === 1) {
    const graphRendering = result.rendering as GraphRendering | null;
    if (graphRendering) {
      const solidExprs = graphRendering.expressions.filter(e => e.style !== 'dashed');
      const dashedExprs = graphRendering.expressions.filter(e => e.style === 'dashed');
      if (solidExprs.length > 1) {
        console.log(`[Vision] ★ 후처리: ${solidExprs.length}개 solid expression → 1개로 제한 (수식 1개 감지)`);
        solidExprs.forEach((e, i) => console.log(`  [${i}] ${e.latex} ${i === 0 ? '✓ 유지' : '✗ 제거'}`));
        graphRendering.expressions = [solidExprs[0], ...dashedExprs];
      }
    }
  }

  // Case 4: ★ points 중복 제거 (같은 좌표+라벨 중복 방지)
  if (result.figureType === 'graph') {
    const graphRendering = result.rendering as GraphRendering | null;
    if (graphRendering && graphRendering.points.length > 1) {
      const before = graphRendering.points.length;
      const seen = new Set<string>();
      graphRendering.points = graphRendering.points.filter(p => {
        const key = `${p.x},${p.y},${p.label || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (graphRendering.points.length < before) {
        console.log(`[Vision] ★ 후처리: 중복 point ${before - graphRendering.points.length}개 제거`);
      }
    }
  }

  return result;
}

/**
 * forceGraph일 때 시스템 프롬프트에 추가할 강제 지시문
 * crop 이미지가 전체 문제(텍스트+그래프)인 경우 AI가 "photo"로 분류하는 것을 방지
 */
function getSystemPrompt(detected?: DetectedEquations | null): string {
  if (!detected?.forceGraph) return ANALYSIS_SYSTEM_PROMPT;

  return ANALYSIS_SYSTEM_PROMPT + `

★★★ 최우선 지시 (OVERRIDE) ★★★
이 이미지는 수학 시험지에서 잘라낸 문제 영역입니다.
이미지에 텍스트가 많더라도, 그 안에 그래프/도형/표가 반드시 포함되어 있습니다.
이미지 전체가 텍스트로 보이더라도 좌표축, 곡선, 도형, 표를 꼼꼼히 찾으세요.

★ "photo" 분류 금지 — 이 이미지를 절대 "photo"로 분류하지 마세요.
★ 그래프가 보이면 → "graph" (좌표축, 곡선, 점 등)
★ 도형이 보이면 → "geometry" (삼각형, 원, 사각형 등)
★ 표가 보이면 → "table" (숫자 배열, 조립제법 등)
★ 그래프 키워드(함수, 좌표, 포물선 등)가 문제에 있으므로 이미지에서 해당 요소를 반드시 찾아 분석하세요.`;
}

/**
 * Gemini Vision으로 이미지 해석 (기본: gemini-3-flash-preview)
 * ★ Gemini는 이미지를 먼저 배치하고, 시스템 프롬프트를 짧게 유지해야 정확도가 높음
 */
async function interpretImageWithGemini(
  imageUrl: string,
  context?: string,
  detected?: DetectedEquations | null
): Promise<InterpretedFigure> {
  console.log(`[Vision] Gemini (${GEMINI_MODEL}): Analyzing image... (forceGraph=${detected?.forceGraph || false})`);

  if (!GOOGLE_AI_KEY) {
    throw new Error('GOOGLE_AI_KEY (or GEMINI_API_KEY) not configured');
  }

  // ★ Gemini용 짧은 시스템 지시 (긴 프롬프트는 유저 메시지로 이동)
  const geminiSystemInstruction = `당신은 수학 교육 자료의 시각적 요소를 분석하는 전문가입니다.
이미지를 분석하여 반드시 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

★★★ 최중요 규칙 ★★★
1. 당신의 역할은 수학 문제를 푸는 것이 아닙니다. 이미지의 시각적 그래프/곡선/도형의 모양만 분석하세요.
2. 이미지에 수학 문제 텍스트가 보여도 그것을 읽거나 풀려고 하지 마세요.
3. 아래 사용자 메시지에서 제공하는 수식(equations)이 이 그래프의 정확한 수식입니다. 이미지에서 다른 수식을 읽지 마세요.
4. 그래프의 시각적 특징(x절편, y절편, 꼭짓점, 점근선, 주기)만 관찰하여 파라미터를 결정하세요.
${detected?.forceGraph ? '★★★ 이 이미지에는 수학 그래프/도형/표가 반드시 포함되어 있습니다. "photo"로 분류하지 마세요!' : ''}`;

  // ★ 상세 분석 지시는 유저 메시지에 모두 포함
  const fullSystemPrompt = getSystemPrompt(detected);
  const userMessage = buildUserMessage(context, detected);
  const combinedUserMessage = fullSystemPrompt + '\n\n---\n\n' + userMessage + '\n\nJSON으로만 응답하세요.';

  const genAI = new GoogleGenerativeAI(GOOGLE_AI_KEY);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: geminiSystemInstruction,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,  // ★ 4000 → 8000 (응답 절단 방지)
    },
  });

  // 이미지 데이터 준비
  let imagePart: { inlineData: { data: string; mimeType: string } };

  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid base64 data URI format');
    imagePart = {
      inlineData: { data: match[2], mimeType: match[1] },
    };
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/png';
    imagePart = {
      inlineData: { data: base64, mimeType: contentType },
    };
  }

  // 재시도 로직
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // ★ 이미지를 먼저 배치 — Gemini는 이미지 → 텍스트 순서가 정확도 높음
      const result = await model.generateContent([
        imagePart,
        { text: combinedUserMessage },
      ]);
      const response = result.response;
      const text = response.text();

      if (!text) throw new Error('Gemini returned empty response');

      console.log(`[Vision] Gemini raw (first 500):`, text.substring(0, 500));

      const parsed = parseVisionResponse(text, imageUrl);

      const geminiRendering = parsed.rendering as unknown as Record<string, unknown> | null;
      if (geminiRendering?.expressions) {
        console.log(`[Vision] Gemini expressions:`, JSON.stringify(geminiRendering.expressions));
      }
      console.log(`[Vision] Gemini (${GEMINI_MODEL}) result: ${parsed.figureType} (confidence: ${parsed.confidence})`);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errMsg = lastError.message;

      if ((errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('500')) && attempt < 2) {
        const waitTime = (attempt + 1) * 3000;
        console.warn(`[Vision/Gemini] Error ${errMsg.substring(0, 100)}, retrying in ${waitTime}ms (${2 - attempt} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Gemini: unknown error after retries');
}

/**
 * GPT-4o Vision으로 이미지 해석
 */
async function interpretImageWithGPT(
  imageUrl: string,
  context?: string,
  detected?: DetectedEquations | null
): Promise<InterpretedFigure> {
  console.log(`[Vision] GPT-4o: Analyzing image... (forceGraph=${detected?.forceGraph || false})`);

  const systemPrompt = getSystemPrompt(detected);
  const userMessage = buildUserMessage(context, detected);

  const response = await callOpenAIVision(imageUrl, systemPrompt, userMessage, true);
  const parsed = parseVisionResponse(response, imageUrl);

  // ★ 디버그: 반환된 expressions 로깅
  const gptRendering = parsed.rendering as unknown as Record<string, unknown> | null;
  if (gptRendering?.expressions) {
    console.log(`[Vision] GPT-4o expressions:`, JSON.stringify(gptRendering.expressions));
  }
  console.log(`[Vision] GPT-4o result: ${parsed.figureType} (confidence: ${parsed.confidence})`);
  return parsed;
}

/**
 * Claude Sonnet Vision으로 이미지 해석
 */
async function interpretImageWithClaude(
  imageUrl: string,
  context?: string,
  detected?: DetectedEquations | null
): Promise<InterpretedFigure> {
  console.log(`[Vision] Claude Sonnet: Analyzing image... (forceGraph=${detected?.forceGraph || false})`);

  const systemPrompt = getSystemPrompt(detected);
  const userMessage = buildUserMessage(context, detected, true);

  const response = await callClaudeVision(imageUrl, systemPrompt, userMessage);
  const parsed = parseVisionResponse(response, imageUrl);

  // ★ 디버그: 반환된 expressions 로깅
  const claudeRendering = parsed.rendering as unknown as Record<string, unknown> | null;
  if (claudeRendering?.expressions) {
    console.log(`[Vision] Claude expressions:`, JSON.stringify(claudeRendering.expressions));
  }
  console.log(`[Vision] Claude Sonnet result: ${parsed.figureType} (confidence: ${parsed.confidence})`);
  return parsed;
}

/**
 * Vision AI에 전달할 사용자 메시지 구성
 * content_latex에서 감지된 수식 정보를 강제 힌트로 포함
 */
function buildUserMessage(
  context?: string,
  detected?: DetectedEquations | null,
  appendJsonInstruction = false
): string {
  if (!context) {
    return appendJsonInstruction
      ? '이 수학 문제의 이미지를 분석해주세요. JSON으로만 응답하세요.'
      : '이 수학 문제의 이미지를 분석해주세요.';
  }

  let msg = `이 이미지는 다음 수학 문제에 포함된 그래프/도형입니다:\n\n"${context.substring(0, 800)}"`;
  msg += `\n\n중요: 문제 텍스트의 수학적 조건(길이, 각도, 위치관계 등)을 반드시 읽고, 이를 기반으로 정확한 좌표를 계산하여 응답하세요. 음영 색상은 이미지에서 보이는 실제 색상(보통 yellow)을 사용하세요.`;

  // ★ 수식 자동 감지 힌트 주입
  if (detected?.hint) {
    msg += detected.hint;
  }

  // ★★ 수식이 있을 때 추가 강제 지시
  if (detected?.equations && detected.equations.length > 0) {
    msg += `\n\n★★★ 매우 중요 ★★★`;
    msg += `\n1. 위에 제시된 수식이 이 그래프의 정확한 수식입니다. 이미지에서 수식을 읽으려 하지 마세요.`;
    msg += `\n2. 당신의 역할은 문제를 풀거나 수식을 해석하는 것이 아닙니다. 오직 그래프의 시각적 모양만 분석하세요.`;
    msg += `\n3. 미지수(a,b,k 등)는 이미지의 그래프 모양(점근선, x절편, y절편, 꼭짓점 등)에서 값을 결정하여 숫자로 대입하세요.`;
    msg += `\n4. expressions에 반드시 위에 제시된 수식만 사용하세요.`;
    msg += `\n5. 필수 검증: 파라미터를 결정한 후, y=0을 대입하여 x절편을 계산하고 이미지의 x축 교점과 반드시 비교하세요. 불일치하면 파라미터를 재조정하세요!`;
  }

  if (appendJsonInstruction) {
    msg += '\n\nJSON으로만 응답하세요.';
  }

  return msg;
}

/**
 * Step 1 구조 분석 결과를 기반으로 Step 2 SVG 생성 프롬프트 작성
 * 구조 데이터를 전달하여 GPT-4o가 더 정확한 SVG를 생성하도록 함
 */
function buildSvgPrompt(parsed: InterpretedFigure, context?: string): string {
  const parts: string[] = [];

  parts.push('★ Look at the ORIGINAL IMAGE carefully and reproduce it as clean SVG.');
  parts.push(`★ Figure description: "${parsed.description}"`);

  if (context) {
    parts.push(`\nProblem context: "${context.substring(0, 400)}"`);
  }

  if (parsed.rendering) {
    const r = parsed.rendering;

    if (r.type === 'geometry') {
      const geo = r as GeometryRendering;
      parts.push(`\n★★ The ORIGINAL IMAGE is the ground truth. The data below is approximate reference only.`);
      parts.push(`★★ Use SVG arc commands for curves. Replace hatching with solid yellow fill rgba(250,204,21,0.35).`);
      parts.push(`★★ ORIENTATION: Match the original EXACTLY. Symmetric = centered and upright. Do NOT tilt.`);
      parts.push(`★★ SIZE: SCALE the figure to fill 80-90% of the 400×300 viewBox. Do NOT use the raw reference coordinates as SVG coordinates.`);
      if (geo.vertices.length > 0) {
        // ★ Y축 반전: 수학 좌표계(y↑) → SVG 좌표계(y↓)
        const maxY = Math.max(...geo.vertices.map(v => v.y), 0);
        const invertedVertices = geo.vertices.map(v => ({
          ...v,
          y: +(maxY - v.y).toFixed(2)
        }));
        // ★ x좌표 기준 정렬 → 좌→우 순서 명시
        const sortedByX = [...invertedVertices].sort((a, b) => a.x - b.x);
        const labelOrder = sortedByX.map(v => v.label).join(' - ');
        parts.push(`\nReference vertices (y converted to SVG, scale to viewBox): ${JSON.stringify(invertedVertices)}`);
        parts.push(`★ Label order LEFT→RIGHT: ${labelOrder} — match this EXACT order!`);

        // ★ 부채꼴 각도 자동 계산: 중심(O)에서 가장 먼 두 점 사이의 각도
        const center = geo.vertices.find(v => v.label === 'O' || v.label === 'o');
        if (center) {
          const others = geo.vertices.filter(v => v.label !== center.label);
          if (others.length >= 2) {
            // 중심에서 가장 먼 두 점 찾기
            const withDist = others.map(v => ({
              ...v,
              dist: Math.sqrt((v.x - center.x) ** 2 + (v.y - center.y) ** 2)
            }));
            withDist.sort((a, b) => b.dist - a.dist);
            const p1 = withDist[0]; // 가장 먼 점 (outer)
            const p2 = withDist[1]; // 두번째로 먼 점 (outer)
            // 두 벡터 사이 각도 계산
            const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
            const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
            let angleDeg = Math.abs(angle1 - angle2) * (180 / Math.PI);
            if (angleDeg > 180) angleDeg = 360 - angleDeg;
            angleDeg = Math.round(angleDeg);
            if (angleDeg > 0 && angleDeg < 360) {
              parts.push(`★★★ FAN ANGLE: The arc spans approximately ${angleDeg}° (NOT 180°!). Match this angle exactly.`);
            }
          }
        }
      }
      if (geo.segments.length > 0) {
        parts.push(`Reference segments (straight lines only — arcs/curves are NOT listed here, check the image): ${JSON.stringify(geo.segments)}`);
      }
      if (geo.dashedSegments && geo.dashedSegments.length > 0) {
        parts.push(`Dashed segments: ${JSON.stringify(geo.dashedSegments)}`);
      }
      if (geo.lengths.length > 0) {
        parts.push(`Labels: ${JSON.stringify(geo.lengths)}`);
      }
    } else if (r.type === 'graph') {
      // ★ graph는 좌표 데이터가 정확 → 전달
      const graph = r as unknown as { points?: Array<{ x: number; y: number; label?: string }>; expressions?: unknown[]; xRange?: [number, number]; yRange?: [number, number] };
      parts.push(`\n★★ This is a GRAPH with coordinate axes. Use the reference data for accurate plotting.`);
      if (graph.points && graph.points.length > 0) {
        parts.push(`Key points: ${JSON.stringify(graph.points)}`);
      }
      if (graph.xRange) {
        parts.push(`X range: ${JSON.stringify(graph.xRange)}, Y range: ${JSON.stringify(graph.yRange)}`);
      }
    } else if (r.type === 'table') {
      const tbl = r as TableRendering;
      parts.push(`\nTable headers: ${JSON.stringify(tbl.headers)}`);
      parts.push(`Table rows: ${JSON.stringify(tbl.rows)}`);
      parts.push(`IMPORTANT: Empty string "" cells should be drawn as empty rectangles. Any cell with handwriting or scribbles in the original image should also be empty rectangles.`);
    }
  }

  return parts.join('\n');
}

// ============================================================================
// ★★★ 프로그래밍 방식 SVG 생성 (부채꼴, 삼각형 등 일반 도형)
// AI에 의존하지 않고 구조 데이터(vertices, segments)로 직접 SVG 구성
// ============================================================================

function tryBuildGeometrySvgProgrammatic(parsed: InterpretedFigure): string | null {
  if (!parsed.rendering || parsed.rendering.type !== 'geometry') return null;
  const geo = parsed.rendering as GeometryRendering;
  const desc = (parsed.description || '').toLowerCase();

  // 부채꼴/sector 감지
  if (desc.includes('부채꼴') || desc.includes('sector') || desc.includes('호') || desc.includes('fan')) {
    return buildSectorSvg(geo);
  }

  return null;
}

function buildSectorSvg(geo: GeometryRendering): string | null {
  // 1. 중심점 O 찾기
  const center = geo.vertices.find(v => v.label.toUpperCase() === 'O');
  if (!center) return null;

  const others = geo.vertices.filter(v => v.label.toUpperCase() !== 'O');
  if (others.length < 2) return null;

  // 2. 각 점의 거리 계산
  const withDist = others.map(v => ({
    ...v,
    dist: Math.sqrt((v.x - center.x) ** 2 + (v.y - center.y) ** 2)
  }));

  // 3. 거리 기준 클러스터링 (inner r₁ vs outer r₂)
  const distances = withDist.map(v => v.dist).sort((a, b) => a - b);
  const isAnnular = others.length >= 4; // 4+ points = annular sector (띠)

  let innerPts: typeof withDist = [];
  let outerPts: typeof withDist = [];

  if (isAnnular) {
    // k-means style: 2 clusters by distance
    const midDist = (distances[Math.floor(distances.length / 2 - 1)] + distances[Math.floor(distances.length / 2)]) / 2;
    innerPts = withDist.filter(v => v.dist < midDist);
    outerPts = withDist.filter(v => v.dist >= midDist);
  } else {
    outerPts = withDist;
  }

  if (outerPts.length < 2) return null;

  // 4. x좌표로 좌/우 정렬
  outerPts.sort((a, b) => a.x - b.x);
  if (innerPts.length >= 2) innerPts.sort((a, b) => a.x - b.x);

  // 5. 반지름 계산
  const r2 = outerPts.reduce((s, v) => s + v.dist, 0) / outerPts.length;
  const r1 = innerPts.length > 0 ? innerPts.reduce((s, v) => s + v.dist, 0) / innerPts.length : 0;

  // 6. 부채꼴 각도 계산
  const outerLeft = outerPts[0];
  const outerRight = outerPts[outerPts.length - 1];
  const angleLeft = Math.atan2(outerLeft.y - center.y, outerLeft.x - center.x);
  const angleRight = Math.atan2(outerRight.y - center.y, outerRight.x - center.x);
  let fanAngle = Math.abs(angleLeft - angleRight) * (180 / Math.PI);
  if (fanAngle > 180) fanAngle = 360 - fanAngle;

  console.log(`[Vision] ★ 프로그래밍 SVG: r1=${r1.toFixed(2)}, r2=${r2.toFixed(2)}, angle=${fanAngle.toFixed(0)}°, isAnnular=${isAnnular}`);

  // 7. SVG 좌표 변환
  const W = 400, H = 300;
  const margin = 35;

  // 모든 점의 bounding box 계산 (수학 좌표계)
  const allX = [center.x, ...others.map(v => v.x)];
  const allY = [center.y, ...others.map(v => v.y)];
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minY = Math.min(...allY), maxY = Math.max(...allY);
  const dataW = maxX - minX || 1;
  const dataH = maxY - minY || 1;

  // 가용 영역에 맞게 스케일
  const availW = W - 2 * margin;
  const availH = H - 2 * margin - 30; // 라벨 공간
  const scale = Math.min(availW / dataW, availH / dataH) * 0.85;

  // 중심을 기준으로 SVG 좌표 변환 (y 반전: 수학 ↑ → SVG ↓)
  const dataCenterX = (minX + maxX) / 2;
  const dataCenterY = (minY + maxY) / 2;
  const svgCx = W / 2;
  const svgCy = H / 2 + 15; // 약간 아래로 (라벨 공간)

  const toSvg = (v: { x: number; y: number }) => ({
    x: Math.round(svgCx + (v.x - dataCenterX) * scale),
    y: Math.round(svgCy - (v.y - dataCenterY) * scale) // y 반전
  });

  const cSvg = toSvg(center);
  const oLSvg = toSvg(outerLeft);
  const oRSvg = toSvg(outerRight);
  const svgR2 = Math.round(r2 * scale);
  const svgR1 = Math.round(r1 * scale);

  const largeArc = fanAngle > 180 ? 1 : 0;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%">`);

  if (isAnnular && innerPts.length >= 2) {
    // ===== 부채꼴의 띠 (Annular Sector) =====
    const innerLeft = innerPts[0];
    const innerRight = innerPts[innerPts.length - 1];
    const iLSvg = toSvg(innerLeft);
    const iRSvg = toSvg(innerRight);

    // 채움: outer arc(좌→우 clockwise) → inner arc(우→좌 counter-clockwise)
    // SVG에서 y↓이므로, 위쪽으로 볼록한 호 = sweep=1 (좌→우)
    lines.push(`  <!-- 채움 영역 -->`);
    lines.push(`  <path d="M ${oLSvg.x} ${oLSvg.y} A ${svgR2} ${svgR2} 0 ${largeArc} 1 ${oRSvg.x} ${oRSvg.y} L ${iRSvg.x} ${iRSvg.y} A ${svgR1} ${svgR1} 0 ${largeArc} 0 ${iLSvg.x} ${iLSvg.y} Z" fill="rgba(250,204,21,0.35)" stroke="none"/>`);

    // 외부 호 (실선)
    lines.push(`  <!-- 외부 호 -->`);
    lines.push(`  <path d="M ${oLSvg.x} ${oLSvg.y} A ${svgR2} ${svgR2} 0 ${largeArc} 1 ${oRSvg.x} ${oRSvg.y}" fill="none" stroke="#374151" stroke-width="2"/>`);

    // 내부 호 (실선)
    lines.push(`  <!-- 내부 호 -->`);
    lines.push(`  <path d="M ${iLSvg.x} ${iLSvg.y} A ${svgR1} ${svgR1} 0 ${largeArc} 1 ${iRSvg.x} ${iRSvg.y}" fill="none" stroke="#374151" stroke-width="2"/>`);

    // 왼쪽 반지름 (실선: O → D)
    lines.push(`  <!-- 왼쪽 반지름 (실선) -->`);
    lines.push(`  <line x1="${cSvg.x}" y1="${cSvg.y}" x2="${oLSvg.x}" y2="${oLSvg.y}" stroke="#374151" stroke-width="2"/>`);

    // 오른쪽 반지름 (실선: O → C)
    lines.push(`  <!-- 오른쪽 반지름 (실선) -->`);
    lines.push(`  <line x1="${cSvg.x}" y1="${cSvg.y}" x2="${oRSvg.x}" y2="${oRSvg.y}" stroke="#374151" stroke-width="2"/>`);

    // ★ r₁, r₂ 표시: OC 방향 기준, 바깥쪽(시계방향)에 동심 점선 호
    // A와 C는 같은 반지름 선(OC) 위에 있으므로 모두 OC 방향 기준으로 호를 그림
    const ocAngle = Math.atan2(oRSvg.y - cSvg.y, oRSvg.x - cSvg.x);
    const arcSpan = 38 * Math.PI / 180; // 38° 바깥으로 (시계방향)
    const arcEndAngle = ocAngle + arcSpan;

    // r₁ 점선: O에서 시작 → 직선으로 A까지 → 호로 38°
    const r1ArcPt = { x: Math.round(cSvg.x + svgR1 * Math.cos(ocAngle)), y: Math.round(cSvg.y + svgR1 * Math.sin(ocAngle)) };
    const r1EX = Math.round(cSvg.x + svgR1 * Math.cos(arcEndAngle));
    const r1EY = Math.round(cSvg.y + svgR1 * Math.sin(arcEndAngle));
    lines.push(`  <!-- r₁: O → A(직선) → 호 -->`);
    lines.push(`  <path d="M ${cSvg.x} ${cSvg.y} L ${r1ArcPt.x} ${r1ArcPt.y} A ${svgR1} ${svgR1} 0 0 1 ${r1EX} ${r1EY}" fill="none" stroke="#555" stroke-width="1.5" stroke-dasharray="5,4"/>`);
    lines.push(`  <text x="${r1EX + 7}" y="${r1EY + 5}" fill="#374151" font-family="serif" font-size="14" font-style="italic">r<tspan dy="3" font-size="10">1</tspan></text>`);

    // r₂ 점선: O에서 시작 → 직선으로 C까지 → 호로 38°
    const r2ArcPt = { x: Math.round(cSvg.x + svgR2 * Math.cos(ocAngle)), y: Math.round(cSvg.y + svgR2 * Math.sin(ocAngle)) };
    const r2EX = Math.round(cSvg.x + svgR2 * Math.cos(arcEndAngle));
    const r2EY = Math.round(cSvg.y + svgR2 * Math.sin(arcEndAngle));
    lines.push(`  <!-- r₂: O → C(직선) → 호 -->`);
    lines.push(`  <path d="M ${cSvg.x} ${cSvg.y} L ${r2ArcPt.x} ${r2ArcPt.y} A ${svgR2} ${svgR2} 0 0 1 ${r2EX} ${r2EY}" fill="none" stroke="#555" stroke-width="1.5" stroke-dasharray="5,4"/>`);
    lines.push(`  <text x="${r2EX + 7}" y="${r2EY + 5}" fill="#374151" font-family="serif" font-size="14" font-style="italic">r<tspan dy="3" font-size="10">2</tspan></text>`);
    // ★ 꼭짓점 라벨 — 도형 바깥에 배치
    // 각 점에서 중심(centroid) 반대 방향으로 offset
    const centroidX = (oLSvg.x + oRSvg.x + iLSvg.x + iRSvg.x + cSvg.x) / 5;
    const centroidY = (oLSvg.y + oRSvg.y + iLSvg.y + iRSvg.y + cSvg.y) / 5;

    const allLabelPts = [
      { v: outerLeft, svg: oLSvg },
      { v: innerLeft, svg: iLSvg },
      { v: center, svg: cSvg },
      { v: innerRight, svg: iRSvg },
      { v: outerRight, svg: oRSvg },
    ];
    for (const lp of allLabelPts) {
      // 중심에서 바깥 방향 벡터
      let vx = lp.svg.x - centroidX;
      let vy = lp.svg.y - centroidY;
      const vLen = Math.sqrt(vx * vx + vy * vy) || 1;
      vx = vx / vLen;
      vy = vy / vLen;
      // O는 아래로 더 많이 offset
      const offsetDist = lp.v.label.toUpperCase() === 'O' ? 24 : 20;
      const lx = Math.round(lp.svg.x + vx * offsetDist);
      const ly = Math.round(lp.svg.y + vy * offsetDist + 5); // +5 for text baseline
      lines.push(`  <text x="${lx}" y="${ly}" fill="#1f2937" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${lp.v.label}</text>`);
    }

  } else {
    // ===== 단순 부채꼴 (Sector) =====
    lines.push(`  <path d="M ${cSvg.x} ${cSvg.y} L ${oLSvg.x} ${oLSvg.y} A ${svgR2} ${svgR2} 0 ${largeArc} 1 ${oRSvg.x} ${oRSvg.y} Z" fill="rgba(250,204,21,0.35)" stroke="#374151" stroke-width="2"/>`);

    for (const v of geo.vertices) {
      const sv = toSvg(v);
      const isCenter = v.label.toUpperCase() === 'O';
      const dy = isCenter ? 22 : (sv.y < svgCy ? -10 : 18);
      const dx = sv.x < center.x ? -15 : (sv.x > center.x ? 15 : 0);
      lines.push(`  <text x="${sv.x + dx}" y="${sv.y + dy}" fill="#1f2937" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${v.label}</text>`);
    }
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}

/**
 * 2단계: AI에게 원본 이미지를 보고 직접 SVG를 그리게 함
 * 1단계의 구조 분석(vertices, segments)은 호(arc), 곡선을 표현 못하므로
 * AI가 원본 이미지를 참고하여 정확한 SVG를 직접 생성
 *
 * ★ 모델 우선순위: Claude Sonnet (지시사항 준수 최고) → GPT-4o → Gemini
 * 도형 문제는 시험지당 3~4개뿐이라 비용 부담 적음
 */
async function generateSvgStep2(
  imageUrl: string,
  parsed: InterpretedFigure,
  context?: string
): Promise<string | null> {
  // ★★★ 프로그래밍 방식 우선 시도 (부채꼴 등 일반 도형)
  try {
    const programmaticSvg = tryBuildGeometrySvgProgrammatic(parsed);
    if (programmaticSvg) {
      console.log(`[Vision] 2단계 SVG: ★ 프로그래밍 방식 성공! (${programmaticSvg.length}자)`);
      return programmaticSvg;
    }
  } catch (progErr) {
    console.warn(`[Vision] 프로그래밍 SVG 실패, AI 폴백:`, progErr);
  }

  const svgUserPrompt = buildSvgPrompt(parsed, context);

  // ★ Claude 우선 (SVG 정확도 + 지시사항 준수 최고)
  // 도형 3~4개/시험지이므로 비용 부담 적음
  const svgProviderOrder: Array<'claude' | 'gpt' | 'gemini'> = [];
  if (ANTHROPIC_API_KEY) svgProviderOrder.push('claude');
  if (OPENAI_API_KEY) svgProviderOrder.push('gpt');
  if (GOOGLE_AI_KEY) svgProviderOrder.push('gemini');

  for (const provider of svgProviderOrder) {
    try {
      let rawResponse: string;

      if (provider === 'claude') {
        console.log(`[Vision] 2단계 SVG: Claude Sonnet 사용`);
        rawResponse = await callClaudeVision(imageUrl, SVG_GENERATION_PROMPT, svgUserPrompt, 2, 2000);
      } else if (provider === 'gpt') {
        console.log(`[Vision] 2단계 SVG: GPT-4o 사용`);
        rawResponse = await callOpenAIVision(imageUrl, SVG_GENERATION_PROMPT, svgUserPrompt, false, 2, 2000);
      } else {
        console.log(`[Vision] 2단계 SVG: Gemini 사용`);
        const genAI = new GoogleGenerativeAI(GOOGLE_AI_KEY);
        const model = genAI.getGenerativeModel({
          model: GEMINI_MODEL,
          systemInstruction: SVG_GENERATION_PROMPT,
          generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
        });
        let imagePart: { inlineData: { data: string; mimeType: string } };
        if (imageUrl.startsWith('data:')) {
          const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (!match) continue;
          imagePart = { inlineData: { data: match[2], mimeType: match[1] } };
        } else {
          const res = await fetch(imageUrl);
          if (!res.ok) continue;
          const buffer = await res.arrayBuffer();
          imagePart = {
            inlineData: {
              data: Buffer.from(buffer).toString('base64'),
              mimeType: res.headers.get('content-type') || 'image/png',
            },
          };
        }
        const result = await model.generateContent([imagePart, { text: svgUserPrompt }]);
        rawResponse = result.response.text();
      }

      const svg = extractSvgFromResponse(rawResponse);
      if (svg && svg.includes('<svg') && svg.includes('</svg>')) {
        console.log(`[Vision] 2단계 SVG: ${provider} 성공 (${svg.length}자)`);
        return svg;
      }
      console.warn(`[Vision] 2단계 ${provider} SVG 추출 실패, raw(200):`, rawResponse.substring(0, 200));
    } catch (err) {
      console.warn(`[Vision] 2단계 ${provider} SVG 생성 실패:`, err instanceof Error ? err.message : err);
    }
  }

  return null;
}

/**
 * 여러 이미지를 일괄 해석
 */
export async function interpretImages(
  imageUrls: string[],
  context?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<InterpretedFigure[]> {
  const results: InterpretedFigure[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const result = await interpretImage(imageUrls[i], context);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, imageUrls.length);
    }

    // Rate limiting
    if (i < imageUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// ============================================================================
// OpenAI Vision API 호출
// ============================================================================

async function callOpenAIVision(
  imageUrl: string,
  systemPrompt: string,
  userMessage: string,
  jsonMode: boolean,
  retries = 3,
  backoff = 3000
): Promise<string> {
  const imageContent: { type: 'image_url'; image_url: { url: string; detail: string } } = {
    type: 'image_url',
    image_url: {
      url: imageUrl,
      detail: 'high',
    },
  };

  const body: Record<string, unknown> = {
    model: GPT_MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          imageContent,
        ],
      },
    ],
    temperature: 0, // ★ 안정적인 SVG 결과를 위해 0
    max_tokens: jsonMode ? 4000 : 8000, // SVG 모드는 더 많은 토큰 필요
  };

  // JSON 모드는 구조 분석에만 적용
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, backoff) : backoff;
        console.warn(`[Vision] Rate limited, retrying in ${waitTime}ms (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callOpenAIVision(imageUrl, systemPrompt, userMessage, jsonMode, retries - 1, backoff * 2);
      }
      throw new Error(`OpenAI Vision API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (retries > 0 && error instanceof Error && error.message.includes('429')) {
      console.warn(`[Vision] Rate limited (exception), retrying in ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callOpenAIVision(imageUrl, systemPrompt, userMessage, jsonMode, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// ============================================================================
// Claude Vision API 호출
// ============================================================================

async function callClaudeVision(
  imageUrl: string,
  systemPrompt: string,
  userMessage: string,
  retries = 3,
  backoff = 3000
): Promise<string> {
  // base64 data URI를 파싱
  let imageSource: Record<string, unknown>;

  if (imageUrl.startsWith('data:')) {
    // data:image/png;base64,AAAA... → media_type + data 추출
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid base64 data URI format');
    }
    imageSource = {
      type: 'base64',
      media_type: match[1],
      data: match[2],
    };
  } else {
    // URL인 경우 직접 다운로드하여 base64로 변환
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = res.headers.get('content-type') || 'image/png';
    imageSource = {
      type: 'base64',
      media_type: contentType,
      data: base64,
    };
  }

  // SVG 생성 모드인지 감지 (SVG_GENERATION_PROMPT 사용 시)
  const isSvgMode = systemPrompt.includes('SVG') && !systemPrompt.includes('"figureType"');

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: isSvgMode ? 8000 : 4000,
    temperature: 0, // ★ 안정적인 결과를 위해 temperature 0
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: imageSource,
          },
          {
            type: 'text',
            text: userMessage,
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, backoff) : backoff;
        console.warn(`[Vision/Claude] Rate limited, retrying in ${waitTime}ms (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callClaudeVision(imageUrl, systemPrompt, userMessage, retries - 1, backoff * 2);
      }
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Anthropic API error: ${response.status} - ${errorBody.substring(0, 200)}`);
    }

    const data = await response.json();

    // Claude Messages API 응답에서 텍스트 추출
    if (data.content && Array.isArray(data.content)) {
      const textBlock = data.content.find((block: Record<string, unknown>) => block.type === 'text');
      if (textBlock && typeof textBlock.text === 'string') {
        return textBlock.text;
      }
    }

    throw new Error('Unexpected Claude response format');
  } catch (error) {
    if (retries > 0 && error instanceof Error && (error.message.includes('429') || error.message.includes('overloaded'))) {
      console.warn(`[Vision/Claude] Retrying in ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callClaudeVision(imageUrl, systemPrompt, userMessage, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// ============================================================================
// SVG 추출 (raw 응답에서 SVG 코드만 추출)
// ============================================================================

function extractSvgFromResponse(response: string): string | null {
  let text = response.trim();

  // 마크다운 코드블록 제거
  if (text.includes('```svg')) {
    text = text.split('```svg')[1].split('```')[0].trim();
  } else if (text.includes('```xml')) {
    text = text.split('```xml')[1].split('```')[0].trim();
  } else if (text.includes('```html')) {
    text = text.split('```html')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    const parts = text.split('```');
    if (parts.length >= 2) {
      text = parts[1].split('```')[0].trim();
    }
  }

  // <svg ... </svg> 추출
  const svgStart = text.indexOf('<svg');
  const svgEnd = text.lastIndexOf('</svg>');
  if (svgStart !== -1 && svgEnd !== -1) {
    return text.substring(svgStart, svgEnd + '</svg>'.length);
  }

  return null;
}

// ============================================================================
// 응답 파싱 (구조 분석 JSON)
// ============================================================================

function parseVisionResponse(response: string, originalImageUrl: string): InterpretedFigure {
  try {
    let cleanResponse = response.trim();

    // ★ 마크다운 코드블록 제거 (Gemini가 ```json ... ``` 으로 감쌈)
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
    }

    // ★ 그래도 파싱 실패하면 첫 번째 { ~ 마지막 } 추출
    if (!cleanResponse.startsWith('{')) {
      const firstBrace = cleanResponse.indexOf('{');
      const lastBrace = cleanResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(cleanResponse);

    const figureType: FigureType = validateFigureType(parsed.figureType);
    const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
    const description = parsed.description || '이미지 설명 없음';

    const rendering = validateRendering(figureType, parsed.rendering);

    return {
      figureType,
      description,
      originalImageUrl,
      rendering,
      confidence,
    };
  } catch (error) {
    console.error('[Vision] Failed to parse response:', error, '\nRaw:', response.substring(0, 500));

    // ★ 절단된 JSON에서 figureType이라도 복구 시도
    const typeMatch = response.match(/"figureType"\s*:\s*"(\w+)"/);
    if (typeMatch && typeMatch[1] !== 'photo') {
      console.log(`[Vision] ★ 파싱 실패했지만 figureType="${typeMatch[1]}" 감지 → postProcess에서 보정 가능`);
      // expressions라도 부분 추출 시도
      const exprMatch = response.match(/"latex"\s*:\s*"([^"]+)"/);
      if (exprMatch && typeMatch[1] === 'graph') {
        const partialRendering: GraphRendering = {
          type: 'graph',
          expressions: [{ latex: exprMatch[1], color: '#2563eb', style: 'solid', hidden: false }],
          xRange: [-5, 10], yRange: [-8, 10],
          points: [], annotations: [],
        };
        return {
          figureType: 'graph',
          description: '부분 파싱 복구',
          originalImageUrl,
          rendering: partialRendering,
          confidence: 0.6,
        };
      }
    }

    return createFallbackFigure(originalImageUrl, '응답 파싱 실패');
  }
}

function validateFigureType(type: unknown): FigureType {
  const validTypes: FigureType[] = ['graph', 'geometry', 'table', 'number_line', 'diagram', 'photo'];
  if (typeof type === 'string' && validTypes.includes(type as FigureType)) {
    return type as FigureType;
  }
  return 'photo';
}

function validateRendering(
  figureType: FigureType,
  rendering: unknown
): GraphRendering | GeometryRendering | TableRendering | DiagramRendering | null {
  if (!rendering || figureType === 'photo') {
    return null;
  }

  const r = rendering as Record<string, unknown>;

  switch (figureType) {
    case 'graph':
      return validateGraphRendering(r);
    case 'geometry':
      return validateGeometryRendering(r);
    case 'table':
      return validateTableRendering(r);
    case 'number_line':
    case 'diagram':
      return validateDiagramRendering(r, figureType);
    default:
      return null;
  }
}

function validateGraphRendering(r: Record<string, unknown>): GraphRendering | null {
  const expressions = Array.isArray(r.expressions) ? r.expressions : [];
  if (expressions.length === 0) return null;

  return {
    type: 'graph',
    expressions: expressions.map((e: Record<string, unknown>) => ({
      latex: String(e.latex || ''),
      color: String(e.color || '#2d70b3'),
      style: (['solid', 'dashed', 'dotted'].includes(String(e.style)) ? String(e.style) : 'solid') as 'solid' | 'dashed' | 'dotted',
      hidden: Boolean(e.hidden),
    })).filter(e => e.latex.length > 0),
    xRange: validateRange(r.xRange, [-10, 10]),
    yRange: validateRange(r.yRange, [-10, 10]),
    points: Array.isArray(r.points) ? r.points.map((p: Record<string, unknown>) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      label: p.label ? String(p.label) : undefined,
    })) : [],
    annotations: Array.isArray(r.annotations) ? r.annotations.map(String) : [],
    shadedRegions: Array.isArray(r.shadedRegions) ? r.shadedRegions.map((sr: Record<string, unknown>) => ({
      vertices: Array.isArray(sr.vertices) ? sr.vertices.map(String) : [],
      color: String(sr.color || 'yellow'),
    })) : undefined,
    segments: Array.isArray(r.segments) ? r.segments.map((s: unknown[]) =>
      [String(s[0] || ''), String(s[1] || '')] as [string, string]
    ) : undefined,
  };
}

function validateGeometryRendering(r: Record<string, unknown>): GeometryRendering | null {
  const result: GeometryRendering = {
    type: 'geometry',
    latex: String(r.latex || ''),
    svg: r.svg ? String(r.svg) : undefined,
    vertices: Array.isArray(r.vertices) ? r.vertices.map((v: Record<string, unknown>) => ({
      label: String(v.label || ''),
      x: Number(v.x) || 0,
      y: Number(v.y) || 0,
    })) : [],
    segments: Array.isArray(r.segments) ? r.segments.map((s: unknown[]) => [String(s[0]), String(s[1])] as [string, string]) : [],
    angles: Array.isArray(r.angles) ? r.angles.map((a: Record<string, unknown>) => ({
      vertex: String(a.vertex || ''),
      value: String(a.value || ''),
    })) : [],
    lengths: Array.isArray(r.lengths) ? r.lengths.map((l: Record<string, unknown>) => ({
      from: String(l.from || ''),
      to: String(l.to || ''),
      value: String(l.value || ''),
    })) : [],
  };

  // 점선/보조선
  if (Array.isArray(r.dashedSegments)) {
    result.dashedSegments = r.dashedSegments.map((s: unknown[]) => [String(s[0]), String(s[1])] as [string, string]);
  }

  // 음영 영역
  if (Array.isArray(r.shadedRegions)) {
    result.shadedRegions = r.shadedRegions
      .filter((s: Record<string, unknown>) => Array.isArray(s.vertices))
      .map((s: Record<string, unknown>) => ({
        vertices: (s.vertices as unknown[]).map(String),
        color: String(s.color || 'yellow'),
      }));
  }

  // 직각 표시
  if (Array.isArray(r.rightAngles)) {
    result.rightAngles = r.rightAngles.map(String);
  }

  // 원
  if (Array.isArray(r.circles)) {
    result.circles = r.circles.map((c: Record<string, unknown>) => ({
      center: String(c.center || ''),
      radius: Number(c.radius) || 1,
      style: (c.style === 'dashed' ? 'dashed' : 'solid') as 'solid' | 'dashed',
    }));
  }

  return result;
}

function validateTableRendering(r: Record<string, unknown>): TableRendering | null {
  return {
    type: 'table',
    latex: String(r.latex || ''),
    headers: Array.isArray(r.headers) ? r.headers.map(String).map(cleanTableCell) : [],
    rows: Array.isArray(r.rows) ? r.rows.map((row: unknown[]) => Array.isArray(row) ? row.map(String).map(cleanTableCell) : []) : [],
  };
}

/**
 * 테이블 셀 정리: 낙서/손글씨로 오인된 문자를 빈 문자열로 변환
 * GPT-4o가 손글씨를 "p", "β", "B" 등으로 인식하는 경우 처리
 */
function cleanTableCell(cell: string): string {
  const trimmed = cell.trim();
  // 단독 그리스 문자 (낙서 오인 가능성 높음)
  if (/^[αβγδεζηθικλμνξοπρστυφχψω]$/i.test(trimmed)) {
    return '';
  }
  // LaTeX 형식 그리스 문자
  if (/^\\?(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/i.test(trimmed)) {
    return '';
  }
  // 손글씨로 흔히 오인되는 단독 Latin 문자: p, P, B, D, q, Q, d, l, I, O
  // (숫자도 아니고, 일반적인 수학 변수 a,b,c,k,x,y,f 등이 아닌 단독 문자)
  if (/^[pPqQlIOoruRU]$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function validateDiagramRendering(r: Record<string, unknown>, figureType: 'number_line' | 'diagram'): DiagramRendering | null {
  return {
    type: figureType,
    latex: String(r.latex || ''),
    description: String(r.description || ''),
  };
}

function validateRange(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const min = Number(value[0]);
    const max = Number(value[1]);
    if (!isNaN(min) && !isNaN(max) && min < max) {
      return [min, max];
    }
  }
  return fallback;
}

// ============================================================================
// Fallback
// ============================================================================

function createFallbackFigure(imageUrl: string, reason: string): InterpretedFigure {
  return {
    figureType: 'photo',
    description: `원본 이미지 (해석 실패: ${reason})`,
    originalImageUrl: imageUrl,
    rendering: null,
    confidence: 0,
  };
}
