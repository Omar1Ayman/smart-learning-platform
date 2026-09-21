/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1B1F3B", // deep indigo-ink — headings, primary buttons, nav
          50: "#F0F1F7",
          100: "#DADCEA",
          400: "#565B87",
          700: "#232752",
        },
        paper: "#F5F6FA", // app background — cool, not the cliché warm cream
        accent: {
          DEFAULT: "#E3A008", // warm marigold — used sparingly (CTAs, active states)
          50: "#FDF3DA",
        },
        success: "#1E8E6D",
        danger: "#C1432B",
        line: "#E4E6EF", // hairline borders instead of heavy card shadows
      },
      fontFamily: {
        display: ["var(--font-kufi)", "Tahoma", "sans-serif"],
        sans: ["var(--font-plex-arabic)", "Tahoma", "sans-serif"],
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};
