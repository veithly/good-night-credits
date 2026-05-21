import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#05060a",
          900: "#0a0d18",
          800: "#101428",
          700: "#1a1f3a",
        },
        moon: {
          50: "#f5f7ff",
          100: "#e0e6ff",
          200: "#b9c4ff",
          300: "#8c9cff",
          400: "#5d6dff",
          500: "#3a44e0",
          600: "#252db8",
          700: "#1c2390",
        },
        aurora: {
          teal: "#5eead4",
          violet: "#a78bfa",
          rose: "#fb7185",
          amber: "#fbbf24",
          mint: "#86efac",
        },
        credit: {
          earn: "#86efac",
          spend: "#fca5a5",
          stake: "#fcd34d",
          info: "#93c5fd",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      animation: {
        "aurora-shift": "auroraShift 20s ease infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "glow": "glow 3s ease-in-out infinite",
        "marquee": "marquee 30s linear infinite",
        "shimmer": "shimmer 2.5s linear infinite",
      },
      keyframes: {
        auroraShift: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 20px 0 rgba(94,234,212,0.25)" },
          "50%": { boxShadow: "0 0 40px 10px rgba(167,139,250,0.35)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "aurora-grad":
          "linear-gradient(135deg, rgba(94,234,212,0.18), rgba(167,139,250,0.18) 40%, rgba(251,113,133,0.16) 80%)",
        "shimmer-grad":
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
      },
    },
  },
  plugins: [],
} satisfies Config;
