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
  },
  // ★ 프로덕션 빌드 시 ESLint/TS 체크 건너뛰기 (배포용 빠른 빌드)
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
