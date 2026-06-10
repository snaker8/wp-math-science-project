// /dashboard/lessons 라우트 자체 레이아웃 — 베이지 + 골드 시그니처 (homeroom 포팅)
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LessonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [displayName, setDisplayName] = useState<string>('');

  useEffect(() => {
    if (!supabaseBrowser) return;
    (async () => {
      const { data: { user } } = await supabaseBrowser!.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabaseBrowser!
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.full_name) {
        setDisplayName(profile.full_name as string);
      }
    })();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF7F2',
        color: '#2B2620',
        fontFamily: '"Noto Sans KR", -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid #E5DDD0',
          padding: '1.25rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          background: '#FFFFFF',
          flexWrap: 'wrap', gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: '1.6rem',
              fontWeight: 500,
              letterSpacing: '0.02em',
              margin: 0,
            }}
          >
            과사람 <span style={{ color: '#C8A265' }}>개별수업 담임 운영</span>
          </h1>
          <p
            style={{
              fontSize: '0.78rem',
              color: '#7A7267',
              margin: '0.2rem 0 0 0',
              letterSpacing: '0.04em',
            }}
          >
            시차 배치 · 수업 준비 시트
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'baseline', fontSize: '0.88rem' }}>
          <nav style={{ display: 'flex', gap: '1.25rem' }}>
            <Link href="/dashboard/lessons/classes" style={navLinkStyle}>반 운영</Link>
            <Link href="/dashboard/lessons/overview" style={navLinkStyle}>전체 보기</Link>
          </nav>
          <span style={{ color: '#7A7267', fontSize: '0.8rem' }}>
            {displayName || '...'}
          </span>
        </div>
      </header>
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem' }}>
        {children}
      </main>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: '#2B2620',
  textDecoration: 'none',
  letterSpacing: '0.02em',
  borderBottom: '1px solid transparent',
  transition: 'border-color .15s',
};
