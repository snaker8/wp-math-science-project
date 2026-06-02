# PLAN — 출제·QR·자산화·HWP 재설계 (매쓰플랫 모델 / 진단 잠금 해제 → 출제물 공통 라인)

> 작성: 2026-06-01 · 상태: **설계(코드 미착수)** · 원칙: 진단→보고→**승인**→적용, 급하게 X, 운영 진단 라인 백워드 호환 필수
> 근거 캡처: `mathflat-research/` (CDP 9222 실계정 관찰, intercept+abort 로 mutation 무해화). 메모리 `project_qr_assign_redesign.md` 참조.

---

## 0. 한 줄 요약
매쓰플랫은 **모든 출제물(학습지·시험지·진단)을 타입 구분 없이 같은 출제·채점·결과 라인**으로 흘린다. 우리는 그 라인이 **진단평가에 못박혀(`session_type` 잠금)** 일반 시험지/학습지를 못 태운다. 이 잠금을 **백워드 호환으로 풀고**, 검증된 매쓰플랫 구조에 맞춰 **출제 공통화 → QR 인쇄옵션화 → HWP export → 채점 두 라인 통합** 순으로 재설계한다.

---

## 1. 근거 — 매쓰플랫 검증 모델 (3개 캡처)

| # | 엔드포인트 | 핵심 |
|---|-----------|------|
| ① 디지털 문제 | `GET /my-db-problems/by-paper` | `CUSTOM_PAPER{ pages[이미지+bbox], boxes[크롭 + conceptId/topicId/subTopicId + level + sourceProblemId] }`. 표시는 **렌더 PNG**(`…/images/{id}/problem.png`) + 구조화 메타. 본문은 sourceProblemId 마스터 참조. |
| ② 출제 | `POST /student-worksheet` | `{"studentIdList":[…], "worksheetIdList":[…]}` — 학습지↔학생 **다대다 단일 POST, 타입 구분 없음**. |
| ③ HWP/다운로드 | `GET /worksheet/v2/download` | `?worksheetIds&worksheetPdfTypes=ELEMENT,ANSWER_SOLUTION&isMergedPdf&presignedUrlType=PREVIEW\|DOWNLOAD` → `{presignedUrl, fileName}`. HWP는 **"나의 DB로 만든 학습지" 한정** + `hwpDownloaded`/월한도 게이팅. |

**우리에게 유리한 비대칭:** 매쓰플랫 디지털 문제는 **이미지 기반**(본문은 소스문제 참조)인데, **우리 자산화는 structured text/LaTeX/선택지/답을 직접 보유** → HWP export에 오히려 더 적합.

---

## 2. 우리 현재 구조 (앵커)

### 2.1 출제 라인 — 이미 범용에 가깝다
- `POST /api/sessions` ([src/app/api/sessions/route.ts:253](src/app/api/sessions/route.ts#L253)): body `{ exam_id, student_ids[], round_number, session_type, teacher_note }` → exam 격리가드(`assertExamAccess`) → `exam_problems` 순서 → `classifications`(type_code/difficulty) 스냅샷 → **학생별 `diagnostics.print_sessions` INSERT**([route.ts:327~](src/app/api/sessions/route.ts#L327)).
  - → 매쓰플랫 `{studentIdList, worksheetIdList}` 와 거의 동형. 차이: 우리는 **단일 exam × 다수 student**, 매쓰플랫은 다수 worksheet × 다수 student.
  - **이미 임의 exam_id 를 받는다** — 출제 생성 자체는 진단 전용이 아님.

### 2.2 진단 잠금의 실체 (4겹)
1. **DB CHECK** — `diagnostics.print_sessions.session_type TEXT NOT NULL DEFAULT 'BS' CHECK (session_type IN ('BS','DD','PT','SC'))` ([20260424_002_print_sessions_schema.sql:25](supabase/migrations/20260424_002_print_sessions_schema.sql#L25)). 동일 enum 이 `diagnostics.sessions` 에도([20260423_001_diagnostics_schema.sql:30](supabase/migrations/20260423_001_diagnostics_schema.sql#L30)).
2. **앱 화이트리스트** — `VALID_TYPES = ['BS','DD','PT','SC']`, 미일치 시 `'BS'` 강제 ([src/app/api/sessions/route.ts:242,273](src/app/api/sessions/route.ts#L242)).
3. **UI 노출 경로** — 실제 출제는 `/dashboard/grading` "QR 세션 생성" 모달로만. 일반 시험지엔 진입점 없음.
4. **배포 stub 죽음** — `<button title="배포"><Send/></button>` **onClick 없음** ([src/app/dashboard/exam-management/page.tsx:1295](src/app/dashboard/exam-management/page.tsx#L1295)).

### 2.3 QR — 동작은 정상, 종속이 문제
- `session_id → /grade·/answer`, 학생 바인딩 정상(메모리 확인). 단 진단 세션에 묶여 있음.

### 2.4 채점 두 라인 (미통합)
- **A. print_sessions 라인**: QR/인쇄 → `session_problems` / `session_results`(트리거로 print_sessions 완료 동기화 [20260424_002:92~](supabase/migrations/20260424_002_print_sessions_schema.sql#L92)) → 뷰 `v_print_session_progress`.
- **B. diagnostics.sessions 라인**: 엑셀 일괄(`EX`), `items`, A4 리포트.
- 두 라인이 결과/집계를 공유하지 않음 → 통합 대상(Phase 4).

### 2.5 자산화 / 출제물 단위
- 출제물 단위 = `exams` → `exam_problems`(sequence) → `problems`(content/choices/answer/points 구조화). 별도 worksheet 테이블 없음 → **`exams` 가 매쓰플랫 worksheet 역할**.

---

## 3. 재설계 (단계별 · 백워드 호환)

### Phase 1 — 출제 공통 라인 (진단 잠금 해제)
**목표:** 일반 시험지/학습지도 같은 출제 라인으로. 기존 BS/DD/PT/SC 100% 유지.
- **DB**: `session_type` CHECK 에 범용값 추가(예 `'WS'`=학습지, `'EX'`=시험지, `'GE'`=일반) — 기존 4값 그대로 두고 **확장만**. CHECK 교체 마이그레이션은 **운영 트리거/뷰 무영향** 확인 후. (CHECK 제거가 아니라 **IN 목록 확장**.)
- **앱**: `VALID_TYPES` 확장 + 미일치 폴백 정책 유지(범용 기본값은 'GE' 등).
- **UI**: exam-management `배포` stub → **출제 모달 연결**(매쓰플랫 미러: 학년/반 토글 + 학생 다중선택 → `POST /api/sessions`). 기존 grading 경로는 그대로.
- **블래스트 반경**: 신규값 추가뿐 → 기존 진단 경로 불변. 출제 모달은 신규 컴포넌트.
- **잃는 것**: 없음(가산적). 단 session_type 의미가 "진단회차"→"출제물종류"로 넓어짐 → 진단 통계 쿼리가 `session_type IN ('BS','DD','PT','SC')` 로 **명시 필터** 되어 있는지 감사 필요.

### Phase 2 — QR 인쇄 옵션화
**목표:** QR 을 진단 종속에서 떼어 **모든 출제물의 인쇄 옵션**으로(매쓰플랫 `qrAvailable` 모델).
- 인쇄 디자인/옵션에 `qr on/off`. QR 발급 로직(session_id 바인딩)은 재사용, session_type 비종속화.
- **블래스트 반경**: QR 생성/스캔 코어 불변, 호출 지점만 일반화.

### Phase 3 — HWP(HWPX) Export
**목표:** 구조화 출제물 → 한글 파일. 매쓰플랫 패턴(presigned) 차용, **우리 강점(structured content) 활용**.
- 엔드포인트 신설(매쓰플랫 `/worksheet/v2/download` 대응): `GET /api/exams/[examId]/export?format=hwp|pdf&types=problem,answer_solution&merged=true` → presigned/스트림.
- 생성기: `problems.content`(LaTeX) → HWPX. 수식 변환이 난점 → 메모리 [[reference_hwpx_parsing]] 활용, 초기엔 문제지/정답 분리 단순본부터.
- 게이팅: 필요 시 `hwp_downloaded` 추적 + 한도(매쓰플랫처럼). 우리는 자체 호스팅이라 한도 선택.
- **블래스트 반경**: 신규 엔드포인트 — 기존 PDF 경로 무영향.

### Phase 4 — 채점 두 라인 통합 (가장 큰 작업, 마지막)
**목표:** print_sessions(QR/인쇄) ↔ diagnostics.sessions(엑셀/EX) 결과·집계 통합.
- 공통 결과 모델 + 어댑터. 진단 리포트/히트맵 쿼리 보존.
- **블래스트 반경 큼** → Phase 1~3 안정화 후 별도 PLAN 으로 분리 권장.

---

## 4. 리스크 & 가드
- **운영 진단 라인 보호**: 진단평가A/B(각 25문제) 정상([HANDOFF 참조]). Phase 1 CHECK 확장은 **IN 목록 추가만**, 트리거 `calculate_exam_total_points`/`trg_refresh_status_on_item` 무관 확인 후 적용. search_path 따옴표 사고 재발 금지(HANDOFF 경고).
- **격리 가드**: 출제 모달/엔드포인트는 `assertExamAccess` + institute-guard 유지(CLAUDE.md #8).
- **마이그레이션 안전**: CHECK 교체는 신규 마이그레이션 파일로, 운영 적용 전 worktree·로컬 dev(실 Supabase) 검증([[feedback_preview_no_supabase]]).
- **백워드 호환**: 기존 session_type 4값·진단 통계·QR 스캔 전부 불변이 1순위.

---

## 5. 미결정 / 추가 캡처 필요 (Phase 1 착수 전 권장)
1. **채점 INPUT 방식** — 매쓰플랫이 QR스캔(종이) vs 학생앱 디지털풀이 중 무엇인지 미확인. 우리 QR-on-paper 와 다르면 Phase 2 방향 달라짐. (다음 CDP 세션에서 `/lesson/worksheet/grade` 관찰)
2. **HWP 실제 타입/응답** — `worksheetPdfTypes=HWP` 정확값 + 응답(.hwp presigned) 은 나의DB 학습지 必요라 미캡처. Phase 3 생성기 설계 시 참고용(필수 아님 — 우리 자체 구현).

---

## 6. 사용자 결정 대기 (오픈 퀘스천)
- Phase 1 의 범용 session_type 값 네이밍 (`WS/EX/GE` vs 다른 체계)?
- HWP 한도 정책 둘지(매쓰플랫식) / 무제한?
- Phase 4(채점 통합) 를 이 트랙에 포함 vs 별도 트랙?

**다음 행동: 위 PLAN 검토 → 어느 Phase부터, 어떤 결정으로 갈지 승인 → 그때 코드 착수.** 승인 전 Edit/Write(코드) 없음.
