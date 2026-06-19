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
        background: "#f7faff",
        foreground: "#0f172a",
        primary: "#2563eb",
        secondary: "#0f172a",
        surface: "#f8fafc",
        border: "#e2e8f0",
        muted: "#64748b",
        success: "#10b981",
        danger: "#ef4444",
        accent: "#3b82f6",
      },
      spacing: {
        "margin-desktop": "2rem",
        "margin-mobile": "1rem",
        section: "2.5rem",
      },
      borderRadius: {
        card: "1.5rem",
        pill: "9999px",
        input: "0.875rem",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      fontSize: {
        "headline-md": ["2.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        "body-md": ["1rem", { lineHeight: "1.6", fontWeight: "400" }],
        "label-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "600" }],
        "chip-sm": ["0.875rem", { lineHeight: "1.4", fontWeight: "600" }],
      },
      boxShadow: {
        glow: "0 20px 70px rgba(37, 99, 235, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
