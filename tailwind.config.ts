import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── 세련된 다크 테마: 시맨틱 토큰 ──
        surface: {
          base: 'var(--bg-base)',
          card: 'var(--bg-surface)',
          raised: 'var(--bg-raised)',
          overlay: 'var(--bg-overlay)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          muted: 'var(--accent-muted)',
        },
        // 기존 색상 유지 (뱃지/상태 표시용)
        black: "#000000",
        white: "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "Inter", "sans-serif"],
        mono: ["var(--font-inter)", "monospace"],
      },
      borderColor: {
        DEFAULT: 'var(--border-default)',
        subtle: 'var(--border-subtle)',
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "spin-slow": "spin 3s linear infinite",
      },
      maxWidth: {
        '8xl': '88rem',
      },
    },
  },
  plugins: [],
};
export default config;
