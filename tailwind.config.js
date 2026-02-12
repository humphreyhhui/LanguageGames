/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0B0F1A',
          secondary: '#111827',
          tertiary: '#1C2640',
          elevated: '#1E293B',
        },
        metal: {
          blue: {
            dark: '#1E3A5F',
            mid: '#2563EB',
            bright: '#3B82F6',
            light: '#60A5FA',
            pale: '#93C5FD',
          },
          silver: {
            dark: '#374151',
            mid: '#6B7280',
            light: '#9CA3AF',
            bright: '#D1D5DB',
            pale: '#E5E7EB',
            white: '#F1F5F9',
          },
        },
        success: '#34D399',
        error: '#F87171',
        warning: '#FBBF24',
      },
    },
  },
  plugins: [],
};
