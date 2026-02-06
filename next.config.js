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
};

module.exports = nextConfig;
