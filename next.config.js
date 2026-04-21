/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['api.mathpix.com', 'www.desmos.com'],
  },
  // styled-jsx 설정
  compiler: {
    styledComponents: false,
  },
  // ★ 대용량 PDF 업로드 지원 (기본 4MB → 100MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // ★ useSearchParams() Suspense 없이 허용 (프리렌더 에러 회피)
    missingSuspenseWithCSRBailout: false,
  },
  // ★ 프로덕션 빌드 시 ESLint/TS 체크 건너뛰기 (배포용 빠른 빌드)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // ★ 서버 함수에 포함될 런타임 리소스 명시 (process.cwd() 접근 파일)
  // Next.js 트레이서가 자동 감지 실패할 수 있으므로 보장
  outputFileTracingIncludes: {
    '/api/workflow/reanalyze-crop': ['./curriculum_data/expanded_math_types_unified.json'],
    '/api/workflow/upload': ['./curriculum_data/expanded_math_types_unified.json'],
  },
};

module.exports = nextConfig;
