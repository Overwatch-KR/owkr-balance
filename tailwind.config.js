/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
            },
            colors: {
                surface: {
                    DEFAULT: '#0d1117',
                    elevated: '#161c25',
                    overlay: '#1d2632',
                },
                accent: {
                    DEFAULT: '#0284c7',
                    hover: '#0ea5e9',
                },
                danger: {
                    DEFAULT: '#ef4444',
                    hover: '#f87171',
                    subtle: 'rgba(239, 68, 68, 0.1)',
                },
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
}
