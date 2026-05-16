import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial']
      },
      colors: {
        background: '#1a103c',
        surface: '#2a2057',
        primary: {
          DEFAULT: '#00f6ff',
          dark: '#00c5cc'
        },
        text: {
          DEFAULT: '#f0f0f8',
          darker: '#a0a0b0'
        }
      }
    }
  },
  plugins: [],
} satisfies Config;