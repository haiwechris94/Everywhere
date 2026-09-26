/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand color - Teal/Cyan from logo
        primary: {
          50: '#e8f7fb',
          100: '#c7edf5',
          200: '#a3e2ef',
          300: '#7dd7e9',
          400: '#5dcee4',
          500: '#0d9fc1', // Main teal from logo
          600: '#0b8aa9',
          700: '#097591',
          800: '#076079',
          900: '#054b61',
          950: '#033649',
        },
        // Secondary brand color - Green from logo
        secondary: {
          50: '#e6f7f0',
          100: '#c2ead9',
          200: '#9dddc2',
          300: '#78d0ab',
          400: '#53c394',
          500: '#00853e', // Main green from logo
          600: '#007336',
          700: '#00612e',
          800: '#004f26',
          900: '#003d1e',
        },
        // Accent color - Orange from logo
        accent: {
          50: '#fef4e8',
          100: '#fde4c2',
          200: '#fcd49c',
          300: '#fbc476',
          400: '#fab450',
          500: '#f58021', // Main orange from logo
          600: '#d96f1c',
          700: '#bd5e17',
          800: '#a14d12',
          900: '#853c0d',
        },
        // Alert/Danger color - Red from logo
        danger: {
          50: '#fce8e9',
          100: '#f7c2c4',
          200: '#f29c9f',
          300: '#ed767a',
          400: '#e85055',
          500: '#de1c24', // Main red from logo
          600: '#c2181f',
          700: '#a6141a',
          800: '#8a1015',
          900: '#6e0c10',
        },
        // Success color - Enhanced green
        success: {
          50: '#e6f7f0',
          100: '#c2ead9',
          200: '#9dddc2',
          300: '#78d0ab',
          400: '#53c394',
          500: '#00853e',
          600: '#007336',
          700: '#00612e',
          800: '#004f26',
          900: '#003d1e',
        },
        // Warning color - Amber/Orange
        warning: {
          50: '#fef4e8',
          100: '#fde4c2',
          200: '#fcd49c',
          300: '#fbc476',
          400: '#fab450',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Neutral grays - Soft and modern
        neutral: {
          50: '#fafbfc',
          100: '#f4f6f8',
          200: '#e8ecf0',
          300: '#d1d8e0',
          400: '#a8b4c0',
          500: '#7e8c9a',
          600: '#5f6d7a',
          700: '#44505c',
          800: '#2d3843',
          900: '#1a2229',
          950: '#0f1419',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.375rem',
        'md': '0.5rem',
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'soft-lg': '0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.08)',
        'soft-xl': '0 8px 24px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.1)',
        'soft-2xl': '0 16px 48px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.12)',
        'inner-soft': 'inset 0 2px 4px rgba(0, 0, 0, 0.06)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
