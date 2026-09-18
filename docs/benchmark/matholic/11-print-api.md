# 매쓰홀릭 — 인쇄(출력) 실측: API · 조판 · 옵션 (2026-09-19)

대표 지시: *"인쇄 부분은 API 분석을 통해 완성해야지, 캡처해서 되겠나."*
캡처는 겉모습이다. 여기엔 **무엇을 내려주고 어떻게 조판하는지**를 적는다. 전부 실측이다 — 추정한 항목은 「미확인」으로 표시.

## 1. 진입 — 학습지 목록 「출력하기」

`window.open` 으로 **같은 도메인 SPA 팝업**(1280×800)을 연다.

```
https://teacher.matholic.com/print/learnings?workbookId={7자리}&templateId={9자리}&v2=true&printKey=twice.print.handoff:{ts}_{rand}
```

새 창이라 네트워크 캡처에 안 잡힌다 — `window.open` 을 가로채 주소를 얻었다.

## 2. 인쇄 화면이 부르는 API (jellyg.matholic.com/api, Bearer JWT)

| API | 무엇 |
|---|---|
| `GET /workbook/{workbookId}` | 학습지 메타 — name · source(COMMERCIAL_TEXTBOOK) · sourceName · unitCount · students[] · chapterNames[] · grade · templateId · rootChapters · openAt/closeAt |
| `GET /learning/batch?learningIds=…` | **문항 배열** — `learningUnits[]`: num · unitId · chapterName · unitGroupId · answerValues · answerType(ONE …) · **unitImagePathMd5** · **answerImagePathMd5** · unitType(INPUT_TYPE …) · level · tagLevel · score · point |
| `GET /learning/unit-meta/group?…` | 문항별 출처 — `textbookSource: {isSimilar|isTwin, similarSource: "[수학의 신] 공통수학 1 P.80 01번"}` |
| `GET /learningPrintTheme/options/learningGroup?…` | **이 학습지의 인쇄 옵션**(§4 themeOptions) |
| `GET /learningPrintTheme/template/academy` | 학원 저장 템플릿 목록 `[{id, name, isPersonal, userId, userName}]` |
| `GET /learning/{id}/printOption` | 200 이지만 본문 빈 응답(실측) — 미확인 |
| `POST /learning-print/title` | 제목 규칙 (GET 405 → POST, 본문 미확인) |
| `GET /student/learning-template/{templateId}/qr/url`, `GET /learning/qr/url?…` | QR |
| `GET /learning/{id}/accuracy` | 정답률 |
| `remote-storage/twice.print.custom-paper-themes.v1` (panda-api) | 사용자 정의 종이 테마 |
| `remote-storage/matholic-cloud-printer` (panda-api) | 클라우드 프린터 설정 |

## 3. ★ 핵심 — 문항은 **미리 렌더된 이미지**다

```
https://image.matholic.com/units/{a}/{b}/{unitImagePathMd5}.webp?tt=…   naturalWidth 1280px
```

문항 본문·보기·수식이 통째로 **WebP 한 장**이다(실측 1280×206 ~ 1280×703). 정답도 `answerImagePathMd5` 이미지.
조판기는 글자를 다루지 않는다 — **이미지를 단 폭(88.7mm)에 맞춰 넣을 뿐**이다. 그래서 그쪽 인쇄는 안 깨진다.
우리는 KaTeX 로 라이브 렌더한다 → 폭 맞춤(#561·#562)이 같은 효과를 내야 한다.

## 4. 인쇄 옵션 스키마 — `themeOptions` (실측 값)

```json
{
  "designVariant": "classic", "neoTheme": "mid1", "neoColor": "#1a6cff",
  "theme": "pattern1", "color": "#9BCAF5",
  "columns": 2, "countPerColumn": 2, "unitGap": 12,
  "showSubTitle": false, "showQR": false, "show2ndHeader": true,
  "showTextbookSource": false, "showExamSource": true, "showUnitCount": null,
  "gridType": "none", "levelType": "text", "paperLayout": null
}
+ statementUnitInitNumber: null   ← 서술형 시작 번호
+ unitGroupConceptNoteOptions: null
```

### 우측 옵션 패널 (실측 전문)
| 묶음 | 항목 |
|---|---|
| 표지와 제목 | 표지 · 제목[모두] · 부제목 표시 · 문항수 표시 · QR |
| 문제와 답안 | 문제지 · 답안지 · 답안 작성 용지(beta) · 문항 힌트(beta) |
| 문항정보 표시 | 난이도 표시[텍스트] · 대표유형 동영상 QR(beta) · 교재 출처 |
| 디자인과 정렬 | 양면 · 제본여백 · 테마[패턴1-겹곡선] · 모눈[없음] · 기본/모아찍기/노트/교사용 · 다단[2단] · **스마트정렬 최대 2문제/컬럼** · 여백 12 |
| 하단 영역 | 하단 영역 표시 · 출제단원 · 페이지 번호 · 출제자 · 학습번호 |
| 상단 바 | 제출일 보기 · **여백 조절**(문제 사이 드래그 바) · 전체 오답유사 · 답안입력 · 확대 · PDF · 출력하기 |
| 좌측 | 학생별 학습/다시풀기/오답유사 상태 + 점수 + 학습일 → 공통문제지/학생별 선택 |

## 5. 조판 기하 (실측, 100% 배율)

| | |
|---|---|
| 종이 | `.paper` **210 × 297mm**, padding 0 / 8 / 10 / 8 mm |
| `@page` | `size: a4; margin: 0` · `print-color-adjust: exact` · `.paper { break-inside: avoid }` |
| 내부 | 287mm = **헤더 43.9mm** + **본문 234.4mm** + 푸터 6mm(`1 / 3`) |
| 헤더 | 테마 곡선 SVG + 제목(22px/700) + 학원명 + 「이름 :」 칸 (25.4mm 행) |
| 본문 | **2단**, 단 폭 **88.7mm**, 단마다 세로 구분선 SVG |
| 슬롯 | `countPerColumn=2` → 단을 **같은 높이 2칸**(116~118mm)으로 나누고 칸마다 문항 1개. 문항 수가 아니라 **칸이 고정** — 매쓰홀릭 「스마트정렬」·「높이 균등화」의 실체 |
| 문항 | 번호 `01` 15px SUIT + 난이도 배지(10px, 배경 #666, 흰 글자, 반경 3px) + 이미지(단 폭) |
| 글꼴 | **SUIT** (헤더·번호). 문항 본문은 이미지라 글꼴 개념 없음 |

## 6. 우리와의 대조 (실측 기준으로 다시)

| 매쓰홀릭 | 우리(ExamPaperView, 코드 실측) | 판단 |
|---|---|---|
| 문항 = 이미지 | 문항 = KaTeX 라이브 | 우리가 유연(편집·검색 가능)하지만 깨질 수 있다 → 폭 맞춤(#561·#562)으로 방어 |
| 단당 고정 슬롯(스마트정렬, countPerColumn) | **있음** — 「페이지당 문항수」 프리셋(`perPagePreset`) + 남는 높이를 풀이공간 비례로 나누는 자동 간격(`pageAutoGaps`, 24~48px) | 같은 일을 다른 식으로 한다. 매쓰홀릭은 칸 높이 고정, 우리는 비례 분배 |
| 여백 조절(unitGap 12, 드래그 바) | **있음** — 간격 슬라이더(`gap`, 저장 프리셋에 포함) | 드래그 바만 없음(사소) |
| 하단 영역: 출제단원 · 페이지 번호 · 출제자 · 학습번호 | **있음** (09-19, PR #571) — 좌 출제단원(대단원 상위 3) · 중 `N / 총` · 우 출제자·학습번호, 토글 | 같음 |
| 표지 | 없음 | 대표 "급하지 않다" |
| 테마 패턴(pattern1 겹곡선…) + 색 | 헤더 5종 + 강조색 | 성격 같음 |
| 난이도 텍스트 배지(개념~고난도, 10px #666) | **있음** (09-19, PR #571) — 번호 옆 10px #666, 우리 5단 밴드 라벨 | 같음 |
| 교재 출처(similar/twin 원문 페이지·번호) | 출처(학교·연도) | 성격 같음 |
| 답안지(하위: **빠른정답 · 풀이**) · 답안 작성 용지 · 문항 힌트 | 빠른답(정답표) · 해설지 | 답안지는 「빠른정답」「풀이」 두 하위 토글로 갈린다 = 우리의 빠른답/해설지와 같은 구분. 미리보기에는 안 나타났고 출력 시 별도 문서로 붙는 것으로 보임 — 조판은 **미확인** |
| 양면(빈 페이지 자동 삽입) · 제본여백 | **양면 있음** (09-19, PR #571) — 홀수 장이면 빈 페이지. 제본여백 없음 | 제본여백은 좌우 여백 슬라이더로 대신 |

**가져올 것**: ①~③ 은 PR #571 로 끝냈다(전부 기본 꺼짐 — 종전 출력 불변). 남은 것 = ④ 표지(보류) · 답안지 조판(미확인). 스마트정렬·여백은 이미 있으므로 **안 만든다**.

## 7. 정정
04 문서의 "우리 인쇄가 더 정교하다"는 09-15 에 못 본 것 위에 쓴 판단으로 정정했다. 이 문서가 그 자리를 대신한다 — **매쓰홀릭 조판은 이미지+고정 슬롯이라 단순하고 튼튼하고, 우리는 라이브 렌더라 유연하고 깨지기 쉽다.** 우열이 아니라 성격 차이다.
