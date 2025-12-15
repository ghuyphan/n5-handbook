/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'main': 'var(--bg-main)',
        'primary': 'var(--text-primary)',
        'secondary': 'var(--text-secondary)',
        'header': 'var(--header-text)',
        'danger': 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        'glass': {
          'bg': 'var(--glass-bg)',
          'border': 'var(--glass-border)',
        },
        'card': {
          'front-bg': 'var(--card-front-bg)',
          'front-border': 'var(--card-front-border)',
        },
        'accent': {
          'pink': 'var(--accent-pink)',
          'blue': 'var(--accent-blue)',
          'green': 'var(--accent-green)',
          'red': 'var(--accent-red)',
          'purple': 'var(--accent-purple)',
          'orange': 'var(--accent-orange)',
          'yellow': 'var(--accent-yellow)',
        },
        'switch-bg': 'var(--switch-bg)',
        'nav-hover-bg': 'var(--nav-hover-bg)', // Added this line
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans"', 'sans-serif'],
        jp: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', '"Noto Sans JP"', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      backgroundImage: {
        // 'main-gradient': 'radial-gradient(at 27% 37%, hsla(215, 98%, 61%, 0.1) 0px, transparent 50%), radial-gradient(at 97% 21%, hsla(340, 96%, 76%, 0.1) 0px, transparent 50%), radial-gradient(at 75% 88%, hsla(240, 96%, 76%, 0.1) 0px, transparent 50%)',
        // 'modal-gradient': 'radial-gradient(at 5% 5%, hsla(215, 98%, 70%, 0.15) 0px, transparent 50%), radial-gradient(at 95% 95%, hsla(280, 96%, 76%, 0.15) 0px, transparent 50%)',
      },
      keyframes: {
        fadeIn: {
          'from': { opacity: 0, transform: 'translateY(10px)' },
          'to': { opacity: 1, transform: 'translateY(0)' },
        },
        checkmarkPop: {
          '0%': { transform: 'scale(0.8)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
        pinPop: {
          '0%': { transform: 'scale(1)', boxShadow: '0 2px 8px var(--shadow-color)' },
          '60%': { transform: 'scale(1.15)', boxShadow: '0 12px 32px var(--shadow-color)' },
          '100%': { transform: 'scale(1.05)', boxShadow: '0 8px 24px var(--shadow-color)' },
        },
        pinIconRotate: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(-20deg) scale(1.3)' },
          '100%': { transform: 'rotate(0deg) scale(1.2)' },
        },
        unpinIconRotate: {
          '0%': { transform: 'rotate(0deg) scale(1.2)' },
          '100%': { transform: 'rotate(0deg) scale(1)' },
        },
        uploadArrow: {
          '0%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
          '100%': { transform: 'translateY(0)' },
        },
        pulsIn: {
          '0%': { boxShadow: 'inset 0 0 0 1rem var(--accent-blue)', opacity: 1 },
          '50%, 100%': { boxShadow: 'inset 0 0 0 0 var(--accent-blue)', opacity: 0 },
        },
        pulsOut: {
          '0%, 50%': { boxShadow: '0 0 0 0 var(--accent-blue)', opacity: 0 },
          '100%': { boxShadow: '0 0 0 1rem var(--accent-blue)', opacity: 1 },
        },
        highlightProgress: {
          '0%': { backgroundColor: 'var(--nav-hover-bg)', transform: 'scale(1.03)' },
          '100%': { backgroundColor: 'transparent', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s var(--ease-out-quint) forwards',
        'checkmark-pop': 'checkmarkPop 0.4s var(--ease-out-quint)',
        'pin-pop': 'pinPop 0.4s var(--ease-out-quint) forwards',
        'pin-icon-rotate': 'pinIconRotate 0.5s var(--ease-out-quint) 0.1s forwards',
        'unpin-icon-rotate': 'unpinIconRotate 0.4s var(--ease-in-out-quad) forwards',
        'upload-arrow': 'uploadArrow 1.5s var(--ease-in-out-quad) infinite',
        'pulse-in': 'pulsIn 1.8s ease-in-out infinite',
        'pulse-out': 'pulsOut 1.8s ease-in-out infinite',
        'highlight-progress': 'highlightProgress 1.5s var(--ease-out-quint)',
      },
      transitionTimingFunction: {
        'out-quint': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-quad': 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
      },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.sr-only': {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          borderWidth: '0',
        }
      })
    }
  ],
}