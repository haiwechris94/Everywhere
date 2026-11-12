import colors from 'tailwindcss/colors'

// Échelle primaire partagée (primary / blue / indigo)
const PRIMARY = {
  50: '#eef9fc', 100: '#d5f0f6', 200: '#a9deeb', 300: '#6cc5db', 400: '#2ba6c4',
  500: '#0f7f9c', 600: '#0c6a85', 700: '#0b566d', 800: '#0d4759', 900: '#0f3b4a', 950: '#07252f',
}

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
        // ── Design system « Everywhere » ─────────────────────────────────
        // Style : minimalisme suisse, contraste élevé. Voir design-system/MASTER.md
        // Primaire : bleu sarcelle profond (confiance). 500+ passe 4.5:1 sur blanc.
        primary: PRIMARY,
        // Les anciennes teintes d'interface (blue / indigo) sont unifiées sur la primaire
        blue: PRIMARY,
        indigo: PRIMARY,
        // Idem pour les bleus-verts dispersés (sky / cyan / teal) : une seule teinte d'interface
        sky: PRIMARY,
        cyan: PRIMARY,
        teal: PRIMARY,
        // Un seul vert : emerald suit green (succès = green-700, voir MASTER.md)
        emerald: colors.green,
        // Une seule famille de gris dans toute l'appli (slate)
        gray: colors.slate,
        neutral: colors.slate,
        secondary: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#15803d', 600: '#166534', 700: '#14532d', 800: '#0f4425', 900: '#0a331b',
        },
        // Accent : orange chaleureux, réservé à l'action principale et aux alertes douces
        accent: {
          50: '#fff7ed', 100: '#ffedd5', 200: '#fed7aa', 300: '#fdba74', 400: '#fb923c',
          500: '#ea580c', 600: '#c2410c', 700: '#9a3412', 800: '#7c2d12', 900: '#5f230e',
        },
        danger: {
          50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
          500: '#dc2626', 600: '#b91c1c', 700: '#991b1b', 800: '#7f1d1d', 900: '#651818',
        },
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80',
          500: '#15803d', 600: '#166534', 700: '#14532d', 800: '#0f4425', 900: '#0a331b',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
          500: '#f59e0b', 600: '#b45309', 700: '#92400e', 800: '#78350f', 900: '#5f2a0c',
        },
      },
      fontFamily: {
        // Corps : Source Sans 3 (très lisible). Titres : Lexend (conçue pour la lisibilité).
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Lexend', '"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
      // Échelle légèrement agrandie : meilleure lisibilité pour les utilisateurs peu à l'aise
      fontSize: {
        'xs': ['0.8125rem', { lineHeight: '1.125rem' }],
        'sm': ['0.9375rem', { lineHeight: '1.375rem' }],
        'base': ['1.0625rem', { lineHeight: '1.625rem' }],
        'lg': ['1.1875rem', { lineHeight: '1.75rem' }],
        'xl': ['1.3125rem', { lineHeight: '1.875rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.125rem', { lineHeight: '2.5rem' }],
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
