import { defineConfig } from 'vitest/config';
import path from 'path';

// 사고 빈발 순수 함수 회귀 테스트 (CLAUDE.md 안전 가드의 코드화)
// 실행: npm test  /  npx vitest run
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
