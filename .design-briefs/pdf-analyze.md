# PDF 분석 3패널 페이지 리디자인 브리프 (Claude Design용)

## 제품 컨텍스트
- **과사람 수학 프로그램** — 한국 학원·학교용 수학 문제은행 + LMS
- 사용자: **학원장 / 강사** (OCR 후 문제 영역 감지·편집)
- 업무: PDF 업로드 → Mathpix OCR → **수동/AI 바운딩박스 감지** → 문제 크롭 → 문제은행 저장
- 현재 페이지: `src/app/dashboard/workflow/analyze/[jobId]/page.tsx` (4,442줄)
- em-management & cloud-exam-editor와 **동일한 Chrome 디자인 시스템** 사용
  (globals.css에 `--chrome-*`, `--brand-indigo-*`, `--paper`, `--ink-*` 전역 정의됨)

## 현재 구조 (유지할 것)
**3패널 레이아웃 (이미 3패널이지만 시각 품질 개선 필요):**
- **좌측**: PDF.js로 렌더한 페이지 썸네일 리스트 (세로 스크롤)
- **중앙**: 선택된 페이지의 PDF 이미지 + **바운딩 박스 오버레이** (드래그로 크롭, 박스 추가·삭제·리사이즈)
- **우측**: 감지된 문제 리스트 + 선택한 문제의 상세(선택지·정답·해설·도형·유형·난이도)
- **상단 헤더**: 파일명 + OCR/이미지 파이프라인 상태 + 진행률 + AI 자동감지 버튼 + 저장 버튼

## 리디자인 목표

### 전체 패턴 — em-shell 그리드 변형
3패널은 유지하되 **각 패널을 Chrome 디자인 시스템으로 재포장**:
```
[ topnav (56px) — 제목 + 상태 배지 + 진행률 + 저장 CTA ]
[ sidebar · viewer · inspector ]
[ 240px    · 1fr    · 420px    ]
```

### 구체 변경 요구사항

#### 1. 상단 Subbar (56~64px)
- **현재**: 좌/중/우 나열된 긴 바 (배경 `bg-black`)
- **변경**:
  - 배경: `chrome-surface`
  - **브레드크럼**: `← 문제 분석 / 파일명.pdf`
  - **과목 뱃지**: 수학(indigo) / 과학(emerald) — 현재 색 유지 (의미 있음)
  - **상태 표시**: OCR 진행 중 / 도식 추출 완료 N개 / AI 감지 중
  - **진행률 미니바**: 상단 subbar 하단 테두리 자리에 2px gradient (indigo → cyan)
  - **주요 액션 아이콘 그룹**:
    - 📐 AI 자동 감지 (indigo)
    - 🔄 재분석 (neutral)
    - 💾 저장 후 클라우드로 (primary indigo CTA)

#### 2. 좌측 페이지 썸네일 사이드바 (240px)
- **현재**: 단순 리스트, 각 페이지 썸네일 + 페이지 번호
- **변경**:
  - 배경: `chrome-surface`
  - 상단 고정 바: 전체 페이지 N개 + 감지 문제 수
  - 각 썸네일 pill:
    - 페이지 번호 (좌상단 뱃지)
    - PDF 썸네일 이미지 (aspect 210:297)
    - 해당 페이지 감지 문제 수 뱃지 (우하단)
    - 이슈 dot (감지 실패/수동 확인 필요)
  - 선택된 페이지: **좌측 indigo 보더** + 그림자
  - 하단: "페이지 추가" / "순서 재정렬" 미니 액션

#### 3. 중앙 PDF 뷰어 (1fr)
- **현재**: PDF 이미지 + canvas 바운딩박스 오버레이
- **변경**:
  - 배경: `chrome-bg` (가장 어둡게)
  - PDF 이미지: paper white 카드에 **드롭 쉐도우** (실물 종이 느낌)
  - 바운딩박스 스타일:
    - 선택 안 됨: `stroke: chrome-border-str`, `fill: transparent`
    - 호버: `stroke: brand-indigo-400`
    - 선택됨: `stroke: brand-indigo-500 (2px)`, `fill: brand-indigo-500/8`, **코너 handle 4개**
    - AI 감지됨(미확인): `stroke: dashed cyan-400`
  - 각 박스 상단: 문제 번호 뱃지 (floating, chrome-card 배경)
  - **하단 툴바 (floating, chrome-card 배경)**:
    - 줌 컨트롤 (25%~200% 슬라이더)
    - 페이지 이동 (← →)
    - 모드 토글 (선택 / 드래그 / 박스 추가 / 박스 삭제)
    - 빈 페이지 표시 토글

#### 4. 우측 Inspector 패널 (420px)
- **현재**: 감지 문제 리스트 + 선택 문제 상세 편집 폼
- **변경**:
  - 배경: `chrome-surface`
  - **상단 탭 (em-management 스타일)**:
    - 📋 감지된 문제 {N}
    - ✏️ 문제 편집 (선택됐을 때만 활성)
    - 🤖 AI 분석 결과
  - **감지 문제 리스트 탭**:
    - 각 문제: 번호 + 축소된 크롭 프리뷰 + 페이지 위치 + 분류 상태 뱃지 (분류됨/미분류/에러)
    - 체크박스로 bulk 액션 가능 (삭제/재분류)
  - **문제 편집 탭**:
    - 아코디언 섹션들:
      - 📝 문제 내용 (TipTap 에디터)
      - 🔢 선택지 (1~5)
      - ✅ 정답 + 해설
      - 📐 도형 (있으면 미니 프리뷰 + 편집 버튼)
      - 🏷️ 분류 (단원 드롭다운 + 난이도 슬라이더 + 인지영역 select)
      - 📸 원본 크롭 이미지
  - 각 섹션 헤더: `text-chrome-fg-4 uppercase tracking-wider text-[10px]`

### 상호작용
- 페이지 썸네일 클릭 → 중앙 뷰어 즉시 전환 + 우측 inspector 해당 페이지 문제 리스트 표시
- 바운딩박스 클릭 → 우측 inspector "문제 편집" 탭 자동 전환
- AI 자동감지 실행 → 전체 진행률 상단 gradient bar + 개별 페이지별 indicator
- 저장 → 우측 하단 큰 CTA "클라우드에 저장" (primary indigo)

### 접근성
- 키보드 네비: ← → (페이지 이동), ↑ ↓ (문제 이동), Tab (박스 선택 순환)
- 바운딩박스 드래그 시 `aria-label` 업데이트
- 단축키 힌트: 상단바 우측에 `?` 아이콘 → 모달

## 반드시 유지
- PDF.js 렌더 로직 (`@/lib/pdf-viewer` — `loadPdfDocument`, `renderPdfPage`)
- 바운딩박스 드래그/리사이즈/추가/삭제 인터랙션
- Mathpix OCR 결과 연결 (`question-parser`, `cloud-flow`)
- AI 자동 감지 (`/api/workflow/detect-problems`)
- 이미지 파이프라인 상태 (`imagePipeline.status`, `extracted_count`, `enhanced_count`)
- 개별 문제 재분석 (`/api/problems/[problemId]/reanalyze`)
- 저장 후 클라우드 이동 (`/dashboard/cloud/[examId]`)
- `ExamProblemRenderer`, `FigureRenderer`, `MixedContentRenderer`, KaTeX

## 디자인 시스템 토큰 (전역)
```
--chrome-bg, --chrome-surface, --chrome-card, --chrome-raised, --chrome-input
--chrome-border, --chrome-border-sub, --chrome-border-str
--chrome-fg-1 ~ --chrome-fg-4
--brand-indigo-300/400/500/600, --brand-cyan-400
--paper, --paper-border, --ink-1~4
--dur-fast, --ease-out-expo
```

Tailwind 유틸: `bg-chrome-surface`, `border-chrome-border`, `text-chrome-fg-2`, 등

## 피할 것
- 전체 밝은 톤 전환 (PDF 뷰어 집중도 떨어짐)
- 바운딩박스 색 여러 개 혼용 (indigo + cyan 외에는 금지)
- 복잡한 애니메이션 (PDF.js 렌더 성능에 영향)
- 우측 패널 > 500px (중앙 뷰어 좁아짐)

## 디자인 레퍼런스
- **Labelbox / CVAT** (바운딩박스 주석 도구)
- **Adobe Acrobat** (PDF 페이지 네비)
- **Figma / Sketch** (좌측 레이어 + 중앙 캔버스 + 우측 인스펙터)
- **exam-management / cloud-exam-editor** (같은 앱, 동일 디자인 시스템)

## 출력 형식
Claude Code 핸드오프 번들. 기존 파일 구조 유지:
- `src/app/dashboard/workflow/analyze/[jobId]/page.tsx`
- PDF.js canvas/SVG 오버레이 재사용
- 기존 모달/에디터(`TipTap`, `LaTeXInputModal`, `AnalyzeProblemEditModal`) 재사용
