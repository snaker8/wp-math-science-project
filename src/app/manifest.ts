// ============================================================================
// PWA 매니페스트 (2026-08-28) — 크롬 "앱으로 설치 / 바로가기 만들기" 대응.
// 설치하면 주소창 없는 창으로 뜨고, 작업표시줄·바탕화면 아이콘이 브랜드 마크가 된다.
// 아이콘은 icon.tsx / apple-icon.tsx (Next 파일 규약)를 그대로 참조.
// ============================================================================

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Math×Sci Bank',
    short_name: 'M×S Bank',
    description: '함께 만드는 수학·과학 문제은행 플랫폼',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#08090A',
    theme_color: '#08090A',
    lang: 'ko',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
  };
}
