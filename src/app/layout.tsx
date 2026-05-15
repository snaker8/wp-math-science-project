import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import { RootProviders } from '@/components/providers/RootProviders';

export const metadata: Metadata = {
  title: 'Math×Sci Bank',
  description: '가맹 학원이 함께 만드는 수학·과학 문제은행 플랫폼',
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
