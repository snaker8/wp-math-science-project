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
        // Gwasaram Pure Black Palette
        black: "#000000",
        zinc: {
          900: "#18181b", // Subtler backgrounds
          950: "#09090b", // Card backgrounds
        },
        indigo: {
          500: "#6366f1", // Point color
          600: "#4f46e5", // Hover point
        },
        white: "#ffffff",
      },
      fontFamily: {
        sans: ["var(--font-pretendard)", "Inter", "sans-serif"],
        mono: ["var(--font-inter)", "monospace"],
      },
      borderColor: {
        white: "rgba(255, 255, 255, 0.1)", // 1px ultra-slim border
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
      animation: {
        "spin-slow": "spin 3s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
