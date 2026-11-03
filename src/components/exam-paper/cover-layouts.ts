// 공용 표지 이미지별 글자 디자인 (2026-11-03 대표):
//   "올려진 이미지에 기본적으로 레이아웃이 있는 것은 거기에 텍스트가 들어가게"
//   "일관되게 이미지 가리면서 텍스트를 넣으면 안 어울리잖아" · "너무 특색 없이 막 넣은 거 아니가"
//   "원본 던져준 거 참고해서 디자인 감각 올려라" · "기본적으로 원본 레이아웃은 지키고"
//   → 원본 표지(차수학 표지 23장)에서 글자가 있던 **자리·색·크기·굵기**를 그대로 잰 값.
//     원본 제목 자리 = 표지 제목, 둘째 줄 = 부제목, 셋째 줄 = 정보 줄, 「엄궁차수학」 자리 = 학원명.
//   좌표는 이미지(=A4, 슬롯 표지는 이미지를 A4 에 꽉 맞춰 늘림) 대비 %. size 는 794px 폭 기준 px.
//   여기 없는 이미지(센터가 올린 것 등)는 종전처럼 아래 띠.
export type CoverField = 'title' | 'subtitle' | 'info' | 'academy' | 'note' | 'static';
export type CoverEl = {
  field: CoverField;
  /** field='static' 일 때 고정 문구 (원본 디자인의 장식 글자, 예: MATH) */
  text?: string;
  /** anchor 기준 가로 위치 % — left=왼쪽 끝, center=가운데, right=오른쪽 끝 */
  x: number;
  /** 위쪽 끝 % */
  y: number;
  anchor: 'left' | 'center' | 'right';
  /** 줄바꿈 폭 % (없으면 한 줄) */
  w?: number;
  size: number;
  weight: number;
  color: string;
  ls?: string;
  lh?: number;
  /** 세로쓰기 (고양이 표지의 학원명) */
  vertical?: boolean;
  /** 글자 뒤 색 막대 (예상적중 표지의 부제목) — 폭 w 전체 */
  bar?: string;
  /** 글자 뒤 작은 칩 (원본 로고 자리) */
  chip?: string;
  /** 흰 테두리 글자 (그림 위에 겹치는 학원명) */
  stroke?: string;
  /** 원본 글꼴 느낌 — 없으면 Pretendard. Google Fonts 로 불러온다 (COVER_FONT_HREF) */
  font?: CoverFont;
};
export type CoverFont = 'jua' | 'blackhan' | 'gowun';
export const COVER_FONT_FAMILY: Record<CoverFont, string> = {
  jua: "'Jua', 'Pretendard', sans-serif",
  blackhan: "'Black Han Sans', 'Pretendard', sans-serif",
  gowun: "'Gowun Dodum', 'Pretendard', sans-serif",
};
export const COVER_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Gowun+Dodum&family=Jua&display=swap';
export type CoverLayout = {
  els: CoverEl[];
  /** 무늬가 빽빽한 그림 — 원본처럼 테두리 있는 둥근 흰 라벨을 깐다 */
  card?: { x: number; y: number; w: number; h: number; border: string };
};

const BOOK = (title: string, sub: string, ty: number): CoverLayout => ({
  els: [
    { field: 'title', x: 5.7, y: ty, anchor: 'left', w: 88, size: 32, weight: 400, color: title, font: 'jua' },
    { field: 'subtitle', x: 5.8, y: ty + 5.6, anchor: 'left', w: 88, size: 14, weight: 700, color: sub },
    { field: 'info', x: 5.8, y: ty + 8.6, anchor: 'left', w: 88, size: 11, weight: 500, color: sub },
    { field: 'academy', x: 50, y: 92.6, anchor: 'center', size: 24, weight: 400, color: '#111', font: 'jua' },
  ],
});
const BASIC = (title: string): CoverLayout => ({
  els: [
    { field: 'title', x: 10, y: 18.2, anchor: 'left', w: 82, size: 46, weight: 300, color: title, ls: '-0.01em' },
    { field: 'subtitle', x: 10.2, y: 25.6, anchor: 'left', w: 82, size: 16, weight: 400, color: '#555' },
    { field: 'info', x: 10.2, y: 29.4, anchor: 'left', w: 82, size: 12, weight: 400, color: '#777' },
    { field: 'academy', x: 86, y: 93.8, anchor: 'center', size: 12, weight: 600, color: '#333' },
  ],
});
const FRAME = (bar: string): CoverLayout => ({
  els: [
    { field: 'title', x: 51.8, y: 26, anchor: 'center', w: 66, size: 84, weight: 200, color: '#fff', lh: 1.12, ls: '0.04em' },
    { field: 'subtitle', x: 14.3, y: 74.2, anchor: 'left', w: 75, size: 17, weight: 500, color: '#fff', bar },
    { field: 'info', x: 51.8, y: 80.8, anchor: 'center', w: 75, size: 17, weight: 300, color: 'rgba(255,255,255,.92)' },
    { field: 'academy', x: 94, y: 94.4, anchor: 'right', size: 18, weight: 700, color: '#fff' },
  ],
});
const MATH = (): CoverLayout => ({
  els: [
    { field: 'title', x: 93, y: 54.4, anchor: 'right', w: 70, size: 26, weight: 600, color: '#111' },
    { field: 'subtitle', x: 93, y: 62.8, anchor: 'right', w: 70, size: 24, weight: 300, color: '#9a9a9a' },
    { field: 'static', text: '✦ MATH', x: 93, y: 70.4, anchor: 'right', size: 50, weight: 900, color: '#111', ls: '0.01em' },
    { field: 'info', x: 93, y: 82.2, anchor: 'right', w: 70, size: 12, weight: 500, color: '#666' },
    { field: 'academy', x: 93, y: 90.6, anchor: 'right', size: 14, weight: 800, color: '#3a2a10', chip: '#f39a1e' },
  ],
});
const GEOMETRY = (brand: string): CoverLayout => ({
  els: [
    // 원본 맨 위 큰 굵은 색 글자(브랜드) 자리 → 학원명
    { field: 'academy', x: 8, y: 13.6, anchor: 'left', w: 86, size: 58, weight: 400, color: brand, lh: 1.1, font: 'blackhan' },
    { field: 'title', x: 95.5, y: 74.8, anchor: 'right', w: 70, size: 26, weight: 600, color: '#111' },
    { field: 'subtitle', x: 95.5, y: 82.6, anchor: 'right', w: 70, size: 15, weight: 300, color: '#9a9a9a' },
    { field: 'info', x: 95.5, y: 87, anchor: 'right', w: 70, size: 12, weight: 400, color: '#888' },
  ],
});
const PATTERN = (border: string, sub: string): CoverLayout => ({
  card: { x: 3, y: 7.6, w: 94, h: 28.4, border },
  els: [
    { field: 'title', x: 50, y: 12.6, anchor: 'center', w: 84, size: 34, weight: 400, color: '#f0892a', font: 'jua' },
    { field: 'subtitle', x: 50, y: 20.8, anchor: 'center', w: 84, size: 14, weight: 600, color: sub },
    { field: 'info', x: 50, y: 24.2, anchor: 'center', w: 84, size: 12, weight: 500, color: '#777' },
    { field: 'academy', x: 50, y: 28, anchor: 'center', size: 22, weight: 400, color: '#222', font: 'jua' },
  ],
});
const KITTEN = (c: string): CoverLayout => ({
  els: [
    { field: 'subtitle', x: 10.7, y: 11.4, anchor: 'left', w: 80, size: 24, weight: 400, color: c, font: 'jua' },
    { field: 'title', x: 10.7, y: 17.6, anchor: 'left', w: 52, size: 56, weight: 400, color: c, lh: 1.12, font: 'blackhan' },
    { field: 'info', x: 10.9, y: 45.6, anchor: 'left', w: 60, size: 13, weight: 500, color: c },
    { field: 'academy', x: 8.3, y: 72, anchor: 'left', size: 24, weight: 400, color: c, vertical: true, ls: '0.08em', font: 'jua' },
  ],
});

/** 키 = 공용 표지 파일 이름(타임스탬프·확장자 뺀 것) */
export const COVER_LAYOUTS: Record<string, CoverLayout> = {
  'green-window-cat': {
    els: [
      { field: 'title', x: 50, y: 12.4, anchor: 'center', w: 86, size: 40, weight: 400, color: '#1d6b57', font: 'gowun' },
      { field: 'subtitle', x: 50, y: 20.4, anchor: 'center', w: 86, size: 15, weight: 400, color: '#3c7c6c' },
      { field: 'info', x: 50, y: 23.4, anchor: 'center', w: 86, size: 12, weight: 400, color: '#5b8f82' },
      { field: 'academy', x: 50, y: 90.6, anchor: 'center', size: 24, weight: 400, color: '#1d6b57', font: 'gowun' },
    ],
  },
  'book-house-yellow': BOOK('#d6246e', '#1a1a1a', 5.2),
  'book-house-yellow-2': BOOK('#d6246e', '#1a1a1a', 8.6),
  'book-house-green': BOOK('#8a3fd1', '#5b2a8f', 10.2),
  'math-symbols': {
    els: [
      { field: 'title', x: 5, y: 11.6, anchor: 'left', w: 88, size: 46, weight: 500, color: '#34495e', ls: '-0.01em' },
      { field: 'subtitle', x: 5.2, y: 19.6, anchor: 'left', w: 88, size: 17, weight: 700, color: '#e8742a' },
      { field: 'info', x: 5.2, y: 23.2, anchor: 'left', w: 88, size: 12, weight: 500, color: '#7a8796' },
      { field: 'academy', x: 73, y: 88, anchor: 'center', size: 34, weight: 400, color: '#111', stroke: '#fff', font: 'blackhan' },
    ],
  },
  'gradient-M': {
    els: [
      { field: 'title', x: 93, y: 71.4, anchor: 'right', w: 60, size: 40, weight: 700, color: '#111', ls: '-0.02em' },
      { field: 'subtitle', x: 93, y: 78, anchor: 'right', w: 60, size: 12, weight: 400, color: '#777' },
      { field: 'info', x: 93, y: 80.6, anchor: 'right', w: 60, size: 11, weight: 400, color: '#999' },
      { field: 'academy', x: 94, y: 93, anchor: 'right', size: 17, weight: 700, color: '#111' },
    ],
  },
  'crown-shield': {
    els: [
      { field: 'title', x: 50, y: 40.6, anchor: 'center', w: 40, size: 28, weight: 600, color: '#fff', ls: '0.01em' },
      { field: 'subtitle', x: 50, y: 47.6, anchor: 'center', w: 40, size: 11, weight: 400, color: 'rgba(255,255,255,.85)' },
      { field: 'info', x: 50, y: 50.4, anchor: 'center', w: 40, size: 10, weight: 400, color: 'rgba(255,255,255,.7)' },
      { field: 'academy', x: 50, y: 91.6, anchor: 'center', size: 13, weight: 500, color: '#fff', ls: '0.06em' },
    ],
  },
  'symbol-tiles-gray': BASIC('#555'),
  'symbol-tiles-pink': BASIC('#e36b6b'),
  'symbol-tiles-blue': BASIC('#2f78c4'),
  'frame-pink-blue': FRAME('#ec7c7c'),
  'frame-blue-purple': FRAME('#2b45a8'),
  'MATH-blocks-blue': MATH(),
  'MATH-blocks-green': MATH(),
  'MATH-blocks-pink': MATH(),
  'geometry-grid-1': GEOMETRY('#f2c200'),
  'geometry-grid-2': GEOMETRY('#e3262e'),
  'geometry-grid-3': GEOMETRY('#14a24b'),
  'lemon-pattern': PATTERN('#e9b949', '#5a9a3a'),
  'peach-pattern': PATTERN('#f2a0a0', '#5a9a3a'),
  'avocado-pattern': PATTERN('#9cbf5a', '#5a9a3a'),
  'kitten-blue': KITTEN('#2f8fe0'),
  'kitten-purple': KITTEN('#8a4fc9'),
};

/** 표지 이미지 URL → 글자 디자인 (공용 폴더 이미지만) */
export function coverLayoutFor(imageUrl: string | null | undefined): CoverLayout | null {
  if (!imageUrl) return null;
  const m = /\/uploads\/covers\/common\/\d{13}-([A-Za-z0-9_-]+)\.(?:webp|png|jpe?g)(?:\?|$)/.exec(imageUrl);
  return (m && COVER_LAYOUTS[m[1]]) || null;
}
