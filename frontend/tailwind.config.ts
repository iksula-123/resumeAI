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
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter)', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      boxShadow: {
        glow: '0 8px 30px -6px rgba(99, 102, 241, 0.45)',
        'glow-lg': '0 14px 50px -8px rgba(124, 58, 237, 0.5)',
        glass: '0 8px 32px -8px rgba(31, 38, 135, 0.18)',
        soft: '0 2px 12px -2px rgba(17, 24, 39, 0.08)',
        'soft-lg': '0 12px 40px -12px rgba(17, 24, 39, 0.16)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #6366f1 0%, #7c3aed 50%, #d946ef 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, #818cf8 0%, #a78bfa 100%)',
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
