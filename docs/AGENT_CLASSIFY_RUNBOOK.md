# 문항 분류 실행 런북 (에이전트용)

> 대상: 이 저장소에서 문항 분류를 실행하는 에이전트
> 작성: 2026-09-02 · 근거: 전부 운영 DB 실측. 추정치 없음.
> 저장소: `과사람 수학프로그램` · 운영 Supabase 프로젝트 id `shnsepqhyhfwnbivakpu`

---

## 0. 이 작업이 무엇인가

기출 적재로 문제은행이 5,563 → **37,243** 이 됐다. 그런데 새로 들어온 문제는
유형 코드가 없어서 **유형별 출제에서 검색되지 않는다.** 그 코드를 붙이는 일이다.

| 항목 | 값 |
|---|---|
| 전체 문제 | 37,243 |
| 시험지 | 1,741 (130개교) |
| **분류 없음** | **31,680** |

되는 것: 클라우드에서 시험지 찾기·인쇄·배포, 학교/연도/학기로 찾기
안 되는 것: **문제 단위로 단원·유형 좁히기**

---

## 1. 시작 전 필수 확인

```bash
# 1) 작업 디렉터리
cd "C:/과사람 프로젝트/과사람 수학프로그램/.claude/worktrees/design-system"

# 2) 환경변수 (.env.local 에 있어야 함)
#    NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY
rg -o "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY)=" .env.local

# 3) 좀비 프로세스 없는지 (★ 아래 6번 참고 — 이걸 안 하면 결과가 섞인다)
```

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*classify*" -or $_.CommandLine -like "*import-mathsecr*" } |
  Select-Object ProcessId, CommandLine
```

출력이 비어 있어야 시작한다.

---

## 2. 분류가 붙이는 값

수학비서 유형 트리(`mathsecr_types`, 22,785 노드)의 코드를 문제마다 **하나** 고른다.
새로 만드는 게 아니라 **고르는** 일이다.

```
MS07-04-02-06-03
 │   │  │  │  └ 세부유형
 │   │  │  └─── 소단원
 │   │  └────── 중단원
 │   └───────── 대단원
 └───────────── 과목 (MS07 = 공통수학1)
```

저장: `classifications` 테이블 — `type_code`, `difficulty`(1~10), `cognitive_domain`

**과목 코드**

| 코드 | 과목 | 코드 | 과목 |
|---|---|---|---|
| 01~06 | 중1-1 … 중3-2 | 09 | 대수 |
| 07 | 공통수학1 | 10 | 미적분1 |
| 08 | 공통수학2 | 11 | 확률과통계 |
| 12 | 미적분 | 13 | 기하 |

---

## 3. 실행 절차 — 이 순서를 지킨다

### 3-1. 단가·폴백 확인 (DB 미기록)

```bash
npx tsx scripts/classify-cost-probe.ts --n=20 --subject=07
```

**통과 조건 — 하나라도 어긋나면 멈추고 보고한다.**

| 항목 | 기준 |
|---|---|
| 폴백(전체 유형표 경로) | **0건** |
| 문항당 비용 | 24원 ± 30% |
| 성공률 | 20/20 |

### 3-2. 한 시험지로 실전 확인

```bash
# 측정만 (저장 안 함)
npx tsx scripts/classify-measure.ts --exam=반여고 --n=20

# 결과가 타당하면 저장
npx tsx scripts/classify-measure.ts --exam=반여고 --n=20 --save
```

`--n` 은 **필수**다. 없으면 스크립트가 아무것도 하지 않고 종료한다(대량 오실행 방지).

### 3-3. 범위를 끊어서 전체

**한 번에 31,680건을 돌리지 않는다.** 과목 또는 학교 단위로 끊는다.
중간에 끊기면 어디까지 됐는지 알 수 없기 때문이다.

기존 스크립트로 부족하면 `scripts/classify-measure.ts` 를 본떠 범위 지정 스크립트를 만든다.
**반드시 지킬 것**: `--commit`/`--save` 같은 명시 플래그 없이는 DB 에 쓰지 않는다.

---

## 4. 코드에서 반드시 지킬 것

핵심 함수: `src/lib/workflow/classify.ts` → `classifyProblem()`

```ts
await classifyProblem({
  content,                    // 문제 본문
  examSubject: '공통수학1',
  examGrade: '',
  curriculumCodes: ['07'],    // ★ 이게 핵심. 절대 빠뜨리지 않는다
  logLabel: '분류',
});
```

### (1) `curriculumCodes` 를 반드시 넘긴다
안 넘기면 AI 가 내용만 보고 과목을 고른다. 인접 과목끼리 흩어진다.
**실제 사고**: 수1 시험지 한 장이 공통수학1·공통수학2·수2 로 갈렸다(69건 재분류).

### (2) 학기가 불명이면 비용이 두 배
학기를 모르면 코드가 배열(`['03','04']`)이 되어 두 학기 표를 다 보낸다 → 143K 토큰.
적재된 시험지에는 `exams.curriculum_codes` 에 학년·학기가 들어가 있다. **그걸 쓴다.**

### (3) 과목 밖 결과는 저장하지 않는다
지정한 과목(`MS07`) 밖 코드가 나오면 버리고 건너뛴다. 억지로 맞추지 않는다.

### (4) 소량 먼저, 항상
되돌리는 비용이 넣는 비용보다 크다.

---

## 5. ★ 가장 큰 위험 — 폴백

`classifyProblem` 은 2단계로 돈다.

| 단계 | 무엇 | 토큰 |
|---|---|---|
| 1 | 대단원·중단원 선택 | 약 670 |
| 2 | 그 아래 소단원·세부유형 | 1,600~2,400 |

**2단계가 실패하면 전체 유형표(8만 토큰) 경로로 떨어진다. 비용 30배.**

31,680문항 기준: 76만원 → **2,000만원**

로그에서 아래 문구가 보이면 **즉시 중단**하고 보고한다.

```
L1L2 테이블이 비어 있음 — 2단계 분류 불가
```

---

## 6. ★ Windows 프로세스 함정 (실제 사고)

`pkill -f` 로는 Node 프로세스가 **안 죽는다.** 죽인 줄 알고 새로 띄우면
옛 프로세스와 **동시에 돌아 결과가 섞인다.**

**실제 사고 (2026-09-02)**: 적재 프로세스 9개가 겹쳐 돌며 중복·오염을 만들었다.
코드를 고쳐도 옛 프로세스가 계속 옛 코드로 쓰고 있어서, 고칠 때마다
"또 나온다"가 반복됐다. 원인 파악에 몇 시간을 썼다.

**항상 이렇게 죽인다:**

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*classify*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

죽인 뒤 **다시 조회해서 0개인지 확인**하고 다음 단계로 간다.

---

## 7. 비용·시간 (실측 기준)

문항당 **24원 · 7.6초**. 같은 과목을 연속 처리하면 캐시가 먹어 조금 내려간다.

| 범위 | 문항 | 비용 | 시간 |
|---|---|---|---|
| 전체 | 31,680 | 76만원 | 67시간 |
| 최근 3년 | 약 15,000 | 36만원 | 32시간 |
| 고1 공통수학1·2 | 약 9,000 | 22만원 | 19시간 |

**★ 비용 규율**: 범위를 넓히거나 전체를 돌리기 전에 **반드시 사람 승인**을 받는다.
에이전트 판단으로 전체를 돌리지 않는다.

---

## 8. 끝나고 확인할 것

```sql
select
  count(*) filter (where c.id is null)        as 분류없음,
  count(c.id)                                 as 분류됨,
  count(*) filter (where m.code is not null)  as 트리매칭,
  count(distinct left(c.type_code,4))         as 과목종수
from problems p
left join classifications c on c.problem_id = p.id
left join mathsecr_types m on m.code = c.type_code
where p.deleted_at is null;
```

**판정 기준**

- `트리매칭` = `분류됨` 이어야 한다. 다르면 **존재하지 않는 코드를 만들어낸 것**이다.
- 고등 시험지에 중등 코드(MS01~06)가 붙었으면 `curriculumCodes` 를 안 넘긴 것이다.

과목 뒤섞임 점검:

```sql
select left(c.type_code,4) as 분류, count(*)
from problems p
join classifications c on c.problem_id = p.id
join exam_problems ep on ep.problem_id = p.id
join exams e on e.id = ep.exam_id and e.deleted_at is null
where p.deleted_at is null and e.title like '25-1-%'   -- 고1 시험지
group by 1 order by 2 desc;
```

고1 시험지인데 MS03(중2-1) 같은 게 나오면 오분류다.

---

## 9. 이미 겪은 사고 — 반복하지 말 것

### (1) "공통수학1" 안에 "수1" 이 들어 있다
출처로 과목을 판정하는 규칙에서 `수1` 로 매칭했더니 **공통수학1 시험지 284건**이
통째로 대수로 바뀔 뻔했다. 드라이런에서 출처 목록을 눈으로 보고 잡았다.

→ 과목 판정 시 **공통수학·공수를 먼저 배제**한 뒤 `수1` 을 본다.

### (2) 테스트 데이터가 섞여 있었다
개발 중 넣은 미적분 교재·과학 모의고사가 수학 트랙에 박혀
"공통수학1에 미적분이 나온다"가 됐다. 548건 정리함.

→ 새 작업 전 `created_by` 가 없고 시험지에 안 붙은 문제를 확인한다.

### (3) 삭제해도 검색에 계속 나왔다
검색 API 에 `deleted_at` 필터가 없었다. `classifications` 는 문제를 소프트 삭제해도
남으므로, **분류로 후보를 뽑는 단계에서도** 걸러야 한다.

---

## 10. 관련 파일

| 파일 | 용도 |
|---|---|
| `src/lib/workflow/classify.ts` | 분류 핵심 (`classifyProblem`) |
| `src/lib/workflow/mathsecr-prompt.ts` | 유형표 빌더 (2단계용 `buildL1L2Table` / `buildL3L4Table`) |
| `scripts/classify-cost-probe.ts` | 단가·폴백 측정 (DB 미기록) |
| `scripts/classify-measure.ts` | 시험지 단위 분류 (`--save` 로 저장) |
| `scripts/classify-batch-run.ts` | **일괄 분류 (Message Batches, 정가 50%)** — 대상 선정→Stage1→Stage2→검증→`--commit`. run 디렉터리 재개 가능 |
| `scripts/classify-benchmark-models.ts` | 모델별 정확도·단가 벤치마크 — CLAUDE_MAX_VERIFIED 정답 대비 (DB 미기록, 폴백 키 차단) |
| `scripts/reclassify-by-source.ts` | 출처 기준 오분류 교정 |
| `scripts/import-mathsecr.ts` | HML 일괄 적재 (분류는 안 함) |

---

## 11. 보고 형식

작업을 마치면 아래를 사람에게 보고한다.

- 처리한 범위와 건수 (성공 / 실패 / 건너뜀)
- **폴백 발생 건수** — 0 이 아니면 원인
- 실제 소요 비용과 시간
- 8번 검증 쿼리 결과
- 중단했다면 어디서 왜 멈췄는지

**추정치를 쓰지 않는다.** 재지 않은 숫자는 "측정 안 함"이라고 적는다.

---

## 12. 모델 벤치마크 실측 (2026-10-24) — Haiku 5.5 는 못 쓴다, Sonnet 5.5 가 기준

`scripts/classify-benchmark-models.ts --n=150` — 정답(gold) = `classification_source='CLAUDE_MAX_VERIFIED'`
5,068건(구독제 Stage A/B/C 검증 커밋, **사람 검수 아님**) 에서 7과목(중1-2~공통수학2) 층화 150건.
두 모델에 같은 표본, 같은 `classifyProblem` 2단계 경로, Gemini/GPT 폴백 키는 프로세스 안에서 비움.

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| 완료 / 실패 | 150 / 0 | 150 / 0 |
| 대단원(L1) 일치 | 76.7% | 87.3% |
| **중단원(L2) 일치** | 60.0% | **83.3%** |
| 소단원(L3) 일치 | 25.3% | 56.7% |
| 세부유형(leaf) 일치 | 10.0% | 38.0% |
| 난이도 ±1 | 62.0% | 64.7% |
| 문항당 시간(동시 4) | 0.8초 | 1.1초 |
| 토큰 (in / cache_w / cache_r / out) | 321K / 380K / 813K / 28K | 320K / 488K / 724K / 37K |
| **문항당 비용** | **0.95원** | **22.21원** |

- Haiku 는 공통수학2 에서 중단원 일치 4/24. 분류기로 쓸 수 없다. 1원짜리 단가는 의미가 없다.
- Sonnet 의 leaf 불일치는 대부분 **이웃 세부유형**(…-03 ↔ …-04) — 중단원까지는 83% 맞는다. gold 자체가 모델 판정이라
  leaf 38% 를 「오답률 62%」로 읽으면 안 된다. 사람이 몇 건을 봐야 어느 쪽이 맞는지 안다 (미검증).
- 🔴 **난이도는 두 모델 모두 gold 보다 쉽게 본다.** gold 분포는 7~9 가 150건 중 43건인데 Sonnet 은 7 이 5건, 8 이상 0건.
  어느 쪽이 맞는지는 사람 판단 필요 — 출제 난이도 필터에 직접 걸리는 값이므로 전체 적재 전에 결정할 것.
- Sonnet 비용의 51% 가 **캐시 쓰기**(488K × $2.5/M). 표본이 7과목·많은 중단원에 흩어져 Stage 2 표가 매번 새로 써졌다.
  전체 적재는 과목→대단원→중단원 순으로 묶어 연속 처리하면 쓰기가 읽기로 바뀐다 → 하한 **약 12원/문항**(외삽, 미검증).
- 환산 (26,526 미분류 문항, Sonnet 5.5): API 32만~59만원 · Message Batches(50%) 16만~30만원. 시간은 동시 4 로 약 8시간.

### 이 측정에서 고친 운영 결함 (classify.ts · model-params.ts)
- **Haiku 5.5 는 요청에 thinking 이 없어도 thinking 블록을 내보내** Stage 1 max_tokens 100 을 사고로 다 쓰고 text 가 빈 채 돌아왔다(전건 실패).
- **Sonnet 5.5 는 JSON 앞에 풀이 문장을 붙여** 100 토큰에서 잘리면 `"MS03-` 까지만 와 Stage 1 실패 → Gemini 폴백. 고치기 전 36건 중 6건(17%).
- 조치: `noThinkingParams(model)`(haiku→disabled · sonnet→between_tools · opus→effort low) + `output_config.format` JSON 스키마(Stage 1·2) + max_tokens 300/1000.
  고친 뒤 두 모델 모두 164건 연속 실패 0.

---

## 13. 중등 일괄 분류 실행 기록 (2026-10-25) — Message Batches 로 1,883건, 총 약 18,600원

`scripts/classify-batch-run.ts --run=mid-20261025b --subjects=02,03,04,05,06` (Sonnet 5.5, Batch 50%).
대상 = `exams.curriculum_codes` 가 전부 중등(02~06)인 시험지 189장의 미분류 2,082문항.

| 단계 | 결과 |
|---|---|
| 1차 run (이웃 학기 표 누락) | Stage1 2,014 성공 / 68 실패(표 밖 지난 학기 코드), 14,006원 |
| 2차 run (이웃 학기 표 포함, Stage2 는 1차 결과 재사용) | Stage1 2,082 전건 성공, Stage1 코드 바뀐 293건만 Stage2 재호출, 4,621원 |
| 검증 | 없는 코드 2건 제외(`MS05-06-04`), 다른 경로로 이미 분류 197건 제외 |
| **기록** | **1,883건** `classification_source='claude-sonnet-5-5/batch:mid-20261025b'`, readback 일치, 함정 태그 별도 INSERT |
| 남은 중등 미분류 | 2건 |

난이도 분포(기록분): 1:17 · 2:249 · 3:657 · 4:551 · 5:337 · 6:70 · 7:2.

### 이번에 배운 것 — 다음 run 전에 읽을 것
- 🔴 **이웃 학기 표를 빼면 안 된다.** 동기 경로는 `withNeighborCourses` 로 지난 학기 표를 합친다. 배치가 이걸 빠뜨리자 중1-2 시험지의 중1-1 문항 59건이 표 밖 코드로 나와 실패했고, 나머지도 이번 학기 코드로 억지로 들어갔을 수 있어 Stage1 을 전체 재실행했다(293건이 바뀜, 그중 43건은 학기 자체가 바뀜).
- 🔴 **`.range()` 페이징은 `.order()` 없이는 행이 빠진다.** 기존 분류 목록을 그렇게 읽어 197건을 "미분류"로 잘못 넣었고, `.in()` 500개 조회는 error 를 안 봐서 조용히 비어 돌아와 INSERT 가 중복키로 전건 실패했다. → order 페이징 + 200개 chunk + error throw.
- Batch 는 제출 후 8~15분이면 끝났다(2,000건). 캐시 쓰기가 많아 문항당 단가는 동기 실측(22원)의 절반이 아니라 약 7~9원이었다(1차 14,006원/2,014건 ≈ 7원).
- 고등(07~13) 24,500건 환산: 약 17만~22만원 (미검증 외삽). 과목별로 끊어 run 하나에 3,000건 이하 권장.
