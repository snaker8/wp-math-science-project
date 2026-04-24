# 과사람수학 Phase 2~4 + QR 채점 시스템 로드맵

> 최종 수정: 2026-04-24
> 목표: 새 세션에서 이 문서를 읽고 바로 다음 작업에 착수할 수 있도록 정리

---

## 🧭 새 세션에서 이어갈 때 — 먼저 이것부터

1. **이 문서 `PHASE2_PLAN.md` 먼저 읽기**
2. `git log --oneline -20` 최근 변경사항 확인
3. 우선순위:
   - (긴급) **매쓰플랫 요금 폭발 원인 규명** — 2026-04-23 오후 ~1M tokens/min 피크. 캐싱 작동 여부 검증
   - (급) **매쓰플랫 BS 진단지 21장 정리** — 부실 2장 재생성, 중복 1개 삭제, 미확인 12장 검증
   - (본 작업) **Phase 2 prescription 재구성** or **Phase 2.5 QR 채점 시스템**
4. 비용 영향 코드 변경 시 **반드시 실측 먼저** (`scripts/test-two-stage-classify.ts` 패턴)

---

## 🟢 Phase 1 완료 (2026-04-23)

### 진단 시스템 (학생 개별 맞춤)

- **위치**: `/dashboard/prescription/entry` + `diagnostics` Supabase 스키마
- **DB**: `supabase/migrations/20260423_001_diagnostics_schema.sql` (5개 테이블 + 트리거 + 뷰 + 재귀함수)
- **작동 원리**: 수학비서(`public.mathsecr_types`) 코드를 진단 단위로 사용
- **세션 타입**: BS(광역) · DD(정밀) · PT(선수추적) · SC(스팟체크)
- **완성도 판정**: α(≥80점) / β(60~79) / γ(<60) — items INSERT 시 자동 갱신
- **오답 원인 태그**: 개념/유형/계산/문장제/시간
- **슬래시 커맨드**: `.claude/commands/bs-scan.md`, `dd-dive.md`, `pt-trace.md` — 매쓰플랫 Chrome 자동화용

### AI 파이프라인 대대적 개선

| 항목 | 변경 | 효과 |
|------|------|-----|
| 분류 모델 | Gemini Flash → Claude Sonnet 4.6 | 정확도 ↑ |
| 분류 구조 | 단일 251K 호출 → **2단계 분할(L1L2 + L3L4)** | 비용 96% ↓ |
| Sonnet 4.6 prefill | 미지원 → 제거 + strict user prompt | 에러 해결 |
| subject 매핑 버그 | "수학II".includes("수학I") → 긴 key 우선 정렬 | 정확도 |
| 선택지 오염 방어 | 자산화·재분석 양 경로에 14개 패턴 | 본문 조각 자동 복구 |
| MISMATCH 오탐 제거 | `answersMatch` 느슨한 매칭 | Opus 불필요 호출 ↓ |
| 프롬프트 캐싱 | 시스템 프롬프트 `cache_control` 적용 | 배치 내 90% 할인 |
| 지출 한도 | Anthropic 월 $150 설정 | 영구 안전망 |

### 원격 main HEAD (2026-04-24 기준 `af706e7`)
```
af706e7 fix: reanalyze-crop 선택지 오염 방어
05da0ef fix: 선택지 오염 패턴 강화
166626e fix: resolveSubjectCode 긴 key 우선 매칭
3a9d2cb fix: 분류 프롬프트 2단계 분할 + prefill 제거
1d7b2e8 fix: Claude 분류 응답 잘림 + subject/chapter DB 자동 채우기
f8a1421 fix: Sonnet 자체 검산 MISMATCH 오탐 제거
52a9775 fix: 선택지 오인식 방어 (question-parser.ts)
2733c49 chore: reanalyze-crop 로그 메시지 GPT→AI
ba30625 feat: analyzeProblemWithLLM Claude Sonnet 전환 + GPT-4o 중복 제거
590e832 feat: Claude 프롬프트 캐싱 전면 적용 + Claude 분류 전환
d048580 feat: 학생 진단 시스템 Phase 1 — 수학비서 분류 기반 입력 폼
```

---

## 🟠 매쓰플랫 BS 진단지 21장 (2026-04-23) — 검증 미완

21장 설계:
- 학년별 신규생 범위 스펙 → 매쓰플랫 대단원 체크 자동화
- 중3만 2015개정 (22개정 미적용), 나머지는 22개정
- 각 학년당 R1/R2/R3 (난이도 점증)

| 상태 | 수 | 리스트 |
|------|----|--------|
| ✅ 양호 | 7 | BS_M1_R2/R3, BS_M2S1_R1/R2/R3, BS_M2S2_R2/R3 |
| ❌ **부실** | 2 | **BS_M1_R1** (소인수분해만), **BS_M2S2_R1** (소인수분해만) |
| ⚠️ **중복** | 1 | **BS_C2_R1** (2개 존재, 1개 수동 삭제 필요) |
| ❓ 미확인 | 12 | BS_M3_R1~R3, BS_C1_R1~R3, BS_C2_R2/R3, BS_DS_R1~R3 |
| 참고 | 1 | BS_M2_TEST001_R1_260423 (테스트본) |

**데이터 파일**: [exports/diagnostic_worksheets_bs.csv](exports/diagnostic_worksheets_bs.csv)

### 다음 처리
- BS_M1_R1, BS_M2S2_R1 삭제 후 재생성 (매쓰플랫 수동 권장)
- BS_C2_R1 중복 1개 삭제
- 미확인 12장 PDF 미리보기로 범위 검증

---

## 🔴 긴급: 매쓰플랫 요금 폭발 원인 (2026-04-23 오후)

**증상**: Anthropic Sonnet 4.6 — 12오후 ~1M tokens/min 피크 (평소 0 수준)
**컨텍스트**: 자산화 15문제, 분류를 Sonnet으로 전환, 캐싱 프롬프트 적용 후

**원인 후보:**
1. `cache_control` 위치 오류 — 이미지/동적 부분이 캐시 블록 안에 포함
2. 프롬프트에 타임스탬프·UUID 등 동적 값 → 매 호출마다 캐시 miss
3. Sonnet 캐시 적용 최소 토큰(1024) 미만 → 캐시 안 걸림
4. cache_control을 user 메시지 끝에만 → 시스템 프롬프트 미캐시

**조사 순서 (다음 세션):**
1. `src/lib/claude/cache.ts` + `src/lib/workflow/classify.ts` + `cloud-flow.ts` 코드 리뷰
2. 실제 요청 payload 로그 확인 (토큰 수, cache_control 위치)
3. `scripts/test-two-stage-classify.ts` 재실행 → 캐시 히트율 측정
4. Anthropic 대시보드의 "Cache Hit Rate" 차트 확인

---

## 🟡 Phase 2 — prescription 메인 하이브리드 재구성 (4~5시간)

### 목표
`/dashboard/prescription/page.tsx`는 mock UI만 30% 완성. 재구성:
- **좌 사이드바**: mockStudents → `users WHERE role='STUDENT' AND institute_id=<현재교사>`
- **Radar 차트**: mockRadarData → `diagnostics.v_student_error_profile` (5원인 분포)
- **5칸 히트맵**: mockHeatmapData → **30셀 학년×대영역 히트맵** (`v_student_mathsecr_heatmap`)
- **진단 이력 섹션**: 신규 (`diagnostics.sessions` 목록)
- **단원별 최신 상태 리스트**: 신규 (`student_node_status` + `mathsecr_types` JOIN)
- **처방 경고 카드**: hardcode → `trace_weakness_chain()` 함수 호출
- **Quick Actions 버튼**: UI 유지, onClick 실기능은 Phase 3으로

### 작업 단위
- [ ] `/api/users/students/route.ts` 신설
- [ ] `/dashboard/prescription/page.tsx` 전면 재작성
  - [ ] 학생 드롭다운 실 데이터
  - [ ] Radar 차트 `v_student_error_profile`
  - [ ] 30셀 히트맵 `v_student_mathsecr_heatmap`
  - [ ] 단원별 상태 리스트
  - [ ] 진단 이력 테이블
  - [ ] 처방 경고 카드 `trace_weakness_chain` 연동
- [ ] 색상: α=emerald-500, β=amber-500, γ=red-500, unknown=zinc-700 (다크)
- [ ] Framer Motion 호버 애니메이션 유지
- [ ] 타입 체크 + 커밋

### 연관 파일
```
src/app/dashboard/prescription/page.tsx                  ← 핵심 수정
src/app/dashboard/prescription/entry/page.tsx            ← 완성
src/app/dashboard/prescription/lib/queries.ts            ← 쿼리 추가
src/app/api/users/students/route.ts                      ← 신설
src/components/analytics/Heatmap.tsx                     ← 재사용
```

### 데이터 소스
- `public.users`, `diagnostics.sessions`, `student_node_status`
- `diagnostics.v_student_mathsecr_heatmap`, `v_student_error_profile`
- `diagnostics.trace_weakness_chain(student_id, root_code)`
- `public.mathsecr_types`

---

## 🟣 Phase 2.5 — QR 채점 시스템 구축 (2~3일) ⭐

### 배경
Phase 1 진단 시스템 + 매쓰플랫 PDF 배포 + 학생 세션 추적의 결합.
**QR 채점 = 세션 기반 + 학생별 고유 URL + 모바일 채점 페이지**

### 아키텍처 — 세션 기반

```
session = { student_id + exam_id + round_number }
           ↓ 1:1 QR
학생별 고유 URL: /grade/[session_id]
```

### DB 스키마 신규 (Phase 1 diagnostics 확장)

```sql
create table diagnostics.print_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.users(id),
  exam_id uuid references public.exams(id),
  round_number int not null default 1,
  session_type text,         -- 'BS_광역스캔', 'DD_정밀', 'PT_선수추적'
  issued_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes int,
  teacher_note text
);

create table diagnostics.session_problems (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references diagnostics.print_sessions(id) on delete cascade,
  problem_id uuid references public.problems(id),
  sequence_number int,
  type_code_snapshot text,   -- MS07-... 출제 시점
  difficulty_snapshot int    -- 1~10 스냅샷
);

create table diagnostics.session_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references diagnostics.print_sessions(id) on delete cascade,
  problem_id uuid references public.problems(id),
  sequence_number int,
  is_correct boolean,
  error_cause text,          -- '개념'|'유형'|'계산'|'문장제'|'시간'
  teacher_note text,
  graded_at timestamptz default now()
);
```

### 워크플로우

```
[1] 매쓰플랫에서 학습지 PDF 생성 (BS_M1_R1 등)
[2] 우리 프로그램에 PDF 업로드 → 자산화 → exam_id 확보
[3] 자동 분류 → classifications.expanded_type_code (MS 코드)
[4] 대시보드: "학생 N명 × 회차" 선택 → print_sessions N개 일괄 생성
     + session_problems 각 25문항 (type_code/difficulty 스냅샷)
[5] 학생별 강사용 PDF 재출력 ★핵심★:
     - 상단: 학생 이름 + 회차 + QR (session_id 인코딩)
     - 각 문항 옆: [MS07-02-01 | ★4] 라벨 + O/X 체크란
[6] 학생 풀이 → 강사가 QR 스캔 or 모바일 페이지 직접 열기
[7] /grade/[session_id] 25문항 O/X 탭 (MS 코드 이미 매핑됨)
[8] session_results INSERT → 트리거로 diagnostics.items/student_node_status 자동 갱신
[9] 유형별 정답률·α/β/γ 자동 집계 → prescription 페이지 반영
[10] R2/R3 편성 시 "R1 오답 유형" 자동 추출 (trace_weakness_chain)
```

### 강사용 PDF 구조

```
┌─────────────────────────────────────────────┐
│  BS_M1_R1  |  학생: 김수학  |  QR [■]        │
├─────────────────────────────────────────────┤
│  1. (문제 내용)           [MS07-01-02 | ★4]  │  O □ X □
│  ─────                                      │
│  2. (문제 내용)           [MS07-02-01 | ★3]  │  O □ X □
│  ...                                        │
│  25. (문제 내용)          [MS09-03-02 | ★6]  │  O □ X □
└─────────────────────────────────────────────┘
```

### PDF 두 버전 (추천: B)
- **A. 단일 버전**: 모든 라벨 인쇄 (학생 눈에는 "번호판" 수준)
- **B. 이중 버전**: 학생용(라벨 없음) + 강사용(라벨·O/X 박스 있음)

### 구현 단계

| Phase | 시간 | 내용 |
|-------|------|------|
| 1 | 3h | DB 스키마 + API (`/api/sessions`, `/api/session-results`, `/api/session-problems`) |
| 2 | 2h | 대시보드 "학생별 세션 일괄 생성" UI (prescription 페이지에 버튼) |
| 3 | 3h | 강사용 PDF `/api/sessions/[id]/pdf?variant=teacher` (QR + MS 코드 + O/X 박스) |
| 4 | 3~4h | 모바일 채점 페이지 `/grade/[session_id]` (반응형 25문항 탭) |
| 5 | 2h | 학생용 PDF `/api/sessions/[id]/pdf?variant=student` (라벨 제거) |
| 6 | 1d | session_results → items INSERT 트리거 검증 + prescription 실시간 반영 |
| 7 | 1~2d | (선택) OMR 자동 인식 (답안지 촬영 → GPT-4V/Gemini 채점) |

### 차별화 (매쓰플랫·매쓰홀릭 대비)

- 수학비서 **MS 코드 + 1~10 난이도**로 유형별 정확도 훨씬 세밀
- **3,045개 세부유형** 기반 취약점 진단
- **AI 재분석 루프** 기존 구축 (`/api/problems/[id]/reanalyze`)
- **trace_weakness_chain** 재귀 함수로 자동 처방 추출

### 구현 시 생성/수정 파일
```
supabase/migrations/20260424_002_print_sessions_schema.sql  ← 신규
src/app/api/sessions/route.ts                               ← 신규 (POST 세션 생성)
src/app/api/sessions/[id]/route.ts                          ← 신규 (GET 세션 상세)
src/app/api/sessions/[id]/pdf/route.ts                      ← 신규 (강사용/학생용 PDF)
src/app/api/session-results/route.ts                        ← 신규 (POST 채점 저장)
src/app/grade/[session_id]/page.tsx                         ← 신규 (모바일 채점 UI)
src/app/dashboard/prescription/page.tsx                     ← "세션 생성" 버튼 추가
src/lib/qr/generator.ts                                     ← 신규 (qrcode 패키지)
src/lib/pdf/session-renderer.ts                             ← 신규 (jsPDF + KaTeX)
```

### 필요 패키지
```bash
npm install qrcode
# jsPDF + html2canvas 기존 설치됨
```

---

## 🟡 Phase 3 — 매쓰플랫 자동화 + Quick Actions 실기능 (1주)

### 3.1 매쓰플랫 자동화 재개
- Claude for Chrome 확장 (v1.0.36+)
- 매쓰플랫 로그인 유지
- `.claude/commands/bs-scan.md`·`dd-dive.md`·`pt-trace.md` 존재
- **2026-04-23 이슈 반영**: 체크박스 누락 방지를 위한 검증 단계 추가
- 첫 실행 시 DOM 확인 → 프롬프트 튜닝 필요할 수도

### 3.2 Quick Actions 실기능
- "맞춤형 학습지 출력" → `/bs-scan` 트리거 or 매쓰플랫 API + 우리 자산화
- "학부모 리포트 전송" → `/parent/report?studentId=X` 이메일 발송

### 3.3 /tutor/analytics · /tutor/grading · /parent/report 실 데이터 연결
- 모두 mock UI. Phase 2 prescription과 동일 데이터 소스 활용

---

## 🟡 Phase 4 — 남은 정리 (1~2일)

- `/tutor/clinic` (20% 완성) → γ 단원 기반 Twin 문제 생성 연결
- `/dashboard/prescription/analytics` → 상세 분석 페이지
- `/dashboard/exam-analysis` → 시험 단위 분석 (빈 디렉토리)
- **편집 모달 난이도 UI 수학비서 1~10 체계로 통일**
  - 현재: 상/중상/중/중하/하 5단계 버튼 (UI만 5단계, DB는 1~10 숫자 정상 저장)
  - 개선: 1~10 슬라이더 또는 숫자 드롭다운, "6 (중상)" 병기 표시
  - 대상 파일: `src/components/workflow/AnalyzeProblemEditModal.tsx` 또는 유사 편집 모달
- **구간정의함수(piecewise) LaTeX 자동 교정** ⚠️ 반복 이슈, 미해결
  - 재현: `f(x)={x^3+ax (x≥1), bx^2+4 (x<1)}` → Mathpix가 이렇게 출력:
    ```
    \displaystyle f(x)=\left\{
       x^3 + ax (x ≥ 1)
       bx^2 + 4 (x < 1)
    \displaystyle \right.
    ```
  - 현재 코드: `\displaystyle` 단순 제거만 수행 (reanalyze-crop line 330-331, MixedContentRenderer line 47-50). 단순 제거로는 불충분.
  - 여전히 깨지는 이유:
    1. 줄바꿈이 `\n`이지 `\\`가 아님 (KaTeX 줄바꿈 인식 실패)
    2. 조건 `(x ≥ 1)`이 수식 내부에 텍스트로 섞임 (`\text{}` 래핑 필요)
    3. `\left\{...\right.` 블록 구조 아닌 인라인이라 multi-line 파싱 실패
  - **근본 해결** (1~2시간 전용 작업):
    - 정규식으로 `\displaystyle \left\{ ... \displaystyle \right.` 패턴 전체 매치
    - 각 줄 `식 (조건)` → `식 & \text{if } 조건` 변환
    - 줄 사이를 ` \\\\ `로 결합
    - 전체를 `$$\begin{cases}...\end{cases}$$`로 감쌈
  - 엣지 케이스: `\geq`, 한글 "일 때", 중첩 수식, 조건 괄호 없는 경우
  - 적용 위치: MixedContentRenderer preprocess + OCR 교정 후처리 (양쪽 동시)
  - 메모리 참조: `feedback_katex_rendering.md`, `feedback_mcr_dollar_protection.md`

---

## ⚠️ 기술 부채·알려진 이슈

### 비용 관리 (★중요)
- **월 Anthropic 지출 한도 $150** 설정됨 (초과 시 API 자동 403)
- **2단계 분류**로 자산화 1시험지(15문항) ≈ $0.5 목표
- **2026-04-23 오후 ~1M tokens/min 피크 발생** — 캐싱 작동 검증 필요 (위 "긴급" 섹션)
- 비용 영향 코드 변경 시 **실측 스크립트 먼저**: `scripts/test-two-stage-classify.ts`

### 기존 버그 (미수정)
- `next.config.js`의 `outputFileTracingIncludes`가 Next.js 14 기준 잘못된 위치 (경고만)
- `/dashboard/exam-analysis`: 디렉토리만, `page.tsx` 없음

### 선택지 오염 패턴 (iterative)
- `reanalyze-crop/route.ts`의 `CHOICE_POLLUTION_PATTERNS` 14개
- 새 케이스 나올 때마다 패턴 추가
- 현재 커버: 수식 연산자 조각, 닫는 괄호 시작, "의 값", "구하시오", "(단,", "[N점]", "? [배점]" 등
- **추가 필요 케이스 (2026-04-24 발견):**
  - `^\s*=` — 등호 시작 수식 우변 조각 (예: "= 3, f'")
  - `\\displaystyle|\\lim|\\frac` — LaTeX 명령어로 시작하는 문항 본문 수식 조각
  - `만족시킬|만족하는|만족하도록|만족하기\s*위해` — 조건 서술 키워드
  - **`$...$` 닫히지 않은 수식 조각** (예: `}{x-1}$` 등 수식 조각이 선택지로 흡수)
- 재현: 구간정의함수·극한식 문항에서 분수 여러 줄 쪼개질 때 자주 발생
- 검토: `choices.length > 5` 뿐 아니라 `5` 이상도 뒤 5개가 순수 숫자/수식이면 앞쪽 제거 로직 추가

### 분류 정확도 개선 여지
- Stage 1·2 prompt 튜닝 여지
- 난이도 판정에 추가 힌트 주입 (서술형·배점)

### 해설 finalAnswer 객관식 번호 변환 실패
- 재현: 선택지가 서로 다른 극한식인 문제에서 Claude가 "(1) 12, (2) -2/3, (3) -4" 형식으로 반환
- 로그: `객관식 답 원형숫자 변환 실패 | per_choice_check match=true가 3개 — 모호`
- 시스템은 ①~⑤ 단일 번호 기대, Claude는 선택지별 계산값 나열
- **해결 방향 (둘 중 하나):**
  1. 해설 프롬프트에 "객관식은 반드시 단일 번호로 답" 강제 지시 추가
  2. per_choice_check 모호 시 첫 매치 번호로 자동 변환
- 대상 파일: `src/app/api/problems/[problemId]/generate-solution/route.ts`

---

## 🔑 환경변수

```env
# 분류 모델 (기본 anthropic)
CLASSIFY_PROVIDER=anthropic
CLAUDE_CLASSIFY_MODEL=claude-sonnet-4-6

# 폴백
CLASSIFY_GEMINI_MODEL=gemini-2.5-flash

# 해설 Opus fallback
OPUS_DIFFICULTY_THRESHOLD=10           # 10 = 사실상 비활성
SONNET_TIMEOUT_MS=90000
OPUS_USE_THINKING=0

# Vision
VISION_PROVIDER=gemini
CLAUDE_FIGURE_THINKING=true
CLAUDE_FIGURE_THINKING_BUDGET=4000
```

### 긴급 롤백
분류 고장 or 비용 폭발 시:
```
.env.local:
CLASSIFY_PROVIDER=gemini
```
dev 재시작 → Gemini Flash 복귀 (분류 비용 1/40).

---

## 📂 핵심 파일 맵

### AI 분류·해설 파이프라인
```
src/lib/workflow/
├── classify.ts              ← 공용 분류 (2단계 Claude + Gemini/GPT 폴백)
├── cloud-flow.ts            ← 자산화 핵심
└── mathsecr-prompt.ts       ← buildL1L2Table / buildL3L4Table

src/app/api/workflow/
├── upload/route.ts                 ← PDF 업로드 + 자산화 오케스트레이션
└── reanalyze-crop/route.ts         ← 재분석 (크롭 → OCR → 분류)

src/app/api/exams/[examId]/
├── batch-solutions/route.ts        ← 해설 일괄 생성
├── auto-fix/route.ts               ← 분류 자동 조정
└── distribute-points/route.ts      ← 배점 자동 분배 + 초기화(DELETE)

src/app/api/problems/[problemId]/
├── generate-solution/route.ts      ← 개별 해설 (Sonnet + Opus fallback)
├── reanalyze/route.ts
└── generate-figure/route.ts        ← 도형 (Claude SVG / Gemini Vision)

src/lib/claude/cache.ts        ← cachedSystem / cachedUserContent
src/lib/vision/image-interpreter.ts    ← 도형·SVG Claude 호출
src/lib/ocr/
├── mathpix.ts
└── question-parser.ts        ← parseCircledChoices (오염 방어 적용됨)
```

### 진단 시스템 (Phase 1 완성분 + Phase 2/2.5 확장)
```
supabase/migrations/
├── 20260423_001_diagnostics_schema.sql        ← Phase 1 (완료)
└── 20260424_002_print_sessions_schema.sql     ← Phase 2.5 (신규 예정)

src/app/dashboard/prescription/
├── page.tsx                  ← Phase 2 대상 (mock 30%)
├── entry/page.tsx            ← Phase 1 완성 (채점 입력)
├── analytics/page.tsx        ← Phase 4 대상
└── lib/
    ├── queries.ts
    └── types.ts

src/app/grade/[session_id]/page.tsx     ← Phase 2.5 (신규 예정)
src/app/api/sessions/                    ← Phase 2.5 (신규 예정)
```

### 다크 테마 공용
```
src/app/dashboard/layout.tsx           ← TopNav 자동 상속
src/config/navigation.ts               ← 네비 항목 ("AI처방/CLINIC")
tailwind.config.ts                     ← bg-surface-*, text-content-*
```

### 테스트·검증
```
scripts/test-two-stage-classify.ts    ← 비용·토큰 실측 (실행 시 ~$0.03)
```

### 참고 데이터
```
exports/
├── difficulty_mathsecr.csv              ← 수학비서 난이도 1~10 체계
├── mathsecr_classification.csv          ← 전체 분류 트리 19,423행 (3.5MB)
└── diagnostic_worksheets_bs.csv         ← 2026-04-23 매쓰플랫 21장 매트릭스

scripts/export-classification-csv.ts     ← CSV 재생성 스크립트
```

---

## 🔴 세션 종료 전 체크리스트 (2026-04-23 기준)

- [x] 로컬 main 최신 → origin push 완료 (`af706e7`)
- [x] Vercel 자동 배포 트리거됨
- [x] Anthropic 지출 한도 $150 설정
- [x] 프로덕션 자산화 1건 재테스트 완료
- [ ] **매쓰플랫 BS 진단지 재검증 + 부실 재생성** (내일 사용자 수동)
- [ ] **요금 폭발 원인 규명** (다음 세션 첫 작업)
- [ ] `graphify update .` 실행 (AST 기반 지식 그래프 갱신)
- [ ] `exports/` 및 `scripts/export-classification-csv.ts` 커밋 여부 결정 (`.gitignore` 추가 권장)

---

## 🎯 다음 세션 첫 1시간 플랜

1. 이 문서 훑기 (5분)
2. `git log --oneline -10` + `git status` 확인 (2분)
3. **긴급**: Anthropic 요금 폭발 원인 조사 (30분)
   - `src/lib/claude/cache.ts` 코드 리뷰
   - `src/lib/workflow/classify.ts` cache_control 위치 확인
   - Anthropic 대시보드 "Cache Hit Rate" 확인
   - 필요 시 `scripts/test-two-stage-classify.ts` 재실행
4. 결과 따라 분기:
   - 캐시 정상 → **Phase 2.5 QR 시스템 착수** (DB 마이그레이션부터)
   - 캐시 버그 → 수정 + 실측 + 커밋 후 QR로 이동
5. Phase 2 prescription 재구성은 QR DB 스키마 완성 후 병행
   (QR 시스템이 쓰는 UI도 prescription 페이지)
