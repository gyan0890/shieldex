import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cyber: { DEFAULT: "#00d4ff", dark: "#0099bb" },
      },
      animation: {
        "slide-in": "slideIn 0.3s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
