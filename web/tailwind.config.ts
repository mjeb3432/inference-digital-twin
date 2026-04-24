import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        text: {
          0: "var(--text-0)",
          1: "var(--text-1)",
          2: "var(--text-2)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          alt: "var(--accent-alt)",
        },
        nominal: "var(--nominal)",
        warn: "var(--warn)",
        crit: "var(--crit)",
        info: "var(--info)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        ui: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12px", { lineHeight: "18px" }],
        base: ["13px", { lineHeight: "20px" }],
        md: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "34px" }],
        "3xl": ["40px", { lineHeight: "46px" }],
        "4xl": ["56px", { lineHeight: "62px" }],
      },
      spacing: {
        strip: "var(--top-strip-h)",
        peek: "var(--bottom-strip-h)",
        inspector: "var(--inspector-w)",
        timeline: "var(--timeline-w)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flicker": "flicker 8s step-end infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: "0.12" },
          "5%": { opacity: "0.08" },
          "10%": { opacity: "0.14" },
          "50%": { opacity: "0.10" },
          "75%": { opacity: "0.13" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
