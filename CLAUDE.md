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

## ★ 안전 가드 — 다시 깨지면 안 되는 핵심 (2026-04-28 학습)
> 모두 사용자가 같은 사고를 여러 번 만난 영역. 코드 변경 시 git log 로 해당 가드가 살아있는지 먼저 확인할 것.

### 1. 자산화 안전 — exam INSERT 실패 시 problems 강행 금지
- 위치: `src/app/api/workflow/upload/route.ts` saveEditedProblemsDirect / saveProblemsToDB
- 가드: `examId` null 이면 즉시 abort (problems 루프 진입 X). orphan 차단.
- 가드: exam INSERT 직전 `title + institute_id + book_group_id + deleted_at IS NULL` DB 중복 차단. in-memory `autoSavedExams` 만 의존 X.
- 사고 이력: 신도중·동백중·동해중·해운대중 2-1/3-1 자산화 누락·중복 반복 (a8d5b57).

### 2. 배점 추출 우선순위 — `[총 N점]` > `[Ni점]` 합 > 단일 > null
- 위치: `saveEditedProblemsDirect.extractedPoints`, `parseSubQuestions`
- 정규식: `[\[(]\s*총\s*(\d+(?:\.\d+)?)\s*점\s*[\])]` (총 우선) / `[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]` (일반)
- 첫 매치만 잡으면 "[총 5점] ... [2점]" 본문이 2점으로 들어가는 사고 (신도중 [서·논술형 4]).
- clean-latex stripping 도 `[\[(]\s*(?:총\s*)?\d+...` 로 [총] optional 매치 → [총 N점]·[N점] 모두 본문 텍스트에서 제거.
- **소문제 패턴 (parseSubQuestions)** 은 3가지 분기 모두 살아있어야 함:
  1. `[서·논술형 N-M]` 대괄호 nested (신도중)
  2. **라인 시작 `N-M.`** (동백중 — 헤더는 단일 번호, 본문 5-1./5-2./5-3.) ← 17b06d6
  3. `(1)(2)(3)` 본문 + 서술형 키워드 / choices 배열
  분기 누락 시 SubQuestionTable 자체 미표시 → 사용자 입력 수단 사라짐.

### 3. 객관식 답은 ①~⑤ 만 신뢰
- 위치: `src/app/api/problems/[problemId]/generate-solution/route.ts` 객관식 fail 분기
- 가드: `userIsValidCircled ? userEnteredAnswer : ''` — ①~⑤ 외 값("0", "5", "5번") 은 빈값으로 폐기.
- 절대 `userEnteredAnswer || ''` 처럼 모호한 값 보존 X — 영구 박힘 사고 (102a39e).

### 4. 카드 배점 배지 위치 폴백 3단
- 위치: ProblemCardView splitAtQuestion + FigureMarkerRenderer splitAtQuestion (둘 다)
- 순서: `?` → 첫 `\n` 직전(서답형 헤더 끝) → 텍스트 끝.
- 두 함수 동시 패치 필수 — 한쪽만 고치면 도형 마커 카드(신도중 [서·논술형 6·7])에서 배지 안 보임 (0360d4c).

### 5. Vercel fire-and-forget chain 신뢰 X
- 사용자 트리거 일괄 작업(일괄해설 등)은 **클라이언트 sequential** 호출로 — `for-of` + AbortController(295s) + 1회 retry + 300ms 호흡.
- server-side `fetch(... { keepalive: true })` chain 은 인스턴스 종료 시 끊김 (신도중 22·23번 sweep 실패 사고).
- 클라이언트 단점: 페이지 떠나면 중단. 대신 누락 0 (2a31563).

### 6. exams.created_by NOT NULL 폴백 — 쿠키 세션 유저 필수
- 위치: `src/app/api/workflow/upload/route.ts` `saveEditedProblemsDirect` + `saveProblemsToDB` 둘 다.
- 가드: `job.userId` 가 UUID 가 아니면 (`'anonymous'` 같은 문자열 박힘) → `createSupabaseServerClient().auth.getUser()` 로 쿠키 세션 유저 폴백.
- 비로그인이면 여전히 null → 후속 orphan 가드(#1)가 abort.
- 사고 이력: Storage 복원 경로(line 538) 가 비로그인 시 'anonymous' hint 박아서 자산화 시 `null value in column "created_by"` (PG 23502) 로 실패 (b552a8e). 다중 배포 사이클 시 빈번.
- **두 함수 동시 패치 필수** — 한쪽만 막으면 results 채워진 경로 통과 못 함.

### 7. 배점 추출 클라이언트·서버 동기화 — 같은 우선순위 ([총 N점] > 합산 > 단일)
- 위치 (서버): `saveEditedProblemsDirect.extractedPoints` (#2 가드 참고)
- 위치 (클라): `src/app/dashboard/workflow/analyze/[jobId]/page.tsx` `removeChoicesFromContent`
- 가드: 두 곳 모두 동일 우선순위 — `[총 N점]` > 다수 [Ni점] 합산 > 단일 [N점] > undefined.
- 클라가 첫 매치만 잡으면 `score=3` 박힌 채 서버로 전송 → 서버는 client 값 우선이라 `[총 6점]` 검사 스킵 → 잘못된 배점.
- 정규식 양쪽 통일: `[\[(]\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*[점졈졍]\s*[\])]` (대괄호·소괄호 모두 + OCR 오타 점/졈/졍).
- 사고 이력: 사직여중 중2-1 서답형 자산화 배점이 매번 첫 [3점] 으로 들어가 사용자가 수동 수정 (1ba79ff).

### 8. Multi-tenancy 격리 — 격리 대상 테이블은 institute-guard 통과 필수
- 격리 대상 테이블: `exams`, `problems`, `classes`, `class_enrollments`, `book_groups`, `source_files`, `users`, `diagnostics.*`
- 공통 풀 테이블 (`institute_id IS NULL` = 모두 접근): `problems`, `book_groups`
- 위치: `src/lib/security/institute-guard.ts`
- **가드**: `supabaseAdmin.from('<격리 대상>')` 호출 시 항상 `applyInstituteFilter(query, scope)` 또는 `assertInstituteAccess(scope, instituteId)` 적용.
- **사용 패턴**:
  ```ts
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  // SELECT — 격리 필터
  const q = supabaseAdmin.from('exams').select('*');
  const { data } = await applyInstituteFilter(q, scope);

  // ID 접근 가드
  const { data: exam } = await supabaseAdmin.from('exams').select('institute_id, ...').eq('id', examId).single();
  assertInstituteAccess(scope, exam.institute_id); // throw if forbidden

  // INSERT
  const instId = resolveInsertInstituteId(scope, payload.institute_id);
  ```
- **공통 풀 옵션**: `applyInstituteFilter(q, scope, { allowCommonPool: true })` — problems / book_groups
- **권한 계층**:
  - super_admin (auth metadata `super_admin=true`) → 모든 institute
  - ORG_ADMIN (`users.role='ORG_ADMIN'` + `organization_id`) → 학원 산하 모든 institute
  - 일반 user → 자기 institute 만
- **service_role bypass 주의**: `supabaseAdmin` 은 RLS 우회 → 앱 레벨 가드 안 걸면 cross-tenant 누수.
- 신규 API route 작성 시 격리 대상 테이블 접근하면 무조건 institute-guard 사용.
- 사고 학습: PR-5 audit (2026-05-04) — 25+개 파일 누락 발견 (현재 institute 1개라 leak 0이지만 PR-6 마이그레이션 후 현실화 예정).

### 9. 객관식 보기 ↔ 본문 분리 + "동그라미=무조건 객관식 아님" (2026-06-02 학습, PR #262·#263)
> 객관식 보기(①②③④⑤)가 `content_latex`(본문)·`answer_json.choices` 양쪽에 저장돼 카드/시험지/인쇄에서 보기가 **두 번** 노출되던 사고. 두 레이어로 방어.
- **★ 핵심 함정**: "동그라미가 있다고 다 객관식이 아니다." 서술형 풀이단계/조건/라벨도 ①②③ 사용 (예: `<조건> ① 양변을 나눈다 … ⑤ 제곱근을 구한다`). **무조건 본문에서 제거하면 서술형 풀이단계가 통째로 소실**됨 (실데이터로 입증).
- **1차 (자산화)** — `src/lib/workflow/cloud-flow.ts` `buildQuestionResult`:
  - 그룹화가 `①②③` 라인을 `lines`·`choiceTexts` 양쪽에 넣어, 본문(`contentMmd = group.lines 전체`)에 보기가 박힘. → 객관식이면 본문에서 보기 라인 제외.
  - **서술형 신호 가드**: `[서답형]`/`[서술형]`/`[논술]`/`<조건>` 헤더 **+** `쓰시오/구하시오/작성하시오/서술하시오/증명하시오/풀이 과정` 등 명령형 → 있으면 **본문 제거 안 함**. (헤더 빠진 서술형도 명령형으로 잡음. 배점 `\d+점` 은 객관식에도 흔해 신호 제외.)
  - **"동그라미로 시작" 가드**: 보기로 판정된 라인이라도 줄 시작이 `①②③` 일 때만 제거 → 문장 *중간* `①`(그림 라벨 등)은 보존.
  - choices 추출/`type` 결정 로직은 **불변** — 이 가드는 "본문 제거" 만 게이트.
- **2차 (렌더 안전망)** — `src/hooks/useExamProblems.ts` `stripTrailingInlineChoices`:
  - `hasDbChoices` 일 때, **본문 끝 블록이 `dbChoices` 와 정규화 일치(과반)** 할 때만 제거. 비보기 `①②③`(그림 라벨·서술형 단계)은 절대 안 건드림. 기존 1971건·OCR 엣지 표시 커버.
  - 서답형(`type==='short_answer'`)이면 본문 `①②③` 를 보기로 추출 X (4fb518c — 서답형 단계 보호).
- **3차 (재OCR "텍스트 다시 읽기")** — `src/lib/ocr/extract-choices-from-ocr.ts` `extractChoicesFromOCR` (2026-06-30 회귀, 장전중 25-3-1 #4):
  - 원형 `①②③④⑤` 분기(branch 1)는 branch 2·3 `(1)~(5)`/`1)~5)` 의 "5지선다 가드"(318b19f)를 **혼자 못 받아** 무가드로 남아 있었음. `①~⑤에 들어갈 내용` 빈칸채우기 본문의 `\boxed{①}~\boxed{⑤}` placeholder 를 전부 보기로 잡아 본문을 토막낸 garbage choices 저장 → `handleReadText` 가 정상 보기를 덮어씀.
  - 가드: (1) `\boxed{...}` 안 동그라미 제외, (2) 진짜 보기 = **"마지막 증가 런" 이 ①부터 시작 + 길이 ≥4** 일 때만 인정 (스템참조·`①과 ②`·산발 배제). 확정 못하면 `[]` → 호출측이 기존 보기 보존(손실 0).
  - 회귀 테스트: `extract-choices-from-ocr.test.ts` (장전중 #4 → [] + 정상 5지선다/스템참조/(5)병합 통과).
- **가드 원칙**: 오탐(객관식→서술형)은 "본문 제거만 안 함" → **데이터 손실 0** + 렌더넷 커버. 미탐(서술형→객관식)이 본문 삭제 사고이므로 **신호는 넉넉하게 잡아 안전쪽**으로 기운다.
- `cloud-flow.ts`(보기 판정·content 생성)·`useExamProblems.ts`(추출·strip)·`extract-choices-from-ocr.ts`(재OCR 보기추출) 건드릴 때 위 가드 살아있는지 git log 확인 필수. **"동그라미가 보기로 잡혀 본문이 보기로 새는" 클래스는 이 3곳 모두에서 재발 이력 있음.**

### 학습 저장 위치
- DB: `figure_corrections` (도형 교정 diff), `latex_render_corrections` (LaTeX 수정 diff)
- 메모리: `~/.claude/projects/.../memory/feedback_*.md` (5개 파일 인덱스 MEMORY.md 참조)

---

## 현재 작업 상태

### 완료됨
- **Multi-Tenancy 격리 (계층 구조: 학원 → 센터, 2026-05-04)**
  - 매쓰플랫 모델 — 공통 문제풀 + 학원별 독립 운영
  - `organizations` (학원) 테이블 신설, `institutes`(센터) 에 `organization_id` 추가
  - role enum 에 `ORG_ADMIN` 추가 (학원 산하 모든 센터 통합 관리)
  - 권한 helper: `is_super_admin()`, `get_my_organization_id()`, `can_access_institute(uuid)`
  - 8개 RLS 정책에 `can_access_institute` 적용 (exams, problems, classes, book_groups, source_files, classifications, users)
  - diagnostics 4개 테이블 + class_enrollments 에 `institute_id` 컬럼 (트리거 자동 복사)
  - `src/lib/security/institute-guard.ts` — 헬퍼 모듈 (`getUserAccessScope`, `applyInstituteFilter`, `assertInstituteAccess`, `assertExamAccess`, `assertProblemAccess`, `resolveInsertInstituteId`)
  - 27개 API route 패치 (admin/exams/problems/book-groups/sessions) — institute-guard 적용
  - **운영 데이터 마이그레이션** — "과사람" organization + "본부" institute (id 보존)
  - snaker → super_admin (auth metadata), icegimbab17 → ORG_ADMIN
  - problems 1971건 → NULL (공통풀 통합)
  - 어드민 UI: `/admin/institutes` (학원/센터 관리), `/admin/users` (사용자 배정) — super_admin 만
  - 검증 스크립트: `scripts/verify-multitenancy.sql` (24개 항목)
  - 참조: [PLAN_MULTITENANCY.md](PLAN_MULTITENANCY.md), [PLAN_MULTITENANCY_AUDIT.md](PLAN_MULTITENANCY_AUDIT.md)
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
  - typeCode 형식: `MS07-01-03-02-05` (MS + 과목코드 + 대단원 + 중단원 + 소단원 + 세부유형, 5-세그먼트)
  - 일부 노드는 세부유형이 없어 4-세그먼트 `MS07-01-03-02`로 끝남 → 파서는 양쪽 다 처리해야 함
- **로그인 복구 + 도식 추출 수정** (2026-04-08~09)
  - `@supabase/ssr` 0.1.0→0.10.0 업데이트
  - `src/lib/supabase/middleware.ts` — getAuthUser 버그 수정
  - `src/lib/image-pipeline/client.ts` — extract-local 엔드포인트 (파일 경로 전달 방식)
  - `image-pipeline/server.py` — /extract-local 엔드포인트 추가
  - `src/lib/workflow/cloud-flow.ts` — 해설 검산(verification) 프롬프트 추가
- **과학 과목 코드 2022 개정** — PHY1/PHY2 → PHY, PHY_ME 등
- **UI 수정** — 보기 박스 헤더 제거, f(1) 선택지 오인식 수정, 업로드 팝업 리사이징

- **학생 진단(diagnostics) 시스템 통합** (2026-04-23, 진행 중, 수학비서 기반 v2)
  - `supabase/migrations/20260423_001_diagnostics_schema.sql` — 별도 `diagnostics` 스키마: sessions / items / student_node_status / prerequisites / lesson_plans 5개 테이블. items·status·prereqs·plans 모두 `mathsecr_code TEXT` 컬럼으로 `public.mathsecr_types.code` 참조 (소프트 FK)
  - 별도 `curriculum_nodes` 테이블 없음 — **수학비서 22,785행이 단원 마스터 역할**
  - 히트맵 뷰 `v_student_mathsecr_heatmap` — 학생 × 과목(학년·학기) × 대단원(level1) 집계
  - 트리거 `trg_refresh_status_on_item` — items INSERT/UPDATE/DELETE 시 student_node_status 자동 갱신 (α≥80 / β 60~79 / γ<60)
  - 재귀 함수 `trace_weakness_chain(student_id, root_code)` — prerequisites 테이블 따라 최대 depth 5까지 선수 체인 탐색. 테이블 초기엔 비어있음 (수동 큐레이션 대상)
  - `src/app/dashboard/prescription/entry/page.tsx` — 담임 진단 결과 입력 폼. **수학비서 계층 드롭다운(과목→대단원→중단원→소단원→세부유형)**. 깊게 선택할수록 정밀. 25/8/11/7문항 기본값
  - `src/app/dashboard/prescription/lib/queries.ts` — `supabaseBrowser.schema('diagnostics')`로 diagnostics 스키마 접근, `public` 스키마로 mathsecr_types 직접 조회
  - 세션 타입 코드: `BS`=광역스캔(1회차), `DD`=정밀진단(2회차), `PT`=선수추적(3회차), `SC`=재원생 스팟체크
  - 오답 원인 5종 태그: 개념 / 유형 / 계산 / 문장제 / 시간
  - `.claude/commands/bs-scan.md`, `dd-dive.md`, `pt-trace.md` — 매쓰플랫 자동화 슬래시 커맨드 (Claude for Chrome 필요)
  - 참조 폴더 `개별맞춤학생프로젝트/` — 웹 챗 설계 원본(curriculum_nodes 58 버전), git 추적 제외 대상
  - 다음 단계: Phase 2에서 `/dashboard/prescription/page.tsx` 하이브리드 재구성 (수학비서 대단원 히트맵 + 단원 리스트 + 진단 이력 주입)

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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
