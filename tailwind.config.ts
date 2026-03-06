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
        bg: "#F4F5E0",
        fg: "#E1F1B7",
        btn: "#ACC18A",
        "btn-dark": "#8aa36e",
        text: {
          DEFAULT: "#2e3a1f",
          mid: "#4a5c32",
          light: "#7a9158",
        },
      },
      fontFamily: {
        // use the PT Sans font provided by next/font/google; `ptSans.className`
        // injects a `--font-pt-sans` variable we can reference here.  All
        // Tailwind utilities that use `font-display` or `font-body` will
        // resolve to PT Sans, which ultimately makes the entire site use the
        // same typeface.
        display: ["var(--font-pt-sans)", "sans-serif"],
        body: ["var(--font-pt-sans)", "sans-serif"],
      },
      keyframes: {
        drift: {
          "0%": { transform: "translate(0,0) scale(1)" },
          "100%": { transform: "translate(20px,16px) scale(1.04)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "drift-slow": "drift 10s ease-in-out infinite alternate",
        "drift-rev": "drift 14s ease-in-out infinite alternate-reverse",
        float: "float 5s ease-in-out infinite",
        "fade-up": "fadeUp 0.6s ease forwards",
      },
    },
  },
  plugins: [],
};
export default config;
