import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171311",
        cream: "#f5efe4",
        rust: "#a83d2b",
        clay: "#c9613e",
        sage: "#5a6b4a",
        line: "#d8cdb8"
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Oswald", "Arial Narrow", "sans-serif"],
        body: ["var(--font-body)", "Inter", "Helvetica Neue", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
