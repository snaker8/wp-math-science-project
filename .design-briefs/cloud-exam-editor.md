# 클라우드 시험지 편집 페이지 리디자인 브리프 (Claude Design용)

## 제품 컨텍스트
- **과사람 수학 프로그램** — 한국 학원·학교용 수학 문제은행 + LMS
- 사용자: **학원장 / 강사** (문제 편집·분류·도형 생성)
- 업무: HWP/PDF → OCR된 문제 편집, AI 유사문제 생성, 도형 AI 생성·교체
- 현재 페이지: `src/app/dashboard/cloud/[examId]/page.tsx` (3,250줄)
- em-management 페이지와 **동일한 디자인 시스템** 사용 — Chrome 토큰은 이미 전역화되어 있음
  (globals.css에 `--chrome-*`, `--brand-indigo-*`, `--paper`, `--ink-*` 정의됨)

## 현재 구조 (유지할 것)
- **상단바**: 시험지 제목 + 액션 버튼 그룹 (문제 선택/매핑/통계/추가/펼쳐보기 등 10+ 버튼)
- **필터 바(sticky)**: 난이도 뱃지(5단계) + 인지영역 뱃지(4+1) + 자동수정·도형 배치 버튼
- **메인 grid**: 문제 카드 2~3열 grid, 각 카드에 (난이도뱃지·도메인뱃지·도형상태·AI액션버튼) + 본문 + 메타 + 편집액션
- **편집 모드**: 카드 클릭 시 인라인 편집 (제목/선택지/정답/해설 모두 편집 가능)
- **모달**: 통계 / 빠른답매칭 / 문제추가 / 도식교체 등

## 리디자인 목표

### 전체 패턴 — em-management와 동일한 하이브리드
- **Chrome (상단바/사이드바/툴바)**: **다크** (chrome-bg/chrome-surface)
- **문제 카드**: 기존 다크 유지 (페이퍼 아님 — 편집 페이지는 화면 집중 모드)
- **모달·drawer**: 다크 chrome

### 구체 변경 요구사항

#### 1. 전체 레이아웃 — em-shell 그리드 도입
```
[ topnav (56px) ]
[ sidebar | subbar     | right panel ]
[ 280px   | tabs       | 320px       ]
[         | main       |             ]
```

- **좌측 사이드바 (280px)**: **문제 번호 리스트** (썸네일 pill)
  - 각 pill: 문제번호 + 난이도 mini-bar + 도형 아이콘 + 이슈 dot
  - 클릭 시 해당 문제로 스크롤 + 하이라이트
  - 상단에 검색 + "새 문제 추가" 버튼
  - **섹션 구분**: "전체 20문제" / "이슈 3건" / "선택됨 N개"

- **상단 Subbar**:
  - 브레드크럼(← 시험지 목록 > 시험지 제목)
  - 편집 가능한 제목
  - **액션 아이콘 그룹** (DropdownMenu 활용):
    - 📊 통계 | ➕ 문제 추가 | 📑 빠른답매칭 | 🔄 자동매핑 | 📤 내보내기
  - 우측: 인쇄/편집완료 큰 CTA

- **탭 (em-management와 동일 스타일)**:
  - 펼쳐보기(20) / 시험지(20) / 빠른정답(1) / 해설지(20)
  - 카운트 배지 + 미완성 경고점

- **메인 (content-dependent)**:
  - 펼쳐보기 모드: 2~3열 grid의 문제 카드 (현재 유지 + 스타일 통일)
  - 시험지/빠른정답/해설지 모드: A4 프리뷰 (em-management와 동일)

- **우측 옵션 패널 (320px)**:
  - **필터 섹션**:
    - 난이도 필터 (5단계 체크박스, 원래 색 유지 — 의미 있음)
    - 인지영역 필터 (4+1 체크박스)
  - **뷰 옵션**:
    - 클린/원본 렌더 토글
    - 열 수 (1/2/3열 grid)
    - 카드 크기 슬라이더
  - **AI 도구 그룹**:
    - 도형 일괄 업스케일 (진행률 표시)
    - AI 도형 일괄 생성 (진행률 표시)
    - 전체 해설 재생성
  - **내보내기 큰 CTA**

### 구체 디자인 가이드

#### 문제 카드 (ProblemCardView)
- **기존 색상 구분 유지** (의미 있음):
  - 난이도: 5단계 color scale (최하→최상 blue→green→yellow→orange→red)
  - 인지영역: 4개 category color (계산/이해/추론/문제해결)
  - **원본 있음** 뱃지: violet (도형 상태 시그널)
  - **AI 생성** 버튼: orange (위험한 AI 액션)
  - **도식 교체** 버튼: teal (다른 DB 액션)
  - **원본사용** 버튼: violet (복구 액션)
- **변경할 것**:
  - 카드 border: `border-subtle` → `border-chrome-border-sub`
  - 카드 배경: `bg-surface-card/80` → `bg-chrome-card`
  - hover: `hover:border-accent/30` → `hover:border-chrome-border hover:bg-chrome-raised/50`
  - 카드 radius: `rounded-xl` 유지
  - 카드 그림자: 선택 시 `shadow-lg shadow-brand-indigo-500/10` 추가
  - 편집 모드 활성화: 외곽에 노란 테두리 + 배경 미세 변화

#### 상단 액션 버튼 (10+ 버튼)
- **기능적 색상 코딩 유지** (사용자가 중요하다고 확인):
  - 문제 추가: blue (생성)
  - 빠른답/해설: amber (답안/중요)
  - 자동수정: emerald (AI 실행)
  - 펼쳐보기 active: indigo (모드)
  - AI 도형 생성: orange (AI 위험)
- **개선**:
  - 버튼 높이/padding 통일 (`px-3 py-2`)
  - border opacity 정리 (`border-{color}-500/30` → `border-chrome-border`)
  - 배경 opacity 통일 (`bg-{color}-500/10`)
  - inactive 기본 상태: chrome-card + chrome-fg-2

#### 필터 바
- 상단 sticky bar 배경: `bg-chrome-surface/90` + `backdrop-blur-md`
- 필터 섹션 라벨("난이도", "인지"): `text-chrome-fg-4 uppercase tracking-wider text-[10px]`
- FilterBadge 컴포넌트 색상: **기존 유지** (난이도/영역별 의미 색)
- 구분선: `border-chrome-border-sub`

#### 좌측 문제 썸네일 사이드바 (신규)
- 배경: `bg-chrome-surface`
- 각 pill:
  ```
  ┌─────────────────────────┐
  │ 문제 1 [쉬움][계산] 🎨 · │ ← 기본
  └─────────────────────────┘
  ┌─────────────────────────┐
  │ ▮ 문제 2 [보통][이해]   │ ← 선택 (indigo left border)
  │   "다음 중 ..."          │
  └─────────────────────────┘
  ```
- **이슈 dot**: 빨간 점 (답 없음/분류 없음/중복 등)
- 드래그 핸들로 순서 재정렬 가능

### 상호작용 개선
- **문제 선택 모드** 진입 시: 좌측 사이드바에 체크박스 노출 + 하단 bulk 액션 bar
- **펼쳐보기 ↔ A4 프리뷰** 전환 시: 탭 fade + 좌측 사이드바 유지
- **편집 모드** 토글 시: 카드 border 노란색 + background 미세 노란
- **AI 작업 중**: 상단 탭 하단에 진행률 바 + 실시간 N/M 카운트 (em-management와 동일 스타일)

### 접근성
- 탭 키보드 네비게이션
- 모달 포커스 트랩
- 아이콘만 있는 버튼 aria-label

## 반드시 유지
- `ProblemCardView` 컴포넌트 — 문제 편집 로직 + 도형 렌더
- `MixedContentRenderer` (수식/이미지 혼합)
- `FigureRenderer` — 도형 표시
- `DifficultyBadge`, `DomainBadge`, `FilterBadge` — 의미 색상 그대로
- KaTeX 수식 렌더
- 도형 업스케일/AI 생성/교체 API 호출
- 문제 편집 모달 + PATCH API
- 자동수정 API + 유형 자동매핑 API

## 디자인 시스템 토큰 (이미 전역)
```css
--chrome-bg, --chrome-surface, --chrome-card, --chrome-raised, --chrome-input
--chrome-border, --chrome-border-sub, --chrome-border-str
--chrome-fg-1 ~ --chrome-fg-4
--brand-indigo-300/400/500/600, --brand-cyan-400
--paper, --paper-border, --ink-1~4
--dur-fast, --ease-out-expo
```

Tailwind 유틸: `bg-chrome-card`, `border-chrome-border`, `text-chrome-fg-2`, `bg-brand-indigo-500/10`, 등

## 디자인 레퍼런스
- **exam-management** (같은 앱) — 동일 디자인 시스템 사용 중
- Linear (좌측 문제 리스트 사이드바 패턴)
- Notion (페이지 편집 모드 토글)
- Figma (우측 속성 패널)

## 피할 것
- 전체 밝은 톤 전환 (편집 집중 떨어짐)
- 기능적 색상 코딩 제거 (사용자가 명시적으로 가치 있다고 확인)
- 복잡한 애니메이션
- 사이드바 > 400px (편집 영역 좁아짐)

## 출력 형식
Claude Code 핸드오프 번들. 기존 파일 구조 유지:
- `src/app/dashboard/cloud/[examId]/page.tsx`
- `src/components/ui/*` (shadcn)
- 기존 `ProblemCardView`, `MixedContentRenderer`, `FigureRenderer` 재사용
