/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#F7F9F7',
          surface: '#FFFFFF',
          hover: '#F2F5F3',
          subtle: '#EEF2EF',
        },
        primary: {
          DEFAULT: '#27864B',
          hover: '#1F713E',
          soft: '#EAF4EC',
          border: '#CDE5D4',
        },
        text: {
          primary: '#202B24',
          secondary: '#718078',
          muted: '#9CAAA2',
          inverse: '#FFFFFF',
        },
        border: {
          subtle: '#E5EBE6',
          strong: '#D0D9D2',
        },
        state: {
          success: '#26965A',
          successBg: '#E8F5EE',
          warning: '#E9A23B',
          warningBg: '#FDF6E9',
          danger: '#DC6262',
          dangerBg: '#FCECEC',
          info: '#4387C5',
          infoBg: '#EBF3FA',
        },
        // Telemetry specific colors for soil indicators
        metric: {
          nitrogen: '#0284C7',
          phosphorus: '#EA580C',
          potassium: '#7C3AED',
          ph: '#2563EB',
          ec: '#D97706',
          temp: '#E11D48',
          moisture: '#0D9488',
        }
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Arial', 'sans-serif'],
        mono: ['Consolas', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        card: '0 1px 4px 0 rgba(16, 24, 40, 0.06)',
        dropdown: '0 4px 16px -2px rgba(16, 24, 40, 0.08), 0 2px 6px -2px rgba(16, 24, 40, 0.04)',
        modal: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        card: '12px',
      }
    },
  },
  plugins: [],
}
