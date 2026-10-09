/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ★ Production source map (2026-05-25 진단용 활성 → 2026-06-03 비활성 복귀):
  //   React minified error #418/#423 hydration 진단 목적이었으나, .map 을 모든
  //   client chunk 옆에 배포해 JS 업로드 용량/배포 시간을 약 2배로 늘림.
  //   진단 종료 → false 복귀로 배포 경량화. 재진단 필요 시 임시로 true 로.
  productionBrowserSourceMaps: false,
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
    // ★ barrel import 트리셰이킹 (2026-06-03):
    //   런타임 동작 불변 — 컴파일 시 사용 아이콘/컴포넌트만 번들에 포함.
    //   lucide(143곳)/recharts(12곳)/framer-motion(38곳) 라우트 진입 JS 감소.
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
    // ★ 헤드리스 크롬(PDF 다운로드, src/lib/pdf/html-to-pdf.ts) — 번들에 넣지 않고 node_modules 에서 그대로 로드
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    // ★ 서버 함수에 포함될 런타임 리소스 명시 (process.cwd() 접근 파일)
    //   Next 14 는 experimental 아래에서만 읽는다 (collect-build-traces.js: config.experimental.outputFileTracingIncludes).
    //   2026-10-10 까지 최상위에 있어 전부 무시되고 있었다 — PDF 크롬 bin 누락으로 발견.
    outputFileTracingIncludes: {
      '/api/workflow/reanalyze-crop': ['./curriculum_data/expanded_math_types_unified.json'],
      '/api/workflow/upload': ['./curriculum_data/expanded_math_types_unified.json'],
      // ★ SVG 도형 검증용 래스터라이즈 폰트 (람다엔 시스템 폰트 없음) — src/lib/vision/svg-raster.ts
      '/api/problems/[problemId]/generate-figure': ['./assets/fonts/**'],
      // ★ PDF 다운로드 — 람다용 크롬 바이너리(brotli) 동봉
      '/api/print/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
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
