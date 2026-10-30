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
        charcoal: {
          DEFAULT: "var(--charcoal, #2A2A2A)",
          deep: "var(--charcoal-deep, #1A1A1A)",
          light: "#353535",
        },
        sage: {
          DEFAULT: "var(--sage, #6B705C)",
          light: "#828773",
          glow: "var(--sage-glow, rgba(107, 112, 92, 0.4))",
        },
        brick: {
          DEFAULT: "var(--brick, #B83B2F)",
          light: "#D0493C",
          glow: "var(--brick-glow, rgba(184, 59, 47, 0.4))",
        },
        cream: {
          DEFAULT: "var(--cream, #FDFBF7)",
          muted: "var(--cream-muted, rgba(253, 251, 247, 0.65))",
          subtle: "rgba(253, 251, 247, 0.12)",
        },
      },
      fontFamily: {
        mono: ["Courier Prime", "Special Elite", "Consolas", "Monaco", "monospace"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
