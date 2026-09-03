# 매쓰홀릭 라이트 버전 — 동래자사 계정 실측 · API 정의까지 (2026-09-04 밤)

계정: **동래자사(snaker1107) · 라이트(과금 등급)** · 크롬 로그인 상태 그대로 · 읽기만 (만들기·저장 안 누름)

> ★ **라이트 버전이다 — 옛 UI 가 아니다.** 피처플래그 키 `academyId=LIGHT/34223`, 학생 API `companyType: "LIGHT"` 실측.
> 라이트엔 「수업(반 허브)」가 없다. `/course` 로 가면 `/workbook` 으로 튕긴다.
> 06·08 조사서의 반 허브·유형분석·과제·취약과제는 전부 **엄궁차수학(umgungsmt, 프리미엄)** 화면이다.
>
> ★★ **대표 원칙 (2026-09-04)**: *"기본적으로 라이트 버전이 되는 건 우리도 다 되어야 정상."*
> → 이 문서의 기능 목록이 **우리 최소선**이다.
>
> 화면은 크롬 탭이 숨겨진 상태라 가상 테이블(`MadVirtualTable`)이 행을 안 그렸다.
> 대신 **앱이 부르는 API 를 그대로 호출해 응답 필드를 읽었다** — 정의(분자·분모·코드값)는 이쪽이 더 정확하다.

---

## 1. 라이트 메뉴 전체 = 우리 최소선

상단: `학습지 · 교재채점 · 학습현황 · 진단평가 · 연산대장 · 시험대장`
더보기: `TOMA · 글잼 · 학생 · 그룹 · 출결 · 문자 · 학원설정 · 제본 · 시험점수 · 오류신고`

| 라이트 | 우리 | 상태 |
|---|---|---|
| 학습지 (목록·출제·채점 제출·오답유사) | 시험지/클라우드 + 과제 | 부분 — 목록 난이도 분포·행 펼침 액션 없음 |
| 교재채점 | — | ✕ (교재 자료 없음) |
| 학습현황 (주간 캘린더 + 오답유사 출제) | 이력 탭(단계 6) | ✕ |
| 진단평가 | 진단 | 부분 |
| 연산대장 · 시험대장 · TOMA · 글잼 · 제본 | — | 사업 밖 |
| 학생 · 그룹(과정별) · 출결 · 문자 · 시험점수 | 학생/반 관리 · 성적 | 부분 |

---

## 2. 새 학습지 만들기 (`/workbook/new`) — 라이트의 출제 입구 전부

```
교재 (+1,300종 · 쌍둥이·유사 문제)             ← 프리미엄 전용
내신관   교과서 평가 학습지 · 내신 빈출 공략(중단원별 시험 필수 유형) · 내신 대비 실전 모의고사(난이도별)
수능관   수능특강·수능완성 학습지(숫자·조건 변형) · 모의고사 빈출 공략(평가원·교육청 기출) · 수능 대비 실전 모의고사
초등     문장제(주제별)                           ← 프리미엄 전용
문제은행 유형별 맞춤 출제 · 단원별 맞춤 출제
목적별   모의고사 기출 · 고난도(단원별) · 서술형(단원별) · ★ 오답 (학생별 오답·오답유사 문항 출제)
```
→ 라이트에서도 **출제 입구가 11개**다. 우리 출제는 "검색 → 담기" 한 갈래. (PLAN_EXAM_LINE_DESIGN 대조 필요)

### 2-1. ★★★ 오답유형 학습지 (`/workbook/new/wrong-type?step=1`) — 대표가 콕 집은 기능
3단 스텝퍼 `❶ 출제 구성 → ❷ 문제 편집 → ❸ 학습지 설정` (08 §10-1 취약과제와 같은 골격)

```
학생 (0)  [학생 선택]  "학생을 추가해주세요"
[단원 선택]  "학생을 먼저 선택해주세요."     기간 [   ] ~ [   ]

출제문항 구성
  [오답문제 추가]                 ← 틀린 그 문제
  [오답유사 추가]  없음 · 1개 · 2개 · 3개   ← 오답 1문제당 유사 N개
  [오답유사 통일]                 ← 학생마다 다른 오답이어도 같은 유사문제로 통일(추정 — 미확인)
출제문제 난이도
  개념 · 기본 · 실력(하) · 실력(중) · 실력(상) · 심화(하) · 심화(중) · 심화(상) · 고난도     ← 9단계 칩
최대 문제수  10 · 20 · 30   슬라이더 0 ~ 150
                                                    [2. 문제 편집]
```
- **학생이 먼저, 단원이 다음.** 학생을 고르면 그 학생의 오답이 있는 단원만 고르게 하는 구조.
- 오답 원문 + 유사 N개를 **문항 단위로 섞어** 낸다. 우리 오답 과제(단계 4)는 원문만 다시 낸다 → **유사 생성이 없다.**
- 난이도 칩이 **9단계**(개념·기본·실력 하중상·심화 하중상·고난도). 학습지 목록의 4단계(개념/기본/실력/심화)보다 잘다.
- 학생 선택 모달은 가상 리스트라 숨긴 탭에서 못 그려 ❷ 문제 편집까지 못 갔다. **(PC 앞에서 이어서)**

---

## 3. API 로 읽은 정의 (앱이 부르는 것을 그대로 호출)

### 3-1. 과정 트리 — 매쓰홀릭의 「판」 크기
`GET payment.matholic.com/chapter/root/academy/` → 과정 57개 (초등~고등, 2022개정 + 구과정, 사고력 레벨1~4)
`GET /chapter/{id}/child` 로 내려간다. **중등 3-1 (2022 개정)** (id 33774) 실측:

| depth | 수 | 예 |
|---|---|---|
| 1 대단원 | 3 | 1 제곱근과 실수 · 2 이차방정식 · 3 이차함수와 그래프 |
| 2 중단원 | 7 | 1.1 제곱근과 실수 · 1.2 근호를 포함한 식의 계산 · 2.1 곱셈 공식 … |
| 3 소단원(leaf) | 23 | 1.1.1 제곱근의 뜻과 성질 · 1.1.2 제곱근의 성질 응용 · 1.1.3 무리수와 실수 … |

소단원마다 `levelAndUnitGroupCount` = **난이도 레벨별 유형군 수**: 예 1.1.1 → `{1: 6, 2: 15, 3: 6}`.
**중3-1 합계: 레벨1 103 · 레벨2 280 · 레벨3 189 = 572 유형군.** (+ `hasConceptUnitGroup` 개념 유형군 별도)
소단원엔 **학습목표 태그**가 붙어 있다: "제곱근의 개념 이해하기 / 부호에 따른 제곱근의 개수 … / 제곱근의 표현 익히기".

**우리와 대조 (수학비서 트리, 중3-1)**
| | 매쓰홀릭 | 우리 |
|---|---|---|
| 대단원 | 3 | 9 |
| 중단원 | 7 | 27 |
| 소단원 | 23 | 227 (depth4) |
| 유형(군) | **572** | **1,657** (depth5) |
→ 우리 판이 2.9배 잘다. 매쓰홀릭 유형군 1개 ≈ 우리 세부유형 3개. 칸을 depth5 로 두는 건 맞되, **화면 밀도는 매쓰홀릭보다 3배 촘촘하다는 걸 알고 설계**해야 한다. (08 §2 의 확통 457 도 같은 층위)

### 3-2. 난이도 코드 — 두 체계가 공존한다
- **문항 난이도** `levelAndCount` (학습지 DTO): `{"-1": 1, "1": 7, "2": 12}` ↔ 화면 「개념 1 · 기본 7 · 실력 12」
  → **-1 = 개념 · 1 = 기본 · 2 = 실력 · 3 = 심화** (4단계). 오답 학습지 칩은 여기에 하/중/상을 더 쪼갠 9단계.
- **유형군 레벨** `levelAndUnitGroupCount` 키 1·2·3 — 유형군 자체의 레벨(3단계) + 개념 유형군 플래그.
→ 우리 `classifications.difficulty` 1~10 을 4밴드로 접은 것과 대응: **-1↔개념(1~3) · 1↔기본(4~5) · 2↔실력(6~7) · 3↔심화(8~10)**.

### 3-3. 학습지 DTO — `POST jellyg.matholic.com/api/workbook/v3/list/company?yyyyMM=&page=&size=&bucketSize=`
```
id · name([대수][응용][과제][1차시]) · source(COMMERCIAL_TEXTBOOK) · sourceName([수학의 바이블 개념on] 대수)
· created · userId/userName(만든 선생님) · unitCount(20 = 문항 수) · students[] · chapterNames[]("1.1.1 거듭제곱근" …)
· grade · templateId · publisherId · seriesId · rootChapterId(과정) · settledExampleGroupId
· openAt/closeAt(제출기간) · complete · round/rounds/isCreateRound(회차) · levelAndCount(난이도 분포)
· category · searchable · open
```
→ 학습지 = **과정(rootChapter) + 소단원들(chapterNames) + 문항 + 대상 학생 + 기간 + 회차 + 난이도 분포**. 우리 시험지에 없는 것: **기간·회차·난이도 분포·대상 학생**(과제가 일부 대신).

### 3-4. 학습지별 학생 결과 — `POST /api/workbook/{id}/student/list`
```
id · fullName · score · solved · rightCount · unitCount(문항 수) · learningId
· ★ wrongTypeLearningId · wrongTypeScore · wrongTypeSolved · wrongTypeRightCount · wrongTypeUnitCount
· openAt · closeAt
```
→ **학습지 하나에 학생마다 「오답유사 학습(wrongTypeLearning)」이 짝으로 달린다.** 원 학습지를 풀면 그 학생의
오답으로 유사 학습이 생기고, 그것의 점수·풀었나·정답수·문항수를 원 학습지 옆에서 같이 본다.
**이게 "학생 오답유사"의 데이터 구조다.** 우리에겐 이 짝 개념이 없다.

### 3-5. 학습(learning) 상세 — `GET /api/learning/{learningId}`
```
type(WORKBOOK) · typeName(학습지) · step(UNIT_LEARNING) · stepName(문제풀기) · solved · checkAnswer · score · level
· totalUnitCount · correctUnitCount · passCount · student{…} · chapterName · unitGroupName
```
→ **진행도 계산의 재료가 여기 있다**: `correctUnitCount / totalUnitCount`, `passCount`. 학습 = 학생 × 학습지 1건.
`/answers` 는 안 푼 학습에선 `{}` — 푼 학습으로 다시 볼 것.
(프리미엄 학생 탭의 "진행도 46개/51개" 는 이 learning 들의 solved 수 / 배정 수로 보이나 **미확인**.)

### 3-6. 학생 — `POST payment.matholic.com/student/search/pageable {page,size}` · `GET /teacher/class/{id}/students`
```
id · fullName · nickname · grade{name,value: MIDDLE_FIRST…} · companyType(LIGHT) · paid · priceType(high/middle)
· colorScoreType(STANDARD) · dangerous · blacklist · enabled · created · image · phone(마스킹)
```
반(class) 단위로 학생을 준다 (`/teacher/class/121684/students`). `dangerous`·`colorScoreType` 같은 운영 플래그가 있다.

### 3-7. 오답유사 버튼(학습지 행 펼침) 을 눌렀을 때 앱이 부른 것
`auth/token` → `learning/batch` → `learning/snap-group/finds` → `remote-storage/chajum.answer.draft.v1.{learningId}` × 학생 수
→ **채점(chajum) 답안 초안**을 학생별로 미리 읽는다. 오답유사는 채점 결과 위에서 만든다는 뜻.

---

## 4. 라이트에서 그대로 가져올 것 (우선순위)

1. **학습지(시험지) 목록에 난이도 분포 한 줄** (개념·기본·실력·심화 개수) — DTO `levelAndCount` 그대로. 우리 `classifications.difficulty` 접으면 됨.
2. **시험지 행 펼침 액션**: 채점 제출 · 오답유사 · 답안입력 이력 · 학습(학생별 결과) — 목록을 안 떠나게.
3. **오답유형 학습지**: 학생 먼저 → 단원 → [오답 원문 + 오답유사 N개] + 9단계 난이도 칩 + 최대 문제수. 우리 오답 과제(단계 4)에 **유사 N개** 를 붙이는 게 핵심 차이.
4. **학생별 「오답유사 학습」 짝** — 과제/시험지마다 학생 × (원 학습, 오답유사 학습) 두 줄로 결과 보기.
5. **학습현황 주간 캘린더 + 캘린더 위 「오답유사 출제」 버튼** — 이력 탭(단계 6) 설계에 반영.
6. 시험지에 **기간·회차** 개념 (과제가 일부 대신하지만 학습지 자체가 가진다).

---

## 5. ★★ 번들(정적 JS)에서 읽은 것 — 화면이 안 그려져도 소스는 다 읽힌다

> 대표: *"스킬을 쓰든지 다 파악해라."* → 가상 리스트가 안 그려지는 건 우회하지 않고, 앱의 JS 청크(`assets-260903/*.js`)를
> 직접 읽어 **라벨·라우트·API 경로**를 뽑았다. 인증 불필요(정적 파일). 요청 헤더 가로채기는 권한 분류기가 막아 접었다.

### 5-1. 전체 라우트 61개 (`AppRoutes`) — 라이트·프리미엄 공통 지도
```
/home · /course · /course/create · /course/:courseId          ← 수업(반 허브) — 라이트에선 /workbook 으로 튕김
/workbook · /my-workbook · /private-homework · /marked-textbook · /shared-workbook · /workbook/new/:createType
/learning-log · /submit-answer · /video · /testing · /community · /profile · /access-log
/diagnostic-test · /questions · /mathtalk · /realtime-overview
/student · /student/:type · /student/screen/:studentId          ← ★ 학생 화면
/my-class · /teacher · /setting · /payment · /classroom/list · /classroom/overview/:classroomId
/analyze · /analyze/:tabKey                                    ← 분석
/textbook-mark/… · /textbook/create · /sms · /test-screen
/assessment · /assessment/create · /assessment/detail/:id/:tabKey   ← 시험대장(평가)
/testScore · /contest · /ysdj · /shdj · /holing · /bookshelf · /book/billing · /report(맞춤형 보고서)
/cloud-printer/… · /attendance-teacher · /binding · /purchase/cart · /purchase/order
```
메뉴 라벨(사이드): `수업 · 학습지 · 교재채점 · 학습현황 · 진단평가 · 연산대장 · 시험대장 · 홀링 · 글잼 · 학습 · 책장 · 보고서 · 분석 · 부가 · 구성원(교원·교사·학생·내 반 관리·그룹) · 운영(학부모·출결·문자·관리자·결제) · 기타(제본·모든질문·동영상·시험점수·오류신고·실시간 필기)`

### 5-2. 학생 화면 (`/student/screen/:studentId`) 과 학생 API — "학생 누르면 뭐가 나오나"
`StudentApi` 의 메서드가 곧 학생 화면의 구성이다:
| API | 뜻 | 우리 대응 |
|---|---|---|
| `POST /api/student/learning/log/v2 {studentId, dates}` · `/batch` | **학생 학습 이력** (날짜 배열로 조회) | 이력 탭(단계 6) |
| `/api/student/learning/log/comment` (+delete) | 이력에 **교사 코멘트** | 없음 |
| `GET /api/student/unitgroup/active` · `/update` (`studentId, chapterIds, date`) | **학생별 유형군 활성일** — 유형분석 시작일(08 §4) 의 실체 | 없음 |
| `POST /api/student/workbook/listAll` · `GET /api/student/workbook/list/v2` | 학생별 학습지 전부 | 학생별 과제 |
| `GET /api/diagnostic/learnings/all` | 학생 진단 학습 | 진단 |
| `/api/student/daily-learning-report/send` · `/sendAll` · `/shortUrl` | **일일 학습 리포트 학부모 발송** (짧은 링크) | 공유 리포트(부분) |
| `${PANDA_API}/genai/generate-ai-comment(-v2)` | 리포트 **AI 코멘트 생성** | 없음 |
| `GET /teacher/student/{id}/counsellings` · POST/delete | **상담 기록** (대상 학부모/학생 · 방법 전화/직접/기타 · 내용 · 기간조회 · 내가 쓴 글만) | 없음 |
| `GET /teacher/students/{id}/setting` | 학생 설정 | 부분 |
학습 이력 종류(`LogTypes`) 44종: `확인학습 · 필수예제 · 유형도전 · 중단원 레벨업 · 교재 채점 · 모의고사 · 진단평가 · 과제 · 오답유사학습 ·
교재 채점 오답 · 동영상 · 전국평가 · 월간평가 · 코멘트 · 별도전 · 일괄도전 · 유비무환 · 서술형 · 취약유형학습 · 포토오답노트 · 개념학습 ·
주간 클리닉 · 학습지(교과서/시중교재/모의고사/매쓰홀릭/단원학습/유형학습/취약유형/고난도/서술형/오답/내신빈출/문장제/기타) ·
오답과제 · 수업과제 · 연산대장 · 개념익히기 · 질문하기 · 다시풀기`
→ **"학습"의 단위가 44종이다.** 우리는 시험지 채점 1종.

### 5-3. 채점 모달(`ChajumModal`, 187KB) — 라이트에도 유형분석·취약과제가 있다
라벨: `미리보기 · 공통 문제지 보기 · 문제 보기 · 다시풀기 · N차 · 오답유사 · 해설 · 풀이 · 시험지로 보기 · 목록으로 보기 · 제외된 문제 ·
개념/기본/실력/심화/고난도 · 강의모드 · 제출 · 풀이노트 · 오류문제 신고 · 평균점수/문항정답률 · 학습 · 학생 추가 · 문제지 출력 · 채점 ·
**유형분석** · 정오표 · 한명씩 보기 · 답안입력이력 · 판서모드 · 메모장 · 학습 점수 · **오답유사 점수** · 정렬 · 구분 · 점수 · 학습일`
유형분석 탭 문구: `유형성취도 · 단원 유형분석 난이도 · 난이도구분 · 단계 · **방금 채점한 내역으로 취약 유형** · **취약한 유형만 골라 과제로 출제** ·
**안 푼 유형도 유형별 이해도를 예측** · 취약 유형을 선택해 · 실제 푼 유형은 · 취약유형 · 과제 만들기`
→ **채점이 끝난 그 자리에서 유형분석 → 취약 유형 → 과제.** 예측(AI)도 여기 붙어 있다. 우리 채점 탭(단계 7) 설계의 기준.

### 5-4. 과제 옵션 모달(`HomeworkCreateModal`) — 08 §5-1 의 「미확인」 3개가 풀렸다
```
과제명 · 추천 과제명(출제범위 [적용]) · 출제방식 ● 동일유형(문제 선택) ○ 추천유형 ○ 선택유형 · 기출문제만 출제
유형 당 출제 문제수 · 최대 출제 문제 수 · 추천 방식: 취약 유형 우선 / 안푼 유형 우선 / 중요 유형 우선
출제문항수 자동 · 출제유형색상 · 주관식만 · 전체 · 과제 옵션 선택 → 문항 선택 → 학생 선택 → 출제하기
```
- **추천유형** = 추천 방식(취약/안푼/중요 유형 우선)으로 시스템이 고른다. **선택유형** = 교사가 유형을 고른다.
- 문제 추출 API: `/api/extract/unit/related/v4`(유사) · `/advanced/v2`(고난도) · `/statement`(서술형) · `/candidate(s)` · `/examReferer`(기출) · `/api/extract/unit/weakness`(취약)
→ **"유사문항"은 `extract/unit/related` 한 API 로 뽑는다.** 우리 오답유사(단계 4 확장)의 서버 함수가 이것.

### 5-5. 예측·점수 API (`LearningScoreApi`) — 매쓰홀릭 「AI 예측」의 실체
`/api/learning/predict/score` · `/api/learning/predict/color` · `/api/learning/predict/joinScore` · `/api/learningScore/v2/course/{id}` · `/chapter/{id}` · `/chapter/{id}/advanced/v2` · `/statement` · `/api/m-unitgroup/{id}/unit-samples`(유형 대표 문제)
→ 예측은 별도 서비스 호출(점수·색). 판 채운 뒤 갈 때 여기 대응 함수를 만든다.

### 5-6. 단원 API (`ChapterApi`) — 판의 API
`/chapter/root/academy` · `/chapter/{id}` · `/child` · `/tree` · `/leaves` · `/chapters/{id}/levels/unitgroup-counts` · `/jwt/api/chapter/unitgroups/count(/v2)` · `/jwt/api/chapter/{id}/units/…` · `/jwt/api/chapter/{id}/note`(개념 노트) · `/api/student/chapters`

### 5-7. 수업(course) 종류 (`Course` 청크) — 프리미엄 반 허브의 수업 템플릿
`소단원학습 · 소단원 유형학습 · 내신기출 · 매쓰홀릭 · 중단원 레벨업 · 전범위 모의고사 · 계통수학 · 유형완성 · 난이도유사 · 교과서 더하기 · 자기주도 · 내신대비 · 내신빈출 · 수업과제 · 쌍둥이 교재 · 맞춤편집 · 학습지 모음`

### 5-8. 진단평가 API (`DiagnosticsTestApi`)
`/api/diagnostic/group/{id}` (+delete/available/periodType/templateLearning) · `/group/{id}/test/list` · `/api/diagnostic/selectLevelAndUnitCount` · `/api/teacher/diagnostic/stats` · `/api/diagnostic/learnings`
→ 진단평가 = **그룹 단위**로 만들고 기간형(periodType)·템플릿 학습이 있다. 우리 진단(BS/DD/PT)과 대조할 것.

## 6. 못 본 것 / 다음
- 학생 선택 모달·학생 표·학습현황 캘린더 본문 — **가상 리스트라 탭이 보여야 그려진다.** PC 앞에서 다시.
- 오답유형 학습지 ❷ 문제 편집 화면 (원문항/유사문항이 어떻게 나열되나) · 「오답유사 통일」의 정확한 뜻.
- 학습현황(`/learning-log`) 데이터 API — 학생 선택 후에 불릴 것으로 보임. 미포착.
- 프리미엄(엄궁차수학) 항목은 이전 목록 그대로: 진행도 46/51 정의 · 과정별 미니 히트맵 · AI 유형분석 · 학습/일일학습/주간 클리닉/단원분석/유형이력/설정 · 08 §13 11건.
