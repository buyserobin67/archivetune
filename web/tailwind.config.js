/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#000000', 900: '#07050c', 800: '#0f0b18', 700: '#171127', 600: '#221a38' },
        violet: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        rise: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { from: { transform: 'scale(.96)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
      },
      animation: { rise: 'rise .32s cubic-bezier(.2,.8,.2,1)', fade: 'fade .2s ease-out', pop: 'pop .18s ease-out' },
    },
  },
  plugins: [],
};
