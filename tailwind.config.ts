import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        lernex: {
          blue: "#2F80ED",
          green: "#27AE60",
          yellow: "#F2C94C",
          purple: "#9B51E0",
          charcoal: "#1C1C1E",
          gray: "#F2F2F2",
        },
      },
      borderRadius: { "2xl": "1rem" },
    },
  },
  plugins: [],
  // Note: In Tailwind v4, dark mode is configured in CSS using @custom-variant
  // The darkMode config option is no longer used
};
export default config;

