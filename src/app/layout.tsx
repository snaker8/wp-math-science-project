import type { Metadata } from 'next';
import './globals.css';

import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: '과사람 수학 문제은행',
  description: '과사람 유사 수학 문제은행 SaaS 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
