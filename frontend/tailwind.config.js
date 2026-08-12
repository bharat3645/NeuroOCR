/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: {
          light: '#f7efe4',
          DEFAULT: '#f5e6d3',
          dark: '#4a3c31',
        },
      },
      boxShadow: {
        'paper': '0 2px 4px rgba(74, 60, 49, 0.2), 0 12px 24px -12px rgba(74, 60, 49, 0.2)',
      },
    },
  },
  plugins: [],
};