// 루트 OG 썸네일(1200x630 PNG) 생성 — SVG → sharp 래스터.
//   @vercel/og 는 한글 폴더 경로 + Windows 에서 폰트 로드 실패(ERR_INVALID_URL)라 사용 불가.
//   정적 PNG(src/app/opengraph-image.png)로 고정 → Next 가 자동으로 og:image 연결.
//   문구 변경 시 이 스크립트 수정 후 `node scripts/gen-og-image.mjs` 재생성.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', 'app', 'opengraph-image.png');

const FONT = 'Malgun Gothic, sans-serif';
const TITLE = 'Math×Sci Bank';
const TAGLINE = '함께 만드는 수학·과학 문제은행 플랫폼';
const CHIPS = [
  { label: 'AI 정밀 채점', accent: '#22d3ee', w: 268 },
  { label: '완전무결 오답 루프', accent: '#818cf8', w: 350 },
  { label: '수학·과학 문제은행', accent: '#34d399', w: 348 },
];

function chip(x, c) {
  const h = 64, y = 446, r = h / 2;
  const dotCx = x + 34, cy = y + h / 2;
  const textX = x + 60, textY = cy + 9;
  return `
    <rect x="${x}" y="${y}" width="${c.w}" height="${h}" rx="${r}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    <circle cx="${dotCx}" cy="${cy}" r="9" fill="${c.accent}"/>
    <text x="${textX}" y="${textY}" font-family="${FONT}" font-size="27" font-weight="700" fill="#e5e7eb">${c.label}</text>`;
}

let cx = 84;
const chipsSvg = CHIPS.map((c) => { const s = chip(cx, c); cx += c.w + 22; return s; }).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g1" cx="0%" cy="0%" r="60%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="100%" cy="100%" r="65%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#6366f1"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#080b16"/>
  <rect width="1200" height="630" fill="url(#g1)"/>
  <rect width="1200" height="630" fill="url(#g2)"/>

  <!-- 브랜드 마크 + 이름 -->
  <rect x="84" y="120" width="60" height="60" rx="16" fill="url(#mark)"/>
  <text x="168" y="176" font-family="${FONT}" font-size="86" font-weight="800" fill="#ffffff" letter-spacing="-2">${TITLE}</text>

  <!-- 태그라인 -->
  <rect x="84" y="296" width="40" height="6" rx="3" fill="url(#mark)"/>
  <text x="140" y="316" font-family="${FONT}" font-size="44" font-weight="600" fill="#cbd5e1">${TAGLINE}</text>

  <!-- 특징 칩 -->
  ${chipsSvg}
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log('OG image written:', OUT);
