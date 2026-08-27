// ============================================================================
// BrandLogo — Math×Sci Bank
//
// 메인 페이지, 가입/로그인 페이지, TopNav 좌측 로고 등 한 곳에서 일관되게 사용.
//
// 사용 예시:
//   <BrandLogo size="xl" showTagline />        ← 가입 페이지 헤더
//   <BrandLogo size="md" />                    ← TopNav 좌측
//   <BrandLogo size="sm" mark />               ← 컴팩트 (mark 만)
// ============================================================================

import React from 'react';

export interface BrandLogoProps {
  /** 글자 크기 */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** 부제 ("함께 만드는 수학·과학 문제은행") 표시 */
  showTagline?: boolean;
  /** "Math×Sci Bank" 워드마크 대신 압축 마크 ("M×S") 만 보일지 */
  mark?: boolean;
  /** 다크 배경용 (기본) vs 라이트 배경용 */
  variant?: 'dark' | 'light';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<BrandLogoProps['size']>, string> = {
  xs: 'text-sm',
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

const TAGLINE_SIZE_MAP: Record<NonNullable<BrandLogoProps['size']>, string> = {
  xs: 'text-[10px]',
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-sm',
};

export function BrandLogo({
  size = 'md',
  showTagline = false,
  mark = false,
  variant = 'dark',
  className = '',
}: BrandLogoProps) {
  const sizeCls = SIZE_MAP[size];
  const taglineSize = TAGLINE_SIZE_MAP[size];
  const bankColor = variant === 'dark' ? 'text-white' : 'text-zinc-900';
  const taglineColor = variant === 'dark' ? 'text-zinc-500' : 'text-zinc-500';

  if (mark) {
    // 압축 마크 — "M×S" + 미니 박스 (모바일·좁은 공간용)
    return (
      <span className={`inline-flex items-center gap-1.5 font-black tracking-tighter ${sizeCls} ${className}`}>
        <span className={bankColor}>M</span>
        <span className="text-zinc-500">×</span>
        <span className={bankColor}>S</span>
        <span className={`${bankColor} ml-0.5`}>B</span>
      </span>
    );
  }

  return (
    <div className={className}>
      <span className={`inline-flex items-baseline font-black tracking-tight ${sizeCls} leading-none`}>
        <span className={bankColor}>Math</span>
        <span className="mx-0.5 font-extralight text-zinc-500">×</span>
        <span className={bankColor}>Sci</span>
        <span className={`ml-2 font-semibold ${variant === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>Bank</span>
      </span>
      {showTagline && (
        <p className={`${taglineSize} ${taglineColor} mt-2 tracking-wide`}>
          함께 만드는 수학·과학 문제은행
        </p>
      )}
    </div>
  );
}

/**
 * BrandMark — 작은 정사각형 마크 (favicon / TopNav 모바일 / OG 이미지 대체용).
 * 별도로 import 해서 쓸 수 있게 export.
 */
export function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-label="Math×Sci Bank"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#FFFFFF" />
      <text
        x="50%"
        y="56%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#08090A"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight="900"
        fontSize="26"
        letterSpacing="-1"
      >
        M×S
      </text>
    </svg>
  );
}
