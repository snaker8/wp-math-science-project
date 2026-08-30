# 운영 흐름 일관성 진단 & 정상화 계획

> 작성 2026-06-29. 목적: "기능은 다 작동하는데, **효율적인 하나의 흐름으로 안 엮인다**"는 문제를 매쓰홀릭 흐름 기준으로 진단하고, 흩어진 작동 조각을 한 루프로 연결한다.
> 근거: 운영 DB(`ppexawiiphghdrjnmvkx`) 실측 + 코드 트레이스(file:line). 짝 문서: [PLAN_MATHOLIC_BENCHMARK.md](PLAN_MATHOLIC_BENCHMARK.md)(신규 강점 빌드).

---

## 0. 결론 한 줄 (2026-06-29 검증 후 정정)
모든 조각은 **작동한다**(분류 5,035·진단 items 2,746·숙달 3,950·QR채점 1,658 다 쌓임). **채점 환류(QR→숙달)는 이미 통합되어 있다**(아래 정정 참고). 실제 남은 갭은 **(1) 처방 추천 API의 status 표기 불일치로 추천이 항상 빈 결과(검증된 실버그), (2) 처방→출제 자동 미연결, (3) 선수추적 빈 데이터 무력화, (4) 유형 숙달을 보여줄 매트릭스 UI 부재(데이터는 있음)** — 즉 *데이터 배선*보다 *표현·UX·흐름* 쪽 갭이 핵심.

> ★ **정정 (중요)**: 초안에서 "QR채점이 숙달로 환류 안 됨(최대 단절)"이라 적었으나 **오진단**이었다. `supabase/migrations/20260605_001_qr_results_feed_node_status.sql`(Phase 4)이 이미 `recompute_node_status(student,code)`로 items ∪ session_results 통합 집계 + session_results 트리거 + 백필을 구현해 두었다. DB 검증: items 0개 학생이 student_node_status 103행(전부 QR). **단순 UNION 마이그레이션을 적용했다면 이중 집계 사고였고, prod 적용 전 검증으로 차단했다.** 원인: 코드 트레이스가 route+최초 마이그레이션만 보고 2026-06-05 마이그레이션을 누락. (교훈: 손대기 전 git/마이그레이션 전수 + DB 실측.)

---

## 1. 현재 흐름 단절 지도 (실측 근거)

### ~~단절 #1 — QR채점 미환류~~ → ✅ 이미 해결 (정정)
3개 채점 입력원(수동 items / EX·CSV items / QR session_results)이 모두 `recompute_node_status`로 **한 숙달 그림에 합류**한다(`20260605_001`). QR은 `session_problems.type_code_snapshot`(출제 시점 스냅샷)로 조인 — classifications 드리프트까지 회피. **무단절.** (초안 오진단, §0 정정 참고.)

### ★ 실버그 #1 (검증됨) — 처방 추천 API가 status 표기 불일치로 항상 빈 결과
`recommended-problems/route.ts`:
- L31-35 `STATUS_DIFFICULTY_RANGE` 키 = **그리스** `γ/β/α`
- L73-74 `statuses.filter(s => s.status === 'γ')` / `'β'`
그러나 **DB의 `student_node_status.status` = 영문** `alpha/beta/gamma` (실측: alpha 3,282·gamma 611·beta 57).
→ `gammaNodes`/`betaNodes` **항상 빈 배열** → `targetNodes` 빔 → **추천 문제 0개**. 약점 노드 611개가 있는데 못 읽는다.
- 영향: 처방 페이지 자체(heatmap·약점 단원)는 영문 비교라 정상(`prescription/page.tsx:311,323`). **API 추천만** 죽어 있음.
- 수정: route의 `γ→gamma`,`β→beta`,`α→alpha` (STATUS_DIFFICULTY_RANGE 키 + 필터). 외과적·저위험.

### 단절 #2 — 처방이 실제 출제로 자동 연결 안 됨
`recommended-problems`가 (실버그#1 고친 뒤에도) 문제 **추천 표시까지만**. 추천 → 시험지 편성·배포로 잇는 경로 없음. (매쓰홀릭: 약점 유형 선택 → 과제 원클릭 출제.)

### 단절 #3 — 선수추적 무력화 (빈 데이터)
`diagnostics.prerequisites` **0행**(seed/INSERT 코드 부재). `trace_weakness_chain`이 항상 루트 1개만 반환 → "약점 체인" UI가 항상 1줄.

### 잡음 #4 — UNKNOWN/구형 코드 히트맵 조용히 탈락
`v_student_mathsecr_heatmap`이 `mathsecr_types.code`와 **INNER JOIN**. 분류 실패분(`UNKNOWN`,`MA-UNKNOWN-001`)·MS외 코드는 items엔 들어가도 히트맵에서 사라짐 → "입력했는데 안 보임".

### 문서/격리 불일치 (영향 작음)
- `classifications.expanded_type_code` **전부 NULL**(0/5,035). MS코드는 `type_code`에 저장(4,741건 MS형식). CLAUDE.md의 `matchExpandedTypeCode`/expanded_type_code 로직은 **현재 코드에 없음** → 문서 갱신 필요.
- `diagnostics.sessions/items`에 `institute_id` 컬럼·앱레벨 스코프 부재 → 멀티테넌시 누수 소지.

---

## 2. 매쓰홀릭 기준 "효율적 목표 흐름"
매쓰홀릭은 **모든 채점이 단일 숙달 그림으로 자동 환류**되어 한 루프로 돈다:
```
출제(소스 위저드) → 온라인+인쇄 동시배포 → [채점: QR/수동/온라인 — 어느 경로든]
  → (자동) 문제 mathsecr 코드로 숙달 환류 → 유형 숙달 매트릭스(★) 갱신
  → 약점 유형 자동 식별 → 약점/오답 과제 원클릭 출제(처방) → 회차(N회) 반복
  → 주간 목표 달성률 · 학생 보고서 · 그룹 공통취약
```
우리도 조각은 다 있으니 **"채점 → 숙달 → 처방 → 출제"의 끊긴 배선만 이으면** 같은 루프가 닫힌다.

---

## 3. 정상화 시퀀스 (배선 우선 · 저위험 먼저)

> 원칙: 새 기능보다 **끊긴 배선 연결**이 먼저. 기존 트리거/뷰/생성기 재사용. 기존 수학 워크플로우 가드 유지.

**F1. ~~채점 단일 환류~~ → ✅ 이미 구현(20260605_001). 신규 작업 아님.**

**F1′ (새 최우선·외과적·저위험). 처방 추천 status 표기 버그 수정**
`recommended-problems/route.ts`의 그리스문자 `γ/β/α` → 영문 `gamma/beta/alpha`(STATUS_DIFFICULTY_RANGE 키 + 필터). 약점 노드 611개를 비로소 읽어 추천이 살아난다. AI비용0. (실버그 #1)

**F2. UNKNOWN/구형 코드 정리 (저위험)**
`UNKNOWN`/MS외 코드를 items 적재 단계에서 스킵하거나 보정. 히트맵 LEFT JOIN+"미분류" 버킷 노출로 "안 보임" 제거.

**F3. 처방 → 출제 원클릭 (흐름 닫기)**
처방 추천/약점 유형 선택 → 기존 시험지 편성·유사문제 생성으로 **바로 출제**. (AI 동반 시 비용 사전승인.) 매쓰홀릭 "약점→과제" 등가.

**F4. 선수추적 데이터 (무력화 해소)**
`prerequisites` 시드(수학비서 위계 기반) 또는 해당 UI를 데이터 준비 전까지 정직하게 비활성/대체. "추적해도 안 나옴" 제거.

**F5. 진단 라인 institute 격리** — sessions/items institute_id + 앱 스코프(누수 차단).

---

## 4. 신규 강점 빌드 (흐름 정상화 후 · 벤치마크 문서 연계)
배선이 닫힌 뒤, 매쓰홀릭 강점 중 우리에 없는 것을 **그 루프 위에** 신규:
- **출제 소스 위저드**(15종 소스 + 난이도 분포 카운터 + 유사문제 옵션) — S1
- **유형 숙달 매트릭스 UI**(소단원×난이도 ★) — F1으로 데이터가 채워진 뒤라야 의미 있음 — S2
- **회차(N회)** + **주간 목표 달성률** + **반 중심 운영 허브** — S4·S6
- 상세: [PLAN_MATHOLIC_BENCHMARK.md](PLAN_MATHOLIC_BENCHMARK.md) §5.

> 순서 핵심: **F1(채점 환류)이 먼저**여야 S2(숙달 매트릭스)·F3(처방)가 실제 데이터로 살아난다. 매트릭스부터 만들면 빈 화면이 됨.

---

## 5. 다음 결정 (사용자)
1. 정상화 1순위 = **F1 채점 단일 환류** 추천(AI비용0·저위험·이중작업 제거·즉시 체감). 동의 시 세션 연결 정합부터 상세 설계 → worktree 구현→검증→배포.
2. F3(처방→출제)·S2(매트릭스)는 F1 이후. F3의 유사문제 생성은 AI비용 사전승인.
3. F1 원인 확정용으로 운영 DB의 실제 채점 경로 분포는 이미 확인됨(items 2,746 vs session_results 1,658 — 상당수가 QR라인이라 환류 누락 영향 큼).
