/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 用户指定的配色方案
        cream: {
          DEFAULT: '#F7EFE2',
          50: '#FBF8F2',
          100: '#F7EFE2',
          200: '#F0E5D4',
          300: '#E8D9C4',
        },
        sand: {
          DEFAULT: '#EDE5D8',
          50: '#F5F1EB',
          100: '#EDE5D8',
          200: '#E0D5C4',
          300: '#D3C5B0',
          400: '#A89880',
        },
        brown: {
          DEFAULT: '#8B7355',
          50: '#F5F0EA',
          100: '#E8DDD0',
          200: '#C9B8A0',
          300: '#A89370',
          400: '#8B7355',
          500: '#6F5A42',
          600: '#554532',
        },
        olive: {
          DEFAULT: '#6B8E5A',
          50: '#F0F5ED',
          100: '#DCE8D6',
          200: '#B8D1AC',
          300: '#8FB87C',
          400: '#6B8E5A',
          500: '#547046',
        },
        terra: {
          DEFAULT: '#C47A6C',
          50: '#FBF0EE',
          100: '#F5DCD8',
          200: '#E8B8B0',
          300: '#D49488',
          400: '#C47A6C',
          500: '#A85E50',
        },
        charcoal: {
          DEFAULT: '#3D3A38',
          50: '#F5F4F4',
          100: '#E8E7E6',
          200: '#C4C2C0',
          300: '#8A8580',
          400: '#5C5856',
          500: '#3D3A38',
        },
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
      },
      fontFamily: {
        sans: ['"Noto Serif SC"', '"Georgia"', 'serif'],
        display: ['"Noto Serif SC"', '"Georgia"', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }],
        'base': ['0.875rem', { lineHeight: '1.375rem' }],
        'lg': ['1rem', { lineHeight: '1.5rem' }],
        'xl': ['1.125rem', { lineHeight: '1.625rem' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem' }],
        '3xl': ['1.75rem', { lineHeight: '2rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
      },
      spacing: {
        'sidebar': '220px',
        'sidebar-collapsed': '72px',
      },
      boxShadow: {
        // 无阴影设计，但保留极细边框
        'inner-thin': 'inset 0 0 0 1px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}
