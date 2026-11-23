/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        petroleo: {
          DEFAULT: '#0F4C5C',
          dark: '#09323d',
          light: '#176b80',
          50: '#f0f7f9',
          100: '#d9edf2'
        },
        ladrillo: {
          DEFAULT: '#E36414',
          dark: '#bf4f0b',
          light: '#f07d35',
          50: '#fdf4ed'
        },
        hueso: {
          DEFAULT: '#FBF8CC',
          soft: '#FDFCE6',
          border: '#EFE9A7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      }
    }
  },
  plugins: []
};
