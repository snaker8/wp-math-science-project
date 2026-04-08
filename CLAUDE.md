# 과사람 수학프로그램 (Suzag-Litecore)

## 프로젝트 개요
학원장·강사·학생을 위한 **수학 문제은행 + LMS** 웹 플랫폼.
HWP/PDF 업로드 → OCR(Mathpix) → AI 분류(GPT-4o) → 문제은행 저장 → 시험지 출제/처방 학습.

## 기술 스택
| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14.1, React 18.2, TypeScript 5.3 |
| DB/Auth | Supabase (PostgreSQL + Auth + Storage) |
| 에디터 | TipTap 2.2 (리치텍스트), KaTeX 0.16 (수식 렌더링) |
| PDF | PDF.js 4.0 (렌더링), jsPDF (생성), html2canvas |
| OCR | Mathpix API (수식 포함 수학 문제 인식) |
| AI | OpenAI GPT-4o (문제 분류/분석) |
| 스타일 | Tailwind CSS 3.4, 다크 테마 기본 (zinc/black) |
| 차트 | Recharts 3.7 |
| 아이콘 | Lucide React |
| 애니메이션 | Framer Motion 12 |

## 핵심 디렉토리
```
src/
├── app/
│   ├── dashboard/         ← 강사/원장 대시보드 (메인 작업 영역)
│   │   ├── cloud/         ← 클라우드 업로드 워크플로우
│   │   ├── workflow/      ← PDF 분석 워크플로우
│   │   ├── exam-management/ ← 시험 관리
│   │   ├── repository/    ← 문제은행
│   │   └── ...
│   ├── student/           ← 학생 페이지
│   ├── api/               ← API Routes (Next.js)
│   │   ├── workflow/upload/  ← 업로드 + OCR 처리
│   │   └── problems/        ← 문제 CRUD
│   └── auth/              ← 인증 (Supabase Auth)
├── lib/
│   ├── workflow/
│   │   └── cloud-flow.ts  ← ★ OCR 클라우드 워크플로우 핵심 로직
│   ├── ocr/
│   │   └── question-parser.ts ← ★ 문제 번호 인식/파싱 로직
│   ├── supabase/          ← Supabase 클라이언트
│   └── pdf/               ← PDF 유틸리티
├── components/            ← 공통 React 컴포넌트
├── hooks/                 ← 커스텀 훅
├── config/                ← 네비게이션, 앱 설정
└── types/                 ← TypeScript 타입 정의
```

## 개발 명령어
```bash
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npx tsc --noEmit     # 타입 체크
npm run db:generate  # Supabase 타입 생성
npm run db:push      # DB 스키마 푸시
```

## OCR 워크플로우 파이프라인
```
PDF 업로드 → Mathpix OCR (페이지별) → lines.json 파싱
→ groupLinesIntoQuestions() [cloud-flow.ts]  ← 라인 → 문제 그룹화
→ question-parser.ts                         ← 문제 번호/내용/선택지 추출
→ GPT-4o 분류 (단원/유형/난이도)
→ Supabase problems 테이블 저장
```

### 문제 번호 인식 패턴 (핵심)
- `01.`, `1)`, `1번`, `[1]` — 접미사 형식
- `01 다음` — 숫자+공백+한글
- `**01**`, `\textbf{01}` — Mathpix MMD 볼드 형식
- `03`, `1` — 단독 숫자 라인 (줄 끝까지 숫자만)
- 유효 범위: 1~30번

## 코딩 컨벤션
- **커밋**: Conventional Commits, 한국어 (`fix: 문제 번호 인식 패턴 개선`)
- **브랜치**: `claude/[worktree명]` 또는 `main`
- **스타일**: Tailwind CSS, 다크 테마 (bg-zinc-900, text-white 계열)
- **컴포넌트**: React FC + TypeScript, 'use client' 디렉티브 사용
- **API**: Next.js Route Handlers (app/api/)
- **DB 접근**: supabaseAdmin (서버) / createClient (클라이언트)

## 참고 문서
- `PLAN.md` — PDF 문제 분석 페이지 구현 계획 (6단계)
- `PROJECT_SPEC.md` — 전체 프로젝트 기획서

---

## 현재 작업 상태

### 완료됨
- **3,000 세부유형 분류 체계 확장 + Supabase DB 적재**
  - `scripts/expansion-v4-*.ts` — V4 확장 데이터 (3,045개 총 적재)
  - `curriculum_data/seed_expanded_types*.sql` — SQL 시드 파일
  - `scripts/apply-seed-to-supabase.ts` — Supabase 자동 시딩 스크립트
  - `src/config/navigation.ts` — '3,000 세부유형' 표시 업데이트
- **GPT 분류 → expanded_math_types 연동**
  - `src/lib/workflow/cloud-flow.ts` — CLASSIFICATION_PROMPT에 유효 DOMAIN 코드 추가
  - `src/app/api/workflow/upload/route.ts` — `matchExpandedTypeCode()` 함수 추가,
    `classifications.expanded_type_code` 자동 채우기
- **PDF 분석 3패널 UI + 연관 API 모두 구현** (PLAN.md 전체 완료)
  - `src/app/dashboard/workflow/analyze/[jobId]/page.tsx` — 3패널 분석 페이지
  - `src/components/editor/LaTeXInputModal.tsx` — LaTeX 수식 입력 모달
  - `src/components/workflow/AnalyzeProblemEditModal.tsx` — 문제 편집 모달
  - `src/app/api/workflow/detect-problems/route.ts` — AI 문제 영역 감지
  - `src/app/api/problems/[problemId]/reanalyze/route.ts` — 개별 재분석
- **유사문제 인라인 표시 UI**
  - `src/app/dashboard/cloud/[examId]/page.tsx` — Sparkles 클릭 시 카드 하단에 인라인으로 유사문제 생성/표시 (InlineTwinPanel)
- **ProblemSelectorProvider + SimilarProblemProvider 구현**
  - (이전 세션 완료)
- **OCR 문제 번호 인식 개선** (`src/lib/workflow/cloud-flow.ts`)
  - 단독 숫자 라인("03", "3") 매칭 + 범위 검증(1~30)

- **수학비서(mathsecr) 분류 체계 적용** (2026-04-09)
  - `mathsecr_complete.json` — 수학비서 전체 분류 트리 (18과목, 19,423 leaf 유형)
  - Supabase `mathsecr_types` 테이블 — 22,785행 시딩 완료
  - `scripts/seed-mathsecr-types.ts` — 시딩 스크립트
  - `src/lib/workflow/mathsecr-prompt.ts` — 과목별 소단원 테이블 빌더 (JSON import)
  - `src/lib/workflow/cloud-flow.ts` — CLASSIFICATION_PROMPT에 {MATHSECR_TYPES} 동적 주입
  - `src/app/api/exams/[examId]/auto-fix/route.ts` — 수학비서 유형 테이블 기반 재분류
  - `src/app/api/problems/[problemId]/reanalyze/route.ts` — 수학비서 코드 사용
  - typeCode 형식: `MS07-01-03-02` (MS + 과목코드 + 대단원 + 중단원 + 소단원)
- **로그인 복구 + 도식 추출 수정** (2026-04-08~09)
  - `@supabase/ssr` 0.1.0→0.10.0 업데이트
  - `src/lib/supabase/middleware.ts` — getAuthUser 버그 수정
  - `src/lib/image-pipeline/client.ts` — extract-local 엔드포인트 (파일 경로 전달 방식)
  - `image-pipeline/server.py` — /extract-local 엔드포인트 추가
  - `src/lib/workflow/cloud-flow.ts` — 해설 검산(verification) 프롬프트 추가
- **과학 과목 코드 2022 개정** — PHY1/PHY2 → PHY, PHY_ME 등
- **UI 수정** — 보기 박스 헤더 제거, f(1) 선택지 오인식 수정, 업로드 팝업 리사이징

### 다음 할 일 (우선순위)
- ★ **시험지 출제 기능** — 문제은행에서 단원/유형/난이도 필터 → 문제 선택 → 시험지 생성 → PDF 출력
  - 수학비서 참조: 유형기준 탭(단원·유형 트리 + 난이도 1~10 필터), 시험지 목록(난이도 분포 표시)
  - 우리 구현: 과목 선택 → 수학비서 트리에서 단원/유형 필터 → 문제 검색 → 선택 → 시험지 편성 → PDF
- 수학비서 자동매핑 테스트 (MS 코드로 분류되는지 확인)
- 처방 학습 페이지 연동

### 참조 사이트
- **수학비서** (mathsecr.com) — 분류 체계 참조 (200만 문제 검증된 트리 구조)
  - 상단 메뉴: 내신시험지, 수학비서INDEX, 수학B서점, 학생관리, 포스트지오, 즐겨찾기, 내문제지, 나만의DB
  - 내신시험지 4탭: 학교시험 / 유형기준 / 특정문항기준 / 출처기준
  - 출제 플로우: 유형기준 탭 → 단원·유형·난이도 필터 → 문제 검색 → 선택 → 시험지 편성 → PDF/한글 다운
- **수작** (suzag) — UI/UX 참조
- 참조 사이트 디자인: 라이트 테마 (warm 색상), 우리: 다크 테마 (zinc/black)
