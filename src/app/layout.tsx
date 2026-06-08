import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { RootProviders } from '@/components/providers/RootProviders';

// ★ og:image 절대 URL 을 "프로덕션 도메인" 으로 고정 (share OG 와 동일 패턴 — PR #279 학습).
//   미설정 시 Next 가 배포별 보호 URL(*-xxxx.vercel.app, 401)을 써서 카톡 등 크롤러가
//   썸네일을 못 가져옴. 카드 이미지는 같은 폴더 opengraph-image.tsx 를 Next 가 자동 연결.
const PROD_HOST = process.env.VERCEL_PROJECT_PRODUCTION_URL || 'wp-math-science-project.vercel.app';
const SITE_TITLE = 'Math×Sci Bank';
const SITE_DESCRIPTION = '함께 만드는 수학·과학 문제은행 플랫폼';

export const metadata: Metadata = {
  metadataBase: new URL(`https://${PROD_HOST}`),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_TITLE,
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
