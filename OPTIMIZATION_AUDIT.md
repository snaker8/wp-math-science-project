# 성능·정리 진단 보고서 (Phase 1)
*2026-04-29 · 정적 분석 기반 · 코드 변경 없음*

---

## TL;DR

**주요 발견**:
1. **자산화 30문제** = 약 **201 DB awaited + 150 Storage awaited** 호출 — Storage 업로드가 60~120초 단일 병목
2. **분석 일괄(handleBatchAnalyze)** = 직렬이라 30T초 — 3~5개 동시성으로 **80% 단축 가능**
3. **`analyzePageBlocks()` 400줄+ 완전 dead code** (import 0회) — 즉시 삭제 안전
4. **`ProblemCardView` 1000줄+** 분리 시 analyze 페이지 5000줄 → 3000줄 미만 (HMR·빌드 가속)
5. **Console.log 30문제 처리당 300~400개** 출력 — 60~70% 정리 가능
6. **DB 안티패턴** — `.in() + 1000` 사고는 이미 차단됨, `match-answers` 의 N+1 (50문제 × 2 = 100쿼리) 만 새로 발견

**즉시 효과 큰 변경 우선순위 (Phase 2/3 후보)**:
1. Storage 업로드 Promise.all 병렬화 → **자산화 60초 절감 추정**
2. 일괄 분석 동시성 3~5 → **분석 25T초 절감 추정**
3. `analyzePageBlocks` 삭제 + setColumnMode/setCropSensitivity 정리 → 안전 정리
4. 핫패스 console.log 정리 → 노이즈 제거

---

## 1. 자산화 (`/api/workflow/upload` PUT)

### 1.1 30문제 기준 직렬 호출 카운트

`saveEditedProblemsDirect` 경로 ([upload/route.ts:1107-1567](src/app/api/workflow/upload/route.ts)):

| 단계 | 호출 수 | 위치 |
|------|---------|------|
| Exam 중복 확인 | 1 | line 1240-1249 |
| Institute/User 조회 | 2 | line 1188-1227 |
| Exam INSERT (재시도 포함) | 1~3 | line 1299-1322 |
| 문제당 Problems INSERT | 1 × N | line 1408-1444 |
| 문제당 Classifications INSERT | 1 × N | line 1453 |
| 문제당 Exam_problems INSERT | 1 × N | line 1495 |
| 문제당 Detection_annotations DELETE+INSERT | 2 × N | line 1515-1516 |
| 문제당 Storage 업로드 (1~5 image) | 1~5 × N | line 1146-1171, 1378-1406 |

**합계**: 6~8 awaited × 30 + 6 = **약 201 DB awaited**, **150 Storage awaited**

### 1.2 병목 추정 순위

| 순위 | 단계 | 추정 시간 (30문제) | 근거 |
|------|------|-----------------|------|
| 🔥 1 | Storage 업로드 (crop/figure) | 60~120초 | 150 RTT × 평균 500ms |
| 🔥 2 | Problems INSERT 30회 | 15~25초 | JSONB ai_analysis 큰 페이로드 |
| 🟢 3 | Institute/User + Exam 생성 | 5~8초 | 중복 조회 + 재시도 |

### 1.3 배치화 가능성

| 단계 | 가능 | 이유 |
|------|------|------|
| Storage 업로드 | ✅ Promise.all | 외래키 의존성 없음 — 가장 큰 효과 |
| Classifications INSERT | ✅ bulk insert(array) | examId 만 필요, problemId 도 함께 |
| Exam_problems INSERT | ✅ bulk insert(array) | 동일 |
| Detection_annotations | ✅ bulk insert(array) | 동일 |
| Problems INSERT | ⚠️ 부분 가능 | examId 의존 — Exam 후 30개 한 번에 가능하지만 cropImage 별도 |
| Exam INSERT | ❌ 단일 | institute_id 조회 필수 선행 |

### 1.4 명백한 비효율

- **Institute 중복 조회**: `saveEditedProblemsDirect` + `saveProblemsToDB` 가 동일 로직 2회 정의 (line 1188-1200 / 1644-1659) — 함수 추출 후보
- **Page 이미지 순차 업로드** ([line 451-489](src/app/api/workflow/upload/route.ts#L451)): K개 이미지 K번 await — Promise.all 가능
- **Crop 이미지 순차 업로드** (line 717-746, 1146-1171): 30 × 1~5 = 최대 150 await — 병렬화 핵심

---

## 2. 분석 (`/api/workflow/reanalyze-crop`, detect-problems-yolo, generate-solution)

### 2.1 endpoint 별 외부 호출 수

| Endpoint | 호출 수 | 비고 |
|----------|--------|------|
| `reanalyze-crop` | 3~5 | Mathpix + Vision graph 병렬, GPT-4o refine 0~1, classification 1, Storage 0~1 |
| `detect-problems-yolo` | 2 | YOLO health + detect (실패 시 GPT-4o 폴백 1회) |
| `detect-problems` | 1~3 | GPT-4o + retry |
| `generate-solution` | 3~5 | DB 3회 + Claude Sonnet + Opus 폴백 + Gemini 검증 |
| `reanalyze` (개별) | 4~5 | DB 3 + reanalyze-crop 호출 + classification |

### 2.2 병렬화

**이미 병렬**:
- `reanalyze-crop` 의 Mathpix + Vision graph (Promise.all, line 341)

**잠재 후보**:
- `generate-solution` 의 분류·확장유형·시험과목 3 DB 쿼리 (line 54-74) — Promise.all 통합 가능
- 클라이언트 `handleBatchAnalyze` 의 30문제 직렬 → 3~5개 동시성

### 2.3 일괄 분석 동시성 효과

| 모드 | 30문제 시간 추정 |
|------|-----------------|
| 현재 (직렬) | 30T (T = 문제당 ~5~10초) |
| 동시성 3 | ~10T |
| 동시성 5 | ~6T |

**위험**: API rate limit, 토큰 한계. **권장**: 동시성 3 부터 시작 + AbortController.

### 2.4 불필요한 작업

- `correctOcrTypos` 결과를 응답에 안 쓰지만 매번 호출 (line 365)
- `generate-solution` 의 3 DB 쿼리 → 단일 join 가능

---

## 3. DB 쿼리 안티패턴

### 3.1 `.in() + 1000+ limit` 위험

**해결됨** ✅:
- `src/app/api/exams/route.ts` (line 43-66) — PAGE=1000 수동 페이지네이션 적용 (CLAUDE.md 가드 #6)

**중간 위험**:
- `src/app/api/problems/search/route.ts:43` — `.limit(2000)` hard limit, 운영 데이터 증가 시 검토
- `src/app/api/analytics/heatmap/route.ts:91-111` — limit 없음, 데이터량 따라 위험

### 3.2 N+1 패턴

**명백한 N+1**:
- `src/app/api/exams/[examId]/match-answers/route.ts:261-305`
  - 루프 안 `.select().eq('id', match.problemId).single()` × 50문제 × 2 = 100 RTT
  - 사용자 트리거 단발성이라 영향 작지만 개선 여지

**경량 N+1**:
- `src/app/api/exams/[examId]/auto-fix/route.ts:219-228`
  - typeCode 별 mathsecr_types 개별 조회 (50회 추가)

### 3.3 인덱스 후보

| 테이블 | 컬럼 | 빈도 | 우선순위 |
|--------|------|------|---------|
| `exams` | `book_group_id`, `subject`, `exam_type`, `grade` | 매우 빈번 | High |
| `exam_problems` | `(exam_id, problem_id)` 복합 | 빈번 | Med |
| `classifications` | `(problem_id, type_code)` 복합 | 빈번 | Med |
| `problems` | `institute_id` + `status` | 빈번 | Med |

DB 직접 확인은 별도 작업 (`pg_indexes` 조회 필요).

### 3.4 보안·일관성

- **모든 API routes에서 `supabaseAdmin` 사용** — 일관성 OK
- 클라이언트는 `createSupabaseServerClient()` (SSR) — 패턴 명확

---

## 4. Dead Code · 정리 후보

### 4.1 즉시 삭제 안전

| 항목 | 위치 | 영향 |
|------|------|------|
| `analyzePageBlocks()` (단일 영역 검출) | `src/lib/pdf/auto-crop.ts:52-414` (~400줄) | import 0회. `analyzePageBlocksSplit` 만 사용 — **즉시 제거 가능** |
| `setColumnMode`, `setCropSensitivity` | analyze page line 2587-2588 | 픽셀 UI 제거 후 호출 0회 — **state 자체는 유지** (폴백에서 사용), 미사용 setter 만 제거 |
| `runMathpixOcrBboxDetection` 콜백 | analyze page line 2713 | 호출 0회 (자동 비활성화) — 검토 후 결정 |
| `convertedPdfStore` 초기화 | cloud-flow.ts:109 | get/set 호출 0회 |

### 4.2 컴포넌트 분리 (`analyze/[jobId]/page.tsx` 5000줄 → 3000줄)

| 컴포넌트 | 라인 | 크기 | 우선순위 |
|----------|------|------|---------|
| `ProblemCardView` | 1530-2650 | ~1000줄+ | 🔥 1 |
| `DraggingCropArea` | 620-900 | ~280줄 | 🔥 2 |
| `SinglePageView` | 1080-1230 | ~150줄 | Med |
| `usePdfRenderer` 훅 추출 | 2820-3050 | ~200줄 | Med |
| `useAutoDetection` 훅 추출 | 다수 영역 | ~150줄 | Med |
| `handleSaveAll` 별도 함수 | 3225-3410 | ~180줄 | Low |

**효과**: 빌드 시간·HMR 속도·가독성 모두 개선. 동작 변경 X.

### 4.3 함수 통합 후보

- `analyzePageBlocks` 와 `analyzePageBlocksSplit` (auto-crop.ts) — 후자만 유지 + 전자 삭제
- Institute 조회 로직 — `saveEditedProblemsDirect` + `saveProblemsToDB` 공통 헬퍼로

### 4.4 Legacy 분기 유지

명확하게 의도된 비활성화 영역은 유지:
- `// AutoCrop 모드 on/off (기본 OFF → 수동 선택 우선)` (line 2685)
- `// ★ 자동 시작 비활성화됨 (사용자 요청: 수동 모드)` (line 2711)

---

## 5. Console.log 정리

### 5.1 파일별 카운트

| 파일 | 총 console.* | log | warn | error |
|------|-------------|-----|------|-------|
| `upload/route.ts` | **129** | 70+ | 35+ | 20+ |
| `reanalyze-crop/route.ts` | **44** | 28 | 13 | 3 |
| `analyze/[jobId]/page.tsx` | **85+** | 55+ | 20+ | 10+ |
| `cloud/[examId]/page.tsx` | 51+ | - | - | - |

### 5.2 30문제 자산화 시 예상 출력

- 서버 (reanalyze-crop): ~150 (5/문제)
- 클라이언트 (BatchAnalyze): ~150 (5/문제)
- **총 300~400 로그** — 운영 콘솔 가독성 저해

### 5.3 정리 후보

**제거 (디버그 잔재)**:
- `[★ OCR 디버그]` `window.__lastOcrDebug` 할당 (analyze page:3862) — 메모리 보관, 운영 무용
- `[BatchAnalyze]` OCR 원문/풀이 substring(500) (line 3858-3859) — 노이즈
- `[Reanalyze]` OCR 원문 substring(0, 500) (reanalyze-crop:395)
- `[OcrBbox]` 상세 (analyze page:2510-2578)
- `[ReplaceTable]` 표 교체 디테일 (line 2211, 2263)
- `[DEBUG] displaystyle` substring(0, 300) (line 1961)

**조건부 활성화 (DEBUG_OCR=true 환경변수)**:
- 큰 substring 출력은 환경변수 게이트로

**유지**:
- 모든 `console.error`, `console.warn`
- 단발 상태 전이 (예: `[자산화] 정상 완료: ${savedCount}/${expectedCount}`)
- 분류 결과 요약 (typeName, difficulty)

**예상 효과**: 핫패스 로그 60~70% 감소, 운영 콘솔에 의미있는 정보만.

---

## 6. Phase 2 / Phase 3 진행 후보 (사용자 승인 후)

### Phase 2 — 안전 정리 (회귀 위험 낮음)

| 작업 | 잃는 것 | 효과 |
|------|---------|------|
| `analyzePageBlocks` 삭제 (400줄) | 없음 (호출 0회) | 코드 단순화 |
| `setColumnMode`/`setCropSensitivity` 미사용 setter 제거 (2줄) | 없음 | 정리 |
| `convertedPdfStore` / `runMathpixOcrBboxDetection` 검토·제거 | 검토 필요 | 코드 단순화 |
| 핫패스 console.log 정리 | 디버그 가시성 (필요 시 복구) | 60~70% 노이즈 ↓ |
| `window.__lastOcrDebug` 등 메모리 보관 디버그 제거 | 디버그 편의 | 메모리 |
| TS 에러 정리 (line 3180 등) | 없음 | 빌드 안정성 |
| **CLAUDE.md 가드 추가** (#6 created_by, #7 배점 동기화) | 없음 | 규칙 명문화 |

**예상 시간**: 1.5~2시간. **회귀 위험**: 낮음.

### Phase 3 — 구조 최적화 (영향 큼, 단계별 승인)

| 작업 | 잃는 것 | 효과 |
|------|---------|------|
| **Storage 업로드 Promise.all 병렬화** (자산화) | 없음 (외래키 무관) | **🔥 60초 절감 (30문제 기준)** |
| **Exam_problems / Classifications / Detection_annotations 배치 INSERT** | 트랜잭션 의미 변화 (rollback 단위 커짐) | **5~10초 절감** |
| **handleBatchAnalyze 동시성 3~5** | rate limit 위험 (AbortController + retry 필요) | **🔥 25T초 절감** |
| **PDF 페이지 렌더 캐시** (자동검출 2x → 분석 2.5x → figure 4x) | 메모리 사용 ↑ (캔버스 N개) | 1~3초 절감/페이지 |
| **`generate-solution` 3 DB 쿼리 → Promise.all** | 없음 | 미미 |
| **분석 페이지 폴링 백오프** (2초 → idle 5~10초) | 진행률 UI 갱신 지연 | 서버 부하 ↓ |
| **`ProblemCardView` 컴포넌트 분리** | 동작 X, 단순 분리 | 빌드·HMR ↑, 가독성 ↑ |

**예상 시간**: 2.5~3.5시간. **회귀 위험**: 항목별 다름. 각 변경 후 worktree 검증 → 머지 → 사용자 검증 권장.

---

## 7. 즉시 결정 필요한 사항 (사용자 확인)

1. **Phase 2 시작 OK?** — 정리 위주, 위험 작음
2. **Phase 3 우선순위** — 자산화 병렬화 vs 일괄분석 동시성 중 어느 쪽 먼저?
3. **컴포넌트 분리 (`ProblemCardView`)** — 동작 변경 X 지만 큰 패치라 별도 PR 권장 — 진행할지 결정
4. **CLAUDE.md 가드 항목 추가** — 이번 세션 학습(created_by, 배점 동기화) 명문화 OK?
