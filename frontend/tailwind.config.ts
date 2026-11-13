import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          50: "rgb(var(--c-ink-50) / <alpha-value>)",
          100: "rgb(var(--c-ink-100) / <alpha-value>)",
          200: "rgb(var(--c-ink-200) / <alpha-value>)",
          300: "rgb(var(--c-ink-300) / <alpha-value>)",
          400: "#9CA3AF",
          500: "rgb(var(--c-ink-500) / <alpha-value>)",
          600: "rgb(var(--c-ink-600) / <alpha-value>)",
          700: "rgb(var(--c-ink-700) / <alpha-value>)",
          800: "#1F2937",
          900: "rgb(var(--c-ink) / <alpha-value>)",
        },
        paper: {
          DEFAULT: "rgb(var(--c-paper) / <alpha-value>)",
          elevated: "rgb(var(--c-paper-elevated) / <alpha-value>)",
          muted: "rgb(var(--c-paper-muted) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          strong: "rgb(var(--c-line-strong) / <alpha-value>)",
          subtle: "rgb(var(--c-line-subtle) / <alpha-value>)",
        },
        accent: { DEFAULT: "#F59E0B", light: "#FCD34D", dark: "#B45309" },
        success: { DEFAULT: "#10B981", light: "#34D399", dark: "#047857" },
        warning: { DEFAULT: "#F59E0B", light: "#FCD34D", dark: "#B45309" },
        danger: { DEFAULT: "#EF4444", light: "#F87171", dark: "#B91C1C" },
      },
      fontFamily: {
        sans: ["var(--font-plex-arabic)", "system-ui", "sans-serif"],
        display: ["var(--font-kufi)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
      fontSize: { "2xs": ["0.625rem", { lineHeight: "0.875rem" }] },
      spacing: { "4.5": "1.125rem", "13": "3.25rem", "15": "3.75rem", "17": "4.25rem", "18": "4.5rem" },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)",
        xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.06)",
        card: "0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.03)",
        "card-hover": "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.04)",
        dropdown: "0 4px 12px -2px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
      },
      borderRadius: { card: "0.75rem", xl: "1rem", "2xl": "1.25rem" },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-scale": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in-scale": "fade-in-scale 0.15s ease-out",
        "slide-in-right": "slide-in-right 0.25s ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;