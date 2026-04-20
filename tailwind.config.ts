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
          foreground: 'var(--accent-foreground)', // shadcn 호환
        },
        // ── shadcn/ui 시맨틱 토큰 (globals.css CSS 변수 연결) ──
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground, #fff)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        // ── Chrome 디자인 시스템 (시험지 관리 리디자인 → 전역 토큰) ──
        chrome: {
          bg: 'var(--chrome-bg)',
          surface: 'var(--chrome-surface)',
          card: 'var(--chrome-card)',
          raised: 'var(--chrome-raised)',
          input: 'var(--chrome-input)',
        },
        'chrome-border': {
          DEFAULT: 'var(--chrome-border)',
          sub: 'var(--chrome-border-sub)',
          str: 'var(--chrome-border-str)',
        },
        'chrome-fg': {
          1: 'var(--chrome-fg-1)',
          2: 'var(--chrome-fg-2)',
          3: 'var(--chrome-fg-3)',
          4: 'var(--chrome-fg-4)',
        },
        brand: {
          'indigo-300': 'var(--brand-indigo-300)',
          'indigo-400': 'var(--brand-indigo-400)',
          'indigo-500': 'var(--brand-indigo-500)',
          'indigo-600': 'var(--brand-indigo-600)',
          'cyan-400': 'var(--brand-cyan-400)',
        },
        paper: {
          DEFAULT: 'var(--paper)',
          border: 'var(--paper-border)',
        },
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
        },
        // 기존 색상 유지 (뱃지/상태 표시용)
        black: "#000000",
        white: "#ffffff",
      },
      transitionTimingFunction: {
        'out-expo': 'var(--ease-out-expo)',
      },
      transitionDuration: {
        'fast': 'var(--dur-fast)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
