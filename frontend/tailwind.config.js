/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        isaac: {
          bg: "#0d0d0d",
          surface: "#1a1a1a",
          border: "#2e2e2e",
          accent: "#DAA520",
          "accent-hover": "#F0C040",
          gold: "#f1c40f",
          muted: "#888",
          text: "#e8e8e8",
        },
      },
    },
  },
  plugins: [],
};
