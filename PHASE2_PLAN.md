# 과사람수학 Phase 2~4 로드맵

> 작성: 2026-04-24 (세션 종료 시 정리본)
> 목표: 새 세션에서 이 문서를 읽고 바로 다음 작업에 착수할 수 있도록 정리

---

## 🟢 지금까지 완료된 것 (Phase 1)

### 진단 시스템 (학생 개별 맞춤)

- **위치**: `/dashboard/prescription/entry` + `diagnostics` Supabase 스키마
- **DB**: `supabase/migrations/20260423_001_diagnostics_schema.sql` (5개 테이블 + 트리거 + 뷰 + 재귀함수)
- **작동 원리**: 수학비서(`public.mathsecr_types`) 코드를 진단 단위로 사용
- **세션 타입**: BS(광역) · DD(정밀) · PT(선수추적) · SC(스팟체크)
- **완성도 판정**: α(≥80점) / β(60~79) / γ(<60) — items INSERT 시 자동 갱신
- **오답 원인 태그**: 개념/유형/계산/문장제/시간
- **슬래시 커맨드**: `.claude/commands/bs-scan.md`, `dd-dive.md`, `pt-trace.md` — 매쓰플랫 Chrome 자동화용

### AI 파이프라인 대대적 개선 (같은 세션에서)

| 항목 | 변경 | 효과 |
|------|------|-----|
| 분류 모델 | Gemini Flash → Claude Sonnet 4.6 | 정확도 ↑ |
| 분류 구조 | 단일 251K 호출 → **2단계 분할(L1L2 + L3L4)** | 비용 96% ↓ |
| Sonnet 4.6 prefill | 미지원임을 뒤늦게 발견 → 제거 + strict user prompt | 에러 해결 |
| subject 매핑 버그 | "수학II".includes("수학I") 매칭 → 긴 key 우선 정렬 | 정확도 |
| 선택지 오염 방어 | 자산화·재분석 양 경로에 14개 패턴 | 본문 조각 자동 복구 |
| MISMATCH 오탐 제거 | `answersMatch` 느슨한 매칭 | Opus 불필요 호출 ↓ |
| 프롬프트 캐싱 | 시스템 프롬프트 `cache_control` 적용 | 배치 내 90% 할인 |
| 지출 한도 | Anthropic 월 $150 설정 | 영구 안전망 |

### 원격 main 최신 커밋 (2026-04-24 기준 HEAD `af706e7`)
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

## 🟡 Phase 2 — prescription 메인 하이브리드 재구성 (예상 4~5시간)

### 목표
지금 `/dashboard/prescription/page.tsx`는 mock UI만 30% 완성 상태. 다음 재구성:
- **좌 사이드바**: mockStudents → `users WHERE role='STUDENT' AND institute_id=<현재교사>` 실 조회
- **Radar 차트**: mockRadarData → `diagnostics.v_student_error_profile` (5원인 분포) 실 데이터
- **5칸 히트맵**: mockHeatmapData → **스타터의 30셀 학년×대영역 히트맵**으로 교체 (`v_student_mathsecr_heatmap` 사용)
- **진단 이력 섹션**: 새로 추가 (`diagnostics.sessions` 목록)
- **단원별 최신 상태 리스트**: 새로 추가 (`diagnostics.student_node_status` + `mathsecr_types` JOIN)
- **처방 경고 카드**: "삼각함수 오답률 상승" hardcode → `trace_weakness_chain()` 함수 호출해 실제 γ 단원
- **Quick Actions 버튼**: "맞춤형 학습지 출력", "학부모 리포트 전송" — **UI는 유지**, onClick 실기능은 Phase 3으로

### 작업 단위
- [ ] `/api/users/students/route.ts` 신설 — 학생 목록 API
- [ ] `/dashboard/prescription/page.tsx` 전면 재작성
  - [ ] 학생 드롭다운 실 데이터 연결
  - [ ] Radar 차트 `v_student_error_profile` 조회
  - [ ] 30셀 히트맵 `v_student_mathsecr_heatmap` 조회 (6학기 × 대단원)
  - [ ] 단원별 상태 리스트
  - [ ] 진단 이력 테이블
  - [ ] 처방 경고 카드 trace_weakness_chain 연동
- [ ] 색상 체계: α=emerald-500, β=amber-500, γ=red-500, unknown=zinc-700 (다크 테마 유지)
- [ ] Framer Motion 호버 애니메이션 유지
- [ ] 타입 체크 + 로컬 테스트 + 커밋

### 연관 파일
```
src/app/dashboard/prescription/page.tsx                  ← 핵심 수정
src/app/dashboard/prescription/entry/page.tsx            ← 이미 완성
src/app/dashboard/prescription/lib/queries.ts            ← 필요 시 쿼리 추가
src/app/dashboard/prescription/lib/types.ts              ← 완료
src/app/api/users/students/route.ts                      ← 신설
src/components/analytics/Heatmap.tsx (549줄)             ← 재사용 가능 (props 맞추면)
```

### 데이터 소스
- `public.users`: 학생 목록
- `diagnostics.sessions`: 진단 세션 이력
- `diagnostics.student_node_status`: 단원별 최신 α/β/γ 상태
- `diagnostics.v_student_mathsecr_heatmap`: 학생 × 과목 × 대단원 집계
- `diagnostics.v_student_error_profile`: 5원인 분포
- `diagnostics.trace_weakness_chain(student_id, root_code)`: 약점 체인 탐색
- `public.mathsecr_types`: typeCode → full_path/대단원 등

---

## 🟡 Phase 3 — 매쓰플랫 자동화 + Quick Actions 실기능 (예상 1주)

### 3.1 매쓰플랫 자동화
- Claude for Chrome 확장 설치 (v1.0.36+)
- 사용자 매쓰플랫 로그인 상태 유지
- `.claude/commands/bs-scan.md`·`dd-dive.md`·`pt-trace.md` 이미 존재
- 첫 실행 시 DOM 확인 → 프롬프트 튜닝 필요할 수도

### 3.2 Quick Actions 실기능
- "맞춤형 학습지 출력" 버튼 → `/bs-scan` 트리거 또는 매쓰플랫 API 연동
- "학부모 리포트 전송" → `/parent/report?studentId=X` 링크 이메일 발송

### 3.3 /tutor/analytics · /tutor/grading · /parent/report 실 데이터 연결
- 모두 mock UI만 있는 상태. Phase 2의 prescription과 동일 데이터 소스 활용

---

## 🟡 Phase 4 — 남은 정리 (예상 1일)

- `/tutor/clinic` (20% 완성) → γ 단원 기반 Twin 문제 생성 연결
- `/dashboard/prescription/analytics` → 상세 분석 페이지
- `/dashboard/exam-analysis` → 시험 단위 분석 (빈 디렉토리 상태)
- **편집 모달 난이도 UI 수학비서 1~10 체계로 통일**
  - 현재: 상/중상/중/중하/하 5단계 버튼 (UI만 5단계, DB는 1~10 숫자 정상 저장)
  - 개선: 1~10 슬라이더 또는 숫자 드롭다운, "6 (중상)" 병기 표시
  - 대상 파일: `src/components/workflow/AnalyzeProblemEditModal.tsx` 또는 유사 편집 모달
- **구간정의함수(piecewise) LaTeX 자동 교정**
  - 재현: `f(x)={x^3+ax (x≥1), bx^2+4 (x<1)}` → Mathpix가 `\displaystyle f(x)=\left\{\begin{array}...\right.` 로 출력 → KaTeX 렌더 실패
  - 메모리 참조: feedback_katex_rendering.md, feedback_mcr_dollar_protection.md
  - 교정 규칙 추가 위치: `src/lib/ocr/` 또는 OCR 교정 후처리 단계
  - 규칙: `\displaystyle` 제거, `\left\{...\begin{array}...\end{array}\right.` → `\begin{cases}...\end{cases}` 변환

---

## ⚠️ 기술 부채·알려진 이슈

### 비용·비용 관리
- **월 Anthropic 지출 한도 $150** 설정됨 (초과 시 API 자동 403)
- **2단계 분류**가 적용돼서 자산화 1시험지(15문항) ≈ $0.5 수준
- 앞으로도 비용 영향 있는 코드 변경 시 **반드시 실측 스크립트로 토큰 수 확인 후 배포** 원칙
  - 참고: `scripts/test-two-stage-classify.ts`

### 기존 버그 (미수정)
- `next.config.js`의 `outputFileTracingIncludes`가 **Next.js 14 기준 잘못된 위치** (root → `experimental.`로 이동 필요). 경고만 뜸, 기능 영향 미미
- `/dashboard/exam-analysis`: 디렉토리만 있고 `page.tsx` 없음

### 선택지 오염 패턴 (iterative)
- `src/app/api/workflow/reanalyze-crop/route.ts`의 `CHOICE_POLLUTION_PATTERNS`에 14개 패턴 있음
- 새로운 오염 케이스 나올 때마다 패턴 추가하는 구조
- 현재 커버: 수식 연산자 조각, 닫는 괄호 시작, "의 값", "구하시오", "(단,", "[N점]", "? [배점]" 등
- **추가 필요 케이스** (2026-04-24 발견):
  - `^\s*=` — 등호 시작 수식 우변 조각 (예: "= 3, f'")
  - `\\displaystyle|\\lim|\\frac` — LaTeX 명령어로 시작하는 문항 본문 수식 조각
  - `만족시킬|만족하는|만족하도록|만족하기\s*위해` — 조건 서술 키워드
  - **`$...$` 닫히지 않은 수식 조각** (예: `}{x-1}$` 등 수식 조각이 선택지로 흡수된 경우)
- 재현: 구간정의함수·극한식 문항에서 분수 여러 줄 쪼개질 때 자주 발생
- 검토: `choices.length > 5` 뿐 아니라 `5` 이상도 뒤 5개가 순수 숫자/수식이면 앞쪽 제거 로직 추가 여부

### 분류 정확도 개선 여지
- Stage 1·2 prompt 튜닝 여지 있음
- 난이도 판정에 추가 힌트 주입 고려 (서술형·배점 등)

---

## 🔑 중요 환경변수·설정

```env
# 분류 모델 제어 (기본 anthropic)
CLASSIFY_PROVIDER=anthropic            # 'anthropic' | 'gemini' | 'openai'
CLAUDE_CLASSIFY_MODEL=claude-sonnet-4-6

# 폴백용 (그대로 유지)
CLASSIFY_GEMINI_MODEL=gemini-2.5-flash

# 해설 Opus fallback
OPUS_DIFFICULTY_THRESHOLD=10           # 10 = 사실상 비활성
SONNET_TIMEOUT_MS=90000
OPUS_USE_THINKING=0                    # 1이면 Opus thinking 활성

# Vision
VISION_PROVIDER=gemini
CLAUDE_FIGURE_THINKING=true
CLAUDE_FIGURE_THINKING_BUDGET=4000
```

### 긴급 롤백
분류가 고장나거나 비용 치솟으면:
```
.env.local에 한 줄 추가:
CLASSIFY_PROVIDER=gemini
```
dev 서버 재시작 → 즉시 Gemini Flash로 복귀 (분류 비용 1/40).

---

## 📂 핵심 파일 맵

### AI 분류·해설 파이프라인
```
src/lib/workflow/
├── classify.ts              ← 공용 분류 모듈 (2단계 Claude + Gemini/GPT 폴백)
├── cloud-flow.ts            ← 자산화 핵심 (analyzeProblemWithLLM → classify.ts 직행)
└── mathsecr-prompt.ts       ← buildL1L2Table / buildL3L4Table (축소 트리)

src/app/api/
├── workflow/
│   ├── upload/route.ts                 ← PDF 업로드 + 자산화 오케스트레이션
│   └── reanalyze-crop/route.ts         ← 재분석 (크롭 이미지 → OCR → 분류)
├── exams/[examId]/
│   ├── batch-solutions/route.ts        ← 해설 일괄 생성
│   ├── auto-fix/route.ts               ← 분류 자동 조정
│   └── distribute-points/route.ts      ← 배점 자동 분배 + 초기화(DELETE)
└── problems/[problemId]/
    ├── generate-solution/route.ts      ← 개별 해설 생성 (Sonnet + Opus fallback)
    ├── reanalyze/route.ts
    └── generate-figure/route.ts        ← 도형 생성 (Claude SVG / Gemini Vision)

src/lib/claude/cache.ts        ← cachedSystem / cachedUserContent 헬퍼
src/lib/vision/image-interpreter.ts    ← 도형·SVG Claude 호출
src/lib/ocr/
├── mathpix.ts
└── question-parser.ts        ← parseCircledChoices (최초 자산화용, 오염 방어 적용됨)
```

### 진단 시스템
```
supabase/migrations/20260423_001_diagnostics_schema.sql
src/app/dashboard/prescription/
├── page.tsx                  ← Phase 2 대상 (현재 mock 30%)
├── entry/page.tsx            ← 완성 (채점 입력 폼)
├── analytics/page.tsx        ← 상세 분석 (미완)
└── lib/
    ├── queries.ts            ← diagnostics 스키마 쿼리
    └── types.ts              ← DiagnosisSession, StudentNodeStatus 등
```

### 다크 테마 공용
```
src/app/dashboard/layout.tsx           ← TopNav 자동 상속
src/config/navigation.ts               ← 네비 항목 ("AI처방/CLINIC" 있음)
tailwind.config.ts                     ← bg-surface-*, text-content-*
```

### 테스트·검증
```
scripts/test-two-stage-classify.ts    ← 비용·토큰 실측 (실행 시 약 $0.03 과금)
```

---

## 🔴 세션 종료 전 체크리스트

- [x] 로컬 main 최신 → origin push 완료 (`af706e7`)
- [x] Vercel 자동 배포 트리거됨
- [x] Anthropic 지출 한도 $150 설정
- [x] 프로덕션에서 자산화 1건 재테스트 완료 (선택지 복구·분류 정확도·비용 모두 OK)
- [ ] `graphify update .` 실행 (AST 기반 지식 그래프 갱신 — CLAUDE.md에 있는 규칙)

---

## 🧭 새 세션에서 이어갈 때

1. 이 문서(`PHASE2_PLAN.md`) 먼저 읽기
2. `git log --oneline -20` 으로 최근 변경사항 확인
3. **Phase 2 진행 시**: 위 "Phase 2" 섹션의 체크리스트 순서대로 작업
4. 비용 영향 있는 코드 변경 시 **반드시 실측 먼저** (scripts/ 디렉토리 패턴 따르기)
5. 자산화·재분석 버그 재현 시 `CHOICE_POLLUTION_PATTERNS`에 케이스 추가
