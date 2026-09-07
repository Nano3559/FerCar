/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "rgb(var(--p-50) / <alpha-value>)",
          100: "rgb(var(--p-100) / <alpha-value>)",
          200: "rgb(var(--p-200) / <alpha-value>)",
          300: "rgb(var(--p-300) / <alpha-value>)",
          400: "rgb(var(--p-400) / <alpha-value>)",
          500: "rgb(var(--p-500) / <alpha-value>)",
          600: "rgb(var(--p-600) / <alpha-value>)",
          700: "rgb(var(--p-700) / <alpha-value>)",
          800: "rgb(var(--p-800) / <alpha-value>)",
          900: "rgb(var(--p-900) / <alpha-value>)",
        },
        dark: {
          50: "rgb(var(--dk-50) / <alpha-value>)",
          100: "rgb(var(--dk-100) / <alpha-value>)",
          200: "rgb(var(--dk-200) / <alpha-value>)",
          300: "rgb(var(--dk-300) / <alpha-value>)",
          400: "rgb(var(--dk-400) / <alpha-value>)",
          500: "rgb(var(--dk-500) / <alpha-value>)",
          600: "rgb(var(--dk-600) / <alpha-value>)",
          700: "rgb(var(--dk-700) / <alpha-value>)",
          800: "rgb(var(--dk-800) / <alpha-value>)",
          900: "rgb(var(--dk-900) / <alpha-value>)",
          950: "rgb(var(--dk-950) / <alpha-value>)",
        },
        gray: {
          50: "rgb(var(--gray-50) / <alpha-value>)",
          100: "rgb(var(--gray-100) / <alpha-value>)",
          200: "rgb(var(--gray-200) / <alpha-value>)",
          300: "rgb(var(--gray-300) / <alpha-value>)",
          400: "rgb(var(--gray-400) / <alpha-value>)",
          500: "rgb(var(--gray-500) / <alpha-value>)",
          600: "rgb(var(--gray-600) / <alpha-value>)",
          700: "rgb(var(--gray-700) / <alpha-value>)",
          800: "rgb(var(--gray-800) / <alpha-value>)",
          900: "rgb(var(--gray-900) / <alpha-value>)",
          950: "rgb(var(--gray-950) / <alpha-value>)",
        },
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        white: "#ffffff",
        accent: {
          DEFAULT: "#f59e0b",
          light: "#fbbf24",
          dark: "#d97706",
        },
      },
      fontFamily: {
        heading: ['"Inter"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
        "card-gradient": "linear-gradient(145deg, #1e293b 0%, #0f172a 100%)",
      },
    },
  },
  plugins: [],
};
