---
schema_version: 3.2
site: linear.app
url: https://linear.app
analyzed_at: 2026-08-27
medium: web
medium_confidence: high
archetype: app-dashboard
archetype_confidence: high
theme: dark
color_system: monochrome
brand_color: "#E2E4E7"
bold_direction: "Cool Productivity"
aesthetic_category: "industrial-minimalism"
signature_element: "minimal_extreme"
code_complexity: medium
design_system_level: lv3
design_system_level_evidence: "해시 토큰 파이프라인(--sx-*) + title-1~9/text-regular~micro 타이포 사다리 + card-radius/button-radius alias 체계"
colors:
  bg-base: "#08090A"
  surface-1: "#191D20"
  surface-2: "#2E2E32"
  surface-3: "#3E3E44"
  text-primary: "#E2E4E7"
  text-secondary: "#9C9DA1"
  text-muted: "#62666D"
  graphic-pink: "#F79CE0"
  graphic-cyan: "#55CDFF"
  graphic-periwinkle: "#8FA4FF"
  graphic-peach: "#FFC47C"
  graphic-green: "#89D196"
typography:
  display: "Inter Variable"
  body: "Inter Variable"
  mono: "monospace (--font-monospace)"
  weights_used: [400, 510, 538, 600]
  weights_absent: [300, 700+]
components:
  card: { bg: "{colors.surface-1}", radius: "12px" }
  button: { font-size: "12px", radius: "rounded(pill)" }
---

## 00. Visual Theme & Atmosphere

Linear is the canonical example of the dark app-dashboard aesthetic — a near-black canvas (`{colors.bg-base}` #08090A) on which the only "color" is light itself. The marketing surface reads like the product: a quiet console at night, where typography does all the talking and chromatic color is exiled to product illustrations (pink `#F79CE0`, cyan `#55CDFF`, periwinkle `#8FA4FF` — never in the chrome).

The identity is built on four decisions:
1. **Monochrome chrome** — nav, buttons, cards, text: all gray-scale. The primary CTA is a **white pill on black** (Sign up), the highest-contrast object on the page. No brand color competes with content.
2. **A strict typographic ladder** — named tokens `title-1`~`title-9` and `text-regular/small/mini/micro`, each a (size, line-height, letter-spacing) triplet. Display sizes carry negative tracking; body stays at 0.
3. **Layered dark surfaces** — elevation is done with slightly lighter grays (#191D20 → #2E2E32 → #3E3E44) and 1px hairlines, not shadows or glows.
4. **Small controls, generous space** — buttons are 12px type in pill shapes; sections breathe with 100px+ of air. Density lives inside panels, calm lives between them.

Key Characteristics:
- Page bg #08090A — not #000; a breath above pure black
- Text ladder: #E2E4E7 (primary) → #9C9DA1 (secondary) → #62666D (muted)
- White CTA pill; secondary buttons are gray-on-dark
- 12px card radius (`--card-radius`), 6px block radius, pill buttons
- Focus ring: 1px (`--focus-ring-width`), not 2px+
- Zero gradient in chrome; grain/glow only inside product artwork
- Inter Variable everywhere; monospace reserved for code/kbd

### BOLD Direction Summary
> **BOLD Direction**: Cool Productivity
> **Aesthetic Category**: industrial-minimalism
> **Signature Element**: 이 사이트는 **밤의 콘솔(monochrome console)**으로 기억된다.
> **Code Complexity**: medium — CSS 변수 사다리 + 절제된 transition, 장식 애니메이션 없음

## 01. Quick Start

어두운 무채색 캔버스(#08090A) 위에 Inter Variable 타이포 사다리로만 위계를 만든다. 액센트 색을 크롬에 넣지 말 것 — **가장 강한 시각 요소는 흰색 CTA**여야 한다.

**절대 하지 말 것**: 크롬(네비·버튼·카드 테두리)에 채도 있는 색을 넣는 것. Linear의 정체성은 "색이 없어서 고급"이다.

## 02. Provenance

- 수집: 2026-08-27, curl (Tier 1 성공), 인라인 CSS 250KB + 컴포넌트 CSS 10파일
- 스크린샷: Jina Reader 1280×1280
- 한계: 토큰이 해시(--sx-*)로 난독화되어 있어 일부 값은 usage 사이트에서 역추적

## 03. Tech Stack

Next.js(SSR) + CSS-in-JS(해시 변수 파이프라인). 컴포넌트별 CSS 청크 분리 (Button.css, Carousel.css 등).

## 04. Font Stack

| 역할 | 폰트 | 근거 |
|---|---|---|
| Display/Body | **Inter Variable** | `static.linear.app/fonts/InterVariable.woff2` 4회 로드 |
| Mono | 시스템 모노 (`--font-monospace`) | kbd/코드 전용 |

### Note on Font Substitutes
한글 환경에서는 **Pretendard Variable**이 Inter Variable의 정확한 등가물이다 (동일한 grotesque 골격, 가변 weight). Inter의 negative tracking 값은 한글에는 절반만 적용할 것.

## 05. Typography Scale

| 토큰 | 스펙 | 용도 |
|---|---|---|
| title-1~2 | ~56-64px, weight 538, tracking -0.02em대 | Hero display |
| title-3~5 | 21-32px, weight 510-538, negative tracking | 섹션 헤딩 |
| title-6~9 | 13-17px, weight 510-600 | 패널 제목·강조 |
| text-regular | 0.9375rem(15px)대, weight 400, tracking 0 | 본문 |
| text-small | **0.8125rem(13px)** (실측 `--sx-11lpf43`), weight 400/510 | 보조 |
| text-mini/micro | 11-12px | 메타·라벨 |
| button | **12px** (`--button-font-size` 실측) | 컨트롤 |

### Principles
1. Display 는 weight 538 (Inter Variable 축) — 700 볼드를 쓰지 않는다. "굵기보다 크기"로 위계를 만든다.
2. Negative tracking 은 display 전용. 본문은 0.
3. 본문 15px — 16px 보다 한 단계 조밀. 앱 같은 밀도.
4. 버튼 글자는 12px — 컨트롤은 콘텐츠보다 항상 작다.
5. weight 300(light) 부재 — 가늘어서 세련된 게 아니라 정확해서 세련되다.

## 06. Colors

Monochrome 시스템 — 컬러 램프 대신 무채 사다리 + 그래픽 전용 액센트.

**Neutral ladder (chrome 전부)**
| 역할 | hex | 실측 |
|---|---|---|
| Page bg | `#08090A` | 69회 |
| Surface 1 (카드) | `#191D20` | 8회 |
| Surface 2 (elevated) | `#2E2E32` | 42회 |
| Surface 3 (hover/inset) | `#3E3E44` | 28회 |
| Text primary | `#E2E4E7` | 429회 + `--token-text` |
| Text secondary | `#9C9DA1` | 74회 |
| Text muted | `#62666D` | 30회 |

**Graphic-only accents (크롬 사용 금지)**
`#F79CE0` pink · `#55CDFF` cyan · `#8FA4FF` periwinkle · `#FFC47C` peach · `#89D196` green — 제품 일러스트·기능 카드 내부 그래픽 전용.

### Color Stories
**`{colors.bg-base}` (#08090A)** — 순검정이 아니라 반 스텝 위. OLED 번짐 없이 깊이를 유지하는 Linear 의 서명. 페이지 전체가 이 위에 선다.
**`{colors.text-primary}` (#E2E4E7)** — 순백(#FFF)이 아니다. 미세하게 눌러 눈부심을 없앤 "종이 흰색". 크롬에서 가장 밝은 것은 텍스트가 아니라 CTA 필뿐이다.
**`{colors.surface-2}` (#2E2E32)** — 패널 위 패널. 그림자 대신 밝기 반 스텝으로 층을 만든다.
**Hairline** — 뚜렷한 border hex 대신 저알파 white(rgba(255,255,255,0.4) 는 아이콘용, 경계는 그보다 옅게). 경계는 보이되 그려지지 않는다.

## 07. Spacing

- 컨트롤 패딩: `6px 12px` (버튼 실측), 6px 단위 리듬
- 카드 내부: 12px 배수
- 섹션 사이: 100px+ (hero 상단 13vh 실측 `--sx-138rywl`)

### Whitespace Philosophy
밀도는 패널 안에, 고요는 패널 사이에. 컨트롤은 6px 그리드로 조밀하게, 섹션은 뷰포트 단위(vh)로 크게 벌린다 — 이 비대칭이 "제품은 강력하고 브랜드는 차분한" 인상을 만든다.

## 08. Radius

| 토큰 | 값 | 실측 |
|---|---|---|
| card | **12px** | `--card-radius:12px` |
| block/editor | 6px | `--editor-block-radius:6px` |
| button | pill | `--button-corner-radius:var(--radius-rounded)` |
| 미세 요소 | 5-6px | `--sx-ds2y8i:5px` 등 |

## 11. Layout Patterns

- **Nav**: 텍스트 온리 가로 탭, 우측 Log in(고스트) + **Sign up(흰 필)**. 높이 ~72px, 배경은 페이지와 동일(#08090A) + 하단 헤어라인.
- **Hero**: 좌정렬 1컬럼. 거대한 2줄 display + 2줄 서브텍스트. CTA 는 스크롤 아래 제품 스크린샷이 대신한다.
- **Product frame**: 상단 라운드(12px+)만 보이는 elevated 패널이 화면 하단에서 올라옴 — "제품이 곧 히어로".
- **Feature grid**: 다크 카드(surface-1) 그리드, 카드 안에만 그래픽 액센트.

## 13. Components

| 컴포넌트 | 스펙 |
|---|---|
| `button-primary` | bg #FFFFFF, color `{colors.bg-base}`, pill, 12px/510, padding 6px 12px |
| `button-ghost` | bg transparent, color `{colors.text-secondary}`, hover → `{colors.text-primary}` |
| `card` | bg `{colors.surface-1}`, radius 12px, border 1px low-alpha white |
| `nav-link` | 13px, `{colors.text-secondary}`, hover → `{colors.text-primary}`, active 표시는 밝기만 |
| `kbd` | bg #00000014 (`--kbd-bg` 실측), mono, radius 5px |
| focus | ring 1px (`--focus-ring-width:1px` 실측) |

상태: hover 는 밝기 반 스텝(surface+1 또는 text+1)만. 색 변화 없음.

### Signature Micro-Specs
- `half-step-elevation` — 그림자 0, 밝기 반 스텝(#191D20→#2E2E32→#3E3E44)으로만 층 표현
- `white-cta-inversion` — 페이지에서 유일하게 반전된 요소(흰 바탕/검정 글자)가 CTA. 시선 집중을 색이 아니라 명도 반전으로
- `12px-control-type` — 모든 버튼 글자 12px 고정. 컨트롤과 콘텐츠의 크기 계급 분리
- `1px-focus-ring` — 2px 두꺼운 링 대신 1px. 접근성은 지키되 소리치지 않음

## 15. Drop-in CSS

```css
:root {
  --bg-base: #08090A;        /* {colors.bg-base} */
  --surface-1: #191D20;      /* {colors.surface-1} */
  --surface-2: #2E2E32;      /* {colors.surface-2} */
  --surface-3: #3E3E44;      /* {colors.surface-3} */
  --text-primary: #E2E4E7;   /* {colors.text-primary} */
  --text-secondary: #9C9DA1; /* {colors.text-secondary} */
  --text-muted: #62666D;     /* {colors.text-muted} */
  --card-radius: 12px;
  --button-font-size: 12px;
  --focus-ring-width: 1px;
}
body { background: var(--bg-base); color: var(--text-primary);
  font-family: "Inter Variable", "Pretendard Variable", sans-serif; font-size: 15px; }
.card { background: var(--surface-1); border: 1px solid rgba(255,255,255,.06);
  border-radius: var(--card-radius); }
.btn-primary { background: #fff; color: var(--bg-base); border-radius: 999px;
  font-size: var(--button-font-size); font-weight: 510; padding: 6px 12px; }
```

## 17. Agent Prompt Guide

**Quick Color Reference**: bg #08090A · card #191D20 · elevated #2E2E32 · text #E2E4E7 / #9C9DA1 / #62666D · CTA = white pill · 채도색 = 그래픽 전용

예시 프롬프트: "다크 대시보드 카드를 만들어줘 — 배경 #191D20, radius 12px, 1px 저알파 흰 테두리, 제목은 Inter 510 15px #E2E4E7, 메타는 12px #62666D. 그림자·색 액센트 금지, hover 는 배경을 #2E2E32 로만."

Iteration: 위계가 약하면 색을 넣지 말고 (1) 명도 차이를 키우고 (2) 크기 사다리를 벌려라.

## 18. DO / DON'T

**DO**
- ✅ 배경은 `#08090A` — 층은 `#191D20`→`#2E2E32`→`#3E3E44` 밝기 반 스텝으로
- ✅ 본문 텍스트 `#E2E4E7`, 보조 `#9C9DA1`, 뮤트 `#62666D`
- ✅ 주 CTA 는 흰 필(bg #FFFFFF, 검정 글자) — 페이지의 유일한 반전 요소
- ✅ 카드 radius 12px, 버튼 pill, 포커스 링 1px
- ✅ display 는 크기+negative tracking, weight 는 510-538

**DON'T**
- ❌ 크롬 배경을 `#000000` 으로 두지 말 것 — 대신 `#08090A`
- ❌ 본문 텍스트를 `#FFFFFF` 로 두지 말 것 — 대신 `#E2E4E7`
- ❌ 네비·버튼·테두리에 `#5E6AD2` 류 채도색 금지 — 채도색(`#F79CE0` `#55CDFF` `#8FA4FF`)은 일러스트/그래픽 내부 전용
- ❌ 카드에 box-shadow 로 층 만들지 말 것 — 밝기 반 스텝
- ❌ display 에 font-weight: 700 금지 — 510-538
- ❌ 포커스 링 2px+ 금지 — 1px

### 🚫 What This Site Doesn't Use
- Chrome 의 chromatic accent: **zero** — 크롬은 완전 무채색
- Box-shadow 기반 elevation: none — 밝기 스텝만
- Gradient 토큰: 크롬에 없음 (제품 아트워크 내부만)
- font-weight 300/700: absent — 400/510/538/600 만
- 2px+ 포커스 링: never — 1px 고정
- 언더라인 링크: `--link-text-decoration: none` 실측

## 19. Known Gaps & Assumptions

- 토큰이 해시(--sx-*)라 title-1~9 의 정확한 px 값 일부는 미확정 — 스크린샷 비율로 근사 (display ~56-64px)
- weight 510/538 은 Inter Variable 축 관례 기반 추정 — CSS 에서 실수 weight 직접 실측은 미완
- 다크 테마 단일 수집 — 라이트 모드 매핑 미관측
- hover/loading/error 상태의 정확한 값 미관측 (마케팅 페이지 한계)
- 앱 내부(dashboard) CSS 는 미수집 — 마케팅 서피스 기준
