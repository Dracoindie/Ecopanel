import type { Config } from "tailwindcss";

// Colours are CSS variables (app/globals.css) so one palette serves the dark "stage" pages and,
// under .theme-light, the porcelain HR portal. Interviewer colours always mean "which interviewer".
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (family: string, shades: number[]) => Object.fromEntries(shades.map(shade => [shade, v(`${family}-${shade}`)]));

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.ts"],
  theme: {
    extend: {
      colors: {
        white: v("white"),
        black: v("black"),
        ink: v("ink"),
        panel: v("card"),
        card: v("card"),
        field: v("field"),
        mint: { DEFAULT: v("mint"), hover: v("mint-hover") },
        violet: { DEFAULT: v("violet"), ...scale("violet", [200, 300]) },
        slate: scale("slate", [100, 200, 300, 400, 500, 600, 700]),
        amber: scale("amber", [100, 200, 300, 400]),
        rose: scale("rose", [100, 200, 300, 400]),
        red: scale("red", [200, 300, 400]),
        sky: scale("sky", [100, 200, 400]),
        emerald: scale("emerald", [300, 400]),
        purple: scale("purple", [200, 400]),
        technical: "#22B8CF",
        product: "#F2A541",
        behavioural: "#E86A92"
      },
      fontFamily: {
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-body)", "system-ui", "sans-serif"]
      },
      boxShadow: { glow: "0 0 0 1px rgb(var(--c-white) / .06)" }
    }
  },
  plugins: []
};
export default config;
