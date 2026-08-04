import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-mukta)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-mukta)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // SahiCareer Design & Branding Guideline v1 — single source of truth for brand color.
        // navy = structure/trust, royal = links/secondary action, teal = section labels/accents,
        // accent = the ONE primary CTA per screen (never a large area), amber = highlights/badges,
        // good = success/score states.
        navy: {
          50: '#e1e5ea', 100: '#cfd4dd', 200: '#aab4c3', 300: '#8593a9', 400: '#607390',
          500: '#3c5276', 600: '#17325C', 700: '#13294b', 800: '#0f203a', 900: '#0a1629',
          DEFAULT: '#17325C',
        },
        royal: {
          50: '#e4ecf6', 100: '#d3e1f0', 200: '#b2cae5', 300: '#91b3d9', 400: '#709dce',
          500: '#4f86c2', 600: '#2E6FB7', 700: '#265b95', 800: '#1d4674', 900: '#153252',
          DEFAULT: '#2E6FB7',
        },
        teal: {
          50: '#e4eef0', 100: '#d3e4e7', 200: '#b2cfd4', 300: '#91bbc2', 400: '#70a6af',
          500: '#4f929d', 600: '#2E7D8A', 700: '#266671', 800: '#1d4f57', 900: '#15383e',
          DEFAULT: '#2E7D8A',
        },
        accent: {
          50: '#fdece4', 100: '#fbe0d3', 200: '#f9c9b1', 300: '#f6b290', 400: '#f39b6e',
          500: '#f1834d', 600: '#EE6C2B', 700: '#c25823', 800: '#97441b', 900: '#6b3113',
          DEFAULT: '#EE6C2B',
        },
        amber: {
          50: '#fef4e3', 100: '#fdecd1', 200: '#fbdeae', 300: '#fad08c', 400: '#f8c269',
          500: '#f7b446', 600: '#F5A623', 700: '#c8881d', 800: '#9b6916', 900: '#6e4b10',
          DEFAULT: '#F5A623',
        },
        good: {
          50: '#e2eee7', 100: '#d0e3d8', 200: '#accebb', 300: '#89b99e', 400: '#65a481',
          500: '#428f63', 600: '#1E7A46', 700: '#186439', 800: '#134d2c', 900: '#0e3720',
          DEFAULT: '#1E7A46',
        },
        ink: '#1C2530',
        mut: '#6B7684',
        line: '#E3E8EF',
        surface: '#F4F7FB',
      },
      boxShadow: {
        glow: '0 8px 24px -6px rgba(23, 50, 92, 0.35)',
        'glow-lg': '0 14px 40px -8px rgba(23, 50, 92, 0.4)',
        glass: '0 8px 32px -8px rgba(23, 50, 92, 0.15)',
        soft: '0 2px 12px -2px rgba(23, 50, 92, 0.08)',
        'soft-lg': '0 12px 40px -12px rgba(23, 50, 92, 0.16)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #17325C 0%, #2E6FB7 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #2E6FB7 0%, #2E7D8A 100%)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-18px) scale(1.04)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 8px 30px -6px rgba(99,102,241,0.45)' },
          '50%': { boxShadow: '0 8px 40px -2px rgba(124,58,237,0.65)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        float: 'float 9s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
