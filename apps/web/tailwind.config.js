/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        den: {
          deep: "#1e1f22",
          darker: "#111214",
          surface: "#2b2d31",
          elevated: "#383a40",
          chat: "#313338",
          honey: "#5865f2",
          gold: "#f0b132",
          mane: "#e8a040",
          amber: "#4752c4",
          cream: "#f2f3f5",
          muted: "#949ba4",
          forest: "#23a559",
          berry: "#f23f43",
          link: "#00a8fc",
        },
      },
      borderRadius: {
        cubino: "8px",
        den: "4px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      boxShadow: {
        den: "0 8px 16px rgba(0, 0, 0, 0.24)",
        glow: "0 0 20px rgba(88, 101, 242, 0.35)",
        "glow-gold": "0 0 18px rgba(240, 177, 50, 0.4)",
      },
    },
  },
  plugins: [],
};
