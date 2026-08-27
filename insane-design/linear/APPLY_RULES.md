# 디자인 스윕 변환 규칙 (Linear 시스템 — insane-design/linear/design.md 요약)

대상: 크롬(UI 뼈대 — 네비·버튼·카드·뱃지·탭·보더·배경)의 원색 하드코딩 제거.

## 변환 표

| 발견 | 변환 |
|---|---|
| `bg-indigo-600/500 hover:bg-indigo-500/400` 주 액션 버튼 | `rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200` (화면당 주 CTA 1개만. 나머지 버튼은 고스트/무채) |
| 보조 버튼의 indigo/violet/cyan/blue 계열 | `border border-white/[.08] bg-white/[.04] text-content-secondary hover:bg-white/[.06] hover:text-content-primary` |
| 활성 탭/선택 상태 `bg-{색}-500/15 text-{색}-300 border-{색}-500/40` | `border border-white/[.14] bg-white/[.08] text-content-primary` |
| 정보성 칩/뱃지 (개수·메타·카테고리) 채도색 | `border border-white/[.08] bg-white/[.04] text-content-secondary` (+숫자는 `tabular-nums`) |
| 제목/아이콘 장식용 색 (`text-indigo-400` 등 패널 제목 옆) | 아이콘 제거 또는 `text-content-tertiary` |
| `bg-[#1a1d28]`, `#0b0d12`, `rgba(148,163,184,…)` slate 하드코딩 | 토큰: `bg-surface-card` / `var(--bg-surface)` / `border-white/[.09]` |
| 텍스트 `text-white` (크롬) | `text-content-primary` |
| 이모지 (크롬 라벨·탭·뱃지) | 제거 — 구분은 텍스트가 담당 |
| 그라데이션 배너/헤더 (`bg-gradient-to-r from-indigo…`) | `border-b border-white/[.08] bg-white/[.03]` |
| 두 줄로 꺾이는 버튼/라벨 | `whitespace-nowrap` 추가 |

## 유지 (건드리지 말 것)

- **시맨틱**: emerald=성공/정상, red/rose=위험/삭제/오답, amber=경고/미처리 — 상태 의미가 있으면 유지
- **데이터 그래픽**: 차트·난이도 바·히트맵·점수 색·정답률 색 — 채도 유지
- **인쇄물/종이 컴포넌트** (paper/ink 토큰, A4 미리보기) — 라이트 종이 팔레트 유지
- **로직·핸들러·구조·상태** — className 외 코드 변경 금지
- KaTeX/수식/렌더러 관련 스타일 — 절대 건드리지 말 것

## 검증 (필수)

1. `npx tsc --noEmit` 통과
2. `node scripts/check-design-tokens.mjs` — 담당 파일 카운트가 줄었는지 확인 (baseline 갱신은 하지 말 것 — 조율자가 일괄)
3. 애매하면 바꾸지 말고 보고에 남길 것 (과잉 변환 금지 — 시맨틱 오인이 최악)
