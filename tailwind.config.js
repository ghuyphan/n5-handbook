/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tell Tailwind where to look for classes
  content: [
    './index.html',
    './js/**/*.js', // Scans all JS files in the js folder and subfolders
  ],

  // Enable class-based dark mode (matches your setup)
  darkMode: 'class',

  theme: {
    extend: {
      // 1. COLORS
      // We are mapping your CSS variables to Tailwind color names.
      // This lets you use classes like `bg-main`, `text-primary`, `border-accent-blue`, etc.
      // The actual color value is still controlled by the variables in your CSS,
      // which is perfect for your theme switcher.
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
      },

      // 2. FONTS
      // Defining your project's fonts.
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        jp: ['Noto Sans JP', 'sans-serif'],
      },
      
      // 3. BORDER RADIUS
      // Mapping your custom radius variables to Tailwind's scale.
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },

      // 4. ANIMATIONS & KEYFRAMES
      // Defining all your custom keyframes and animations.
      // Now you can use classes like `animate-fade-in` or `animate-pin-pop`.
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
        // REMOVED modalSlideUp keyframe as it's now handled by CSS transitions
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
        // REMOVED 'modal-slide-up' animation as it's now handled by CSS transitions
      },

      // 5. TRANSITION TIMING
      // Adding your custom easing curves.
      transitionTimingFunction: {
        'out-quint': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-quad': 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
      },
    },
  },
  plugins: [],
}