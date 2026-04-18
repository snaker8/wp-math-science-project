# 시험지 관리 페이지 리디자인 브리프 (Claude Design용)

## 제품 컨텍스트
- **과사람 수학 프로그램** — 한국 학원·학교용 수학 문제은행 + LMS
- 사용자: **학원장 / 강사** (교사 전용 페이지)
- 업무: 시험지 편집·미리보기·인쇄·PDF/DOCX/HWPX 출력
- 현재 페이지: `src/app/dashboard/exam-management/page.tsx` (1800+ 줄)

## 현재 구조 (유지할 것)
- **왼쪽 사이드바**: 시험지 그룹 트리 (폴더 + 파일), 검색
- **상단바**: 액션 버튼들 (PDF/배포/유사만들기) + 페이지당 문제수 프리셋 (자동/4/6/8)
- **탭**: 시험지 / 빠른정답 / 해설지 (shadcn Tabs 적용 중)
- **메인**: A4 시험지 프리뷰 + 헤더(학원명/학년/과목/유형/시간/일시/총점) + 문제 리스트
- **우측 패널**: 1단/2단 + 간격 슬라이더 + 출력 옵션
- **모달**: 템플릿 선택, 삭제 확인

## 리디자인 목표

### 전체 패턴 — 하이브리드
- **Chrome (사이드바/상단바/툴바/모달 배경)**: **다크** (zinc-900, Linear/Notion 스타일)
- **컨텐츠 카드 (A4 프리뷰)**: **밝은 톤** (bg-white, 실제 인쇄물과 동일)
- **사이드 패널 (옵션)**: 다크 + 섹션 구분 명확

### 구체 변경
1. **사이드바** (왼쪽)
   - 폴더 아이콘 + 시험지 아이콘 구분 명확
   - 선택된 시험지 하이라이트 (cyan-500 left border)
   - 검색창 상단 고정
   - 시험지별 배지 (문제 수, 최근 수정일)

2. **상단바** (페이지 상단)
   - 시험지 제목 크게 (편집 가능)
   - 액션 아이콘 버튼 그룹화 (shadcn DropdownMenu 활용)
   - 페이지당 문제수 프리셋 → shadcn ToggleGroup 스타일

3. **탭** (이미 shadcn Tabs 적용됨)
   - 카운트 배지 추가 (시험지 20문제, 해설지 15/20 등)

4. **A4 프리뷰 카드**
   - 그림자 강화 (실제 종이 느낌)
   - 카드 상단에 작은 툴바 (편집 모드 토글, 템플릿 변경)
   - 페이지 번호 floating label

5. **우측 옵션 패널**
   - Accordion 형태 (섹션 접기/펼치기)
   - 1단/2단 → 아이콘 토글
   - 간격 슬라이더 → shadcn Slider
   - 출력 옵션 → checkbox 그룹 + 인쇄 버튼 큰 CTA

6. **일괄 해설 생성 버튼**
   - 진행률 표시 강화 (Progress bar 풀너비)
   - "서버에서 생성 중 3/20" 라이브 업데이트
   - 완료 시 토스트 알림

### 상호작용 개선
- 시험지 선택 → 프리뷰 슬라이드 인 애니메이션
- 편집 모드 토글 → 카드 테두리 컬러 변경
- 인쇄 버튼 클릭 → 확인 다이얼로그 (shadcn AlertDialog)
- 삭제 → AlertDialog (Dialog 아님)

### 접근성
- 탭 키보드 네비게이션
- 모달 포커스 트랩
- 아이콘만 있는 버튼에 aria-label

## 반드시 유지
- `EditableExamHeader` 컴포넌트 (A4 시험지 상단 정보 테이블)
- `ExamProblemRenderer` (문제 렌더)
- `MixedContentRenderer` (수식·이미지 혼합)
- KaTeX 수식 렌더
- `executePrint()` DOM 복제 방식 (인쇄 로직)
- 상태 관리 (unifiedMeta, problems, pages 등)

## 디자인 레퍼런스
- Linear (사이드바 + 메인 패턴)
- Figma (오른쪽 옵션 패널)
- Notion (밝은 컨텐츠 카드)
- 수학비서 (mathsecr.com) — 한국 학원 UI 감성

## 피할 것
- 전체 밝은 톤으로 전환 (작업 집중도 떨어짐)
- 여러 accent color (cyan 하나만)
- 일러스트 (진지한 교사 도구)
- 복잡한 애니메이션

## 출력 형식
Claude Code 핸드오프 번들. 기존 파일 구조 유지:
- `src/app/dashboard/exam-management/page.tsx`
- `src/components/ui/*` (shadcn)
- 기존 `EditableExamHeader.tsx`, `ExamProblemRenderer.tsx` 재사용
