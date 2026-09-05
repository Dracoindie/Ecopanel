import type { Config } from "tailwindcss";
const config: Config = { content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"], theme: { extend: { colors: { ink: "#080d18", panel: "#111a2d", mint: "#7cf5c5", violet: "#9c8cff" }, boxShadow: { glow: "0 0 60px rgba(124,245,197,.12)" } } }, plugins: [] };
export default config;
