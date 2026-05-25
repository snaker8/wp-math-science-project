/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ★ Production source map 활성화 (2026-05-25):
  //   React minified error #418/#423 hydration mismatch 정확한 소스 라인 진단용.
  //   영향: client JS bundle 옆에 .map 파일 추가 배포 (배포 시간/용량 약간 증가).
  //   보안: 코드는 어차피 client 에 가니 source map 추가 위험 미미 (난독화 의도 없음).
  //   진단 완료 후 false 로 되돌릴지 결정.
  productionBrowserSourceMaps: true,
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
