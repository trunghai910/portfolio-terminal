/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        terminal: {
          canvas: "#020617",
          sidebar: "#080d1a",
          card: "#0e1525",
          elevated: "#162033",
          border: "#1e293b",
          borderStrong: "#334155",
          text: "#f8fafc",
          secondary: "#cbd5e1",
          muted: "#94a3b8",
          accent: "#38bdf8",
        },
        pnl: {
          gain: "#22c55e",
          loss: "#ef4444",
          warn: "#f59e0b",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)",
        hero: "0 8px 24px -8px rgba(2, 6, 23, 0.8), inset 0 1px 0 0 rgba(56, 189, 248, 0.14)",
      },
    },
  },
  plugins: [],
};
