/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.{html,tsx}', './components/**/*.{ts,tsx}', './styles/**/*.css'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // M3 Primary
        primary: {
          DEFAULT: 'var(--md-sys-color-primary)',
          container: 'var(--md-sys-color-primary-container)',
        },
        'on-primary': {
          DEFAULT: 'var(--md-sys-color-on-primary)',
          container: 'var(--md-sys-color-on-primary-container)',
        },
        // M3 Secondary
        secondary: {
          DEFAULT: 'var(--md-sys-color-secondary)',
          container: 'var(--md-sys-color-secondary-container)',
        },
        'on-secondary': {
          DEFAULT: 'var(--md-sys-color-on-secondary)',
          container: 'var(--md-sys-color-on-secondary-container)',
        },
        // M3 Tertiary
        tertiary: {
          DEFAULT: 'var(--md-sys-color-tertiary)',
          container: 'var(--md-sys-color-tertiary-container)',
        },
        'on-tertiary': {
          DEFAULT: 'var(--md-sys-color-on-tertiary)',
          container: 'var(--md-sys-color-on-tertiary-container)',
        },
        // M3 Error
        error: {
          DEFAULT: 'var(--md-sys-color-error)',
          container: 'var(--md-sys-color-error-container)',
        },
        'on-error': {
          DEFAULT: 'var(--md-sys-color-on-error)',
          container: 'var(--md-sys-color-on-error-container)',
        },
        // M3 Surface
        surface: {
          DEFAULT: 'var(--md-sys-color-surface)',
          variant: 'var(--md-sys-color-surface-variant)',
          tint: 'var(--md-sys-color-surface-tint)',
          lowest: 'var(--md-sys-color-surface-container-lowest)',
          low: 'var(--md-sys-color-surface-container-low)',
          container: 'var(--md-sys-color-surface-container)',
          high: 'var(--md-sys-color-surface-container-high)',
          highest: 'var(--md-sys-color-surface-container-highest)',
        },
        'on-surface': {
          DEFAULT: 'var(--md-sys-color-on-surface)',
          variant: 'var(--md-sys-color-on-surface-variant)',
        },
        // M3 Outline
        outline: {
          DEFAULT: 'var(--md-sys-color-outline)',
          variant: 'var(--md-sys-color-outline-variant)',
        },
        // M3 Inverse
        inverse: {
          surface: 'var(--md-sys-color-inverse-surface)',
          'on-surface': 'var(--md-sys-color-inverse-on-surface)',
          primary: 'var(--md-sys-color-inverse-primary)',
        },
        // M3 Scrim & Background
        background: 'var(--md-sys-color-background)',
        'on-background': 'var(--md-sys-color-on-background)',
        scrim: 'var(--md-sys-color-scrim)',
      },
      borderRadius: {
        none: 'var(--md-sys-shape-corner-none)',
        xs: 'var(--md-sys-shape-corner-extra-small)',
        sm: 'var(--md-sys-shape-corner-small)',
        md: 'var(--md-sys-shape-corner-medium)',
        lg: 'var(--md-sys-shape-corner-large)',
        xl: 'var(--md-sys-shape-corner-extra-large)',
        full: 'var(--md-sys-shape-corner-full)',
      },
      boxShadow: {
        'elevation-0': 'var(--md-sys-elevation-level0)',
        'elevation-1': 'var(--md-sys-elevation-level1)',
        'elevation-2': 'var(--md-sys-elevation-level2)',
        'elevation-3': 'var(--md-sys-elevation-level3)',
        'elevation-4': 'var(--md-sys-elevation-level4)',
        'elevation-5': 'var(--md-sys-elevation-level5)',
      },
      transitionTimingFunction: {
        standard: 'var(--md-sys-motion-easing-standard)',
        'standard-decelerate': 'var(--md-sys-motion-easing-standard-decelerate)',
        'standard-accelerate': 'var(--md-sys-motion-easing-standard-accelerate)',
        emphasized: 'var(--md-sys-motion-easing-emphasized)',
        'emphasized-decelerate': 'var(--md-sys-motion-easing-emphasized-decelerate)',
        'emphasized-accelerate': 'var(--md-sys-motion-easing-emphasized-accelerate)',
        spring: 'var(--md-sys-motion-spring-bounce)',
      },
      transitionDuration: {
        short1: 'var(--md-sys-motion-duration-short1)',
        short2: 'var(--md-sys-motion-duration-short2)',
        short3: 'var(--md-sys-motion-duration-short3)',
        short4: 'var(--md-sys-motion-duration-short4)',
        medium1: 'var(--md-sys-motion-duration-medium1)',
        medium2: 'var(--md-sys-motion-duration-medium2)',
        medium3: 'var(--md-sys-motion-duration-medium3)',
        medium4: 'var(--md-sys-motion-duration-medium4)',
        long1: 'var(--md-sys-motion-duration-long1)',
        long2: 'var(--md-sys-motion-duration-long2)',
      },
    },
  },
  plugins: [],
};
