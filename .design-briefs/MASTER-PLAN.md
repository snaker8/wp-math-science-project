# 과사람 수학 프로그램 전체 리디자인 마스터 플랜

**목표:** em-management 페이지에서 확립한 **Chrome 디자인 시스템**을 앱 전체에 통일되게 적용.

## 완료 ✅
- [x] **Chrome 디자인 토큰 전역화** (`globals.css` + `tailwind.config.ts`)
- [x] **시험지 관리** (`/dashboard/exam-management`) — Claude Design 번들 적용 완료
- [x] **클라우드 시험지 편집** (`/dashboard/cloud/[examId]`) — Claude Design 번들 적용 완료

## 진행 대상 (우선순위순)

### 1. PDF 분석 3패널 (`/dashboard/workflow/analyze/[jobId]`) 🎯 NEXT
- **브리프**: `.design-briefs/pdf-analyze.md` ✅ 작성 완료
- **상태**: Claude Design 번들 대기 중

### (보류) 클라우드 시험지 편집
- **브리프**: `.design-briefs/cloud-exam-editor.md` ✅
- **상태**: ✅ 완료
- **예상 소요**: 20~40분 (번들 export + 적용)
- **핵심 변화**:
  - em-shell 3패널 그리드 도입
  - 좌측 문제 썸네일 사이드바 신규
  - 우측 도구 옵션 패널 신규
  - 기능적 색상 코딩 유지 (난이도/영역/도형액션)

### 2. 시험지 목록 (`/dashboard/cloud`)
- **브리프**: `.design-briefs/cloud-list.md` ✅ 작성 완료
- **상태**: Claude Design 번들 대기 중

### 3. 문제은행 (`/dashboard/repository`)
- **브리프**: `.design-briefs/repository.md` ✅ 작성 완료
- **상태**: Claude Design 번들 대기 중

### 4. 대시보드 홈 (`/dashboard`)
- **브리프**: `.design-briefs/dashboard-home.md` ✅ 작성 완료
- **상태**: Claude Design 번들 대기 중

### 6. 학생 페이지 (`/student/*`)
- **브리프**: `.design-briefs/student-dashboard.md` ✅ 작성 완료 (이전 세션)
- **상태**: Claude Design 번들 대기 중
- **특수 조건**: 학생용은 **밝은 톤** (Duolingo + Notion 느낌)
- **Chrome 다크 시스템과는 별도** — `paper` 팔레트 기반 light theme

### 7. 기타 페이지
- `/dashboard/cloud/[examId]/groups` — 그룹 관리
- `/dashboard/settings` — 설정 페이지
- 로그인/회원가입 페이지

## Claude Design 사용 절차

각 페이지별로:

1. **브리프 파일 복사**
   ```
   .design-briefs/cloud-exam-editor.md 내용 복사
   ```

2. **Claude Design(claude.ai/design) 접속** → 새 프로젝트 생성

3. **브리프 붙여넣기** → 디자인 프로토타입 생성 대기

4. **Export** 버튼 → URL 받기 (예: `api.anthropic.com/v1/design/h/...`)

5. **Claude Code에 URL 전달** → 제가 번들 분석 + 코드 적용

## 디자인 토큰 체크리스트

모든 페이지에 다음 원칙 적용:

### Chrome (다크 UI)
- 최외곽 배경: `bg-chrome-bg` (#0b0d12)
- 사이드바/상단바: `bg-chrome-surface` (#0f1117)
- 카드: `bg-chrome-card` (#1a1d28)
- 호버/input: `bg-chrome-raised` (#232736)

### 텍스트 계층
- 제목: `text-chrome-fg-1` (#f1f5f9)
- 본문: `text-chrome-fg-2` (#cbd5e1)
- 설명: `text-chrome-fg-3` (#94a3b8)
- 힌트: `text-chrome-fg-4` (#64748b)

### 보더
- 기본: `border-chrome-border` (rgba 0.12)
- 미묘함: `border-chrome-border-sub` (rgba 0.06)
- 강조: `border-chrome-border-str` (rgba 0.2)

### 액센트
- **Primary** (CTA/선택): `brand-indigo-500/600`
- **Secondary** (보조): `brand-indigo-300/400`
- **보완색**: `brand-cyan-400` (그라데이션 end)
- **기능적 색**: 난이도/영역/상태는 기존 색상 유지 (의미 있음)

### 모션
- 듀레이션: `duration-fast` (180ms)
- 이징: `ease-out-expo` (cubic-bezier(0.16, 1, 0.3, 1))

## 일정 (예상)

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| 완료 | 토큰 전역화 + em-management | ✅ |
| 1 | 클라우드 편집 브리프 → 번들 적용 | 40분 |
| 2 | 분석 3패널 브리프 → 번들 적용 | 30분 |
| 3 | 시험지 목록 브리프 → 번들 적용 | 20분 |
| 4 | 문제은행 브리프 → 번들 적용 | 30분 |
| 5 | 대시보드 홈 브리프 → 번들 적용 | 25분 |
| 6 | 학생 페이지 번들 적용 (이미 브리프 있음) | 40분 |
| **합계** | | **~3시간 15분** |

## 지금 바로 할 일

1. `.design-briefs/cloud-exam-editor.md` 내용 복사
2. Claude Design 열고 새 프로젝트 시작
3. 프롬프트에 브리프 붙여넣기
4. 프로토타입 생성 완료 후 Export
5. URL 저에게 전달 → 적용 시작
