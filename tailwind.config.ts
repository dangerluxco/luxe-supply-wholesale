import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tech-direction palette (Luxe Supply Co.)
        ground: "#FAFAF8",
        surface: "#FFFFFF",
        border: "#E4E3DE",
        ink: "#16161A",
        secondary: "#6B6A64",
        muted: "#9C9A92",
        accent: "#B08D3E", // champagne gold, signal color
        success: "#4E9A6A",
        danger: "#A65440",
        // Dark surfaces
        "rep-dark": "#16161A",
        "ful-ground": "#1D1B15",
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "10px",
        chip: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
