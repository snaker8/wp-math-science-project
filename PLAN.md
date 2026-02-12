# PDF 문제 분석 페이지 구현 계획

## 목표
레퍼런스 사이트처럼 업로드 후 **문제 하나하나 확인/수정하는 중간 단계 UI** 구현

## 현재 상태
- 업로드 → 백그라운드 OCR+LLM → 완료 후 결과만 표시 (중간 확인 없음)
- ProblemEditModal (textarea+미리보기) 이미 존재
- 기존 MathEditor (Tiptap+KaTeX) 컴포넌트 보존 중
- /api/problems/[problemId] PATCH API 존재
- /api/workflow/upload POST/GET API 존재

## 구현 계획 (3개 파일 생성/수정)

### Step 1: PDF 분석 페이지 생성
**파일**: `src/app/dashboard/workflow/analyze/[jobId]/page.tsx`

3패널 레이아웃:
- **좌측**: 페이지 썸네일 리스트 (PDF 페이지 1, 2, 3, 4...)
- **중앙**: PDF 원본 이미지 표시 + 감지된 문제 영역 점선 박스 오버레이
- **우측**: 선택된 문제의 OCR 분석 결과 패널
  - 문제 번호 (편집 가능)
  - OCR 변환된 수식/텍스트 (MixedContentRenderer로 렌더링)
  - 선택지 표시
  - **저장 / 삭제 / 다시 분석 / 고급 분석** 버튼 4개

상단 헤더:
- 파일명 표시
- "자동 분석" / "자동 페이지 넘기기" 토글
- "기본 분석 엔진" / "닫기" 버튼
- "분석 중..." 상태 표시 (로딩 스피너)

하단:
- "* 문제를 수동으로 분석하려면 선택된 영역을 더블클릭하세요..."

### Step 2: 문제별 상세 편집 모달 업그레이드
**파일**: `src/components/papers/ProblemEditModal.tsx` 수정

레퍼런스 4번/5번 사진처럼:
- 좌측: 원본 이미지 영역 (OCR 원본 스캔 이미지)
- 우측: 리치 텍스트 에디터 (현재 textarea → 업그레이드)
  - 툴바: Σ(수식), T(텍스트), 이미지, 표, 코드블록 등
  - 수식 클릭 시 → LaTeX 입력 모달 팝업
  - 하단: 객관식/주관식 탭 + 순서무시/순서대로 + 답 입력

### Step 3: LaTeX 수식 입력 모달 생성
**파일**: `src/components/editor/LaTeXInputModal.tsx`

레퍼런스 5번 사진 구현:
- 상단: KaTeX 실시간 프리뷰
- 체크박스: "displaystyle 적용", "block 적용"
- LaTeX 텍스트 입력 영역
- 버튼: "수식 해제", "취소", "입력"

### Step 4: 워크플로우 연결
**파일**: `src/components/workflow/CloudFlowUploader.tsx` 수정

Job 완료 시:
- "N개 문제 분석 완료" → **"문제 확인하기"** 버튼 추가
- 클릭 → `/dashboard/workflow/analyze/[jobId]` 페이지로 이동

### Step 5: API 확장
**파일**: `src/app/api/workflow/upload/route.ts` 수정

GET 응답에 추가:
- `ocrPages`: 페이지별 OCR 원본 텍스트
- `problemRegions`: 문제 영역 좌표 (있는 경우)

**파일**: `src/app/api/problems/[problemId]/reanalyze/route.ts` 신규

POST: 개별 문제 재분석 API
- problemId로 기존 content_latex 가져와서
- GPT-4o로 재분석 (고급 분석)
- 결과로 content_latex, classification 업데이트

### Step 6: 네비게이션
**파일**: `src/config/navigation.ts` 확인/수정
- 워크플로우 하위에 "PDF 분석" 진입점 확인

## 우선순위
1. **Step 1** (PDF 분석 페이지) - 핵심 UI
2. **Step 3** (LaTeX 입력 모달) - 수식 수정 필수
3. **Step 2** (ProblemEditModal 업그레이드) - 에디터 개선
4. **Step 4** (워크플로우 연결) - 진입점
5. **Step 5** (API 확장) - 재분석 기능
6. **Step 6** (네비게이션)

## 기술 결정
- PDF 렌더링: PDF.js (react-pdf) 사용 → 페이지별 캔버스 렌더링
- 수식 프리뷰: 기존 KaTeX 활용
- 에디터: ProblemEditModal의 textarea 유지 (DB가 LaTeX text 저장이므로)
- 문제 영역 표시: CSS overlay (절대 좌표 기반 점선 박스)
- 다크 테마 유지 (zinc/black)
