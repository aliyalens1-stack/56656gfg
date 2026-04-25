/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // BIBI dark palette — flat surfaces, depth via 1px borders only
        ink: {
          0:   '#000000',
          50:  '#080808',
          100: '#0d0d0d',  // surface_base (modals, sticky panels)
          200: '#141414',  // surface_elevated (cards)
          300: '#1a1a1a',  // surface_input (chips, inputs)
          400: '#1f1f1f',
          500: '#262626',  // surface_hover
          600: '#333333',
          700: '#404040',
        },
        amber: {
          DEFAULT: '#FFB020',
          50:  '#FFF6DB',
          100: '#FFE9A3',
          300: '#FFD466',
          400: '#FFC233',
          500: '#FFB020',
          600: '#FEA500',
          700: '#E89400',
        },
        brand:   { DEFAULT: '#FFB020', hover: '#FEA500', light: '#FFF6DB', dark: '#E89400' },
        accent:  { DEFAULT: '#FFB020', light: '#FFF6DB', dark: '#FEA500' },
        primary: { DEFAULT: '#FFB020', hover: '#FEA500' },
        hairline: '#2E2E2E', // canonical 1px border
        success: { DEFAULT: '#22c55e', light: 'rgba(34,197,94,0.12)' },
        danger:  { DEFAULT: '#ef4444', light: 'rgba(239,68,68,0.12)' },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body:    ['"IBM Plex Sans"', 'Inter', 'sans-serif'],
        heading: ['"Bebas Neue"', 'sans-serif'], // back-compat alias
      },
      letterSpacing: {
        tightest: '-0.04em',
        bracket:  '0.2em',
        widest:   '0.25em',
        nav:      '0.15em',
        bebas:    '0.04em',
      },
      borderRadius: {
        DEFAULT: '8px',
        tight:   '6px',
        base:    '8px',
        lg:      '10px',
        xl:      '12px',
        modal:   '12px',
      },
      boxShadow: {
        // BIBI: NO shadows. Keep only the focus ring helpers.
        'amber-ring':  '0 0 0 1px #FFB020',
        'hairline':    '0 0 0 1px #2E2E2E',
        none:          'none',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      keyframes: {
        'fade-up':     { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'amber-pulse': { '0%,100%': { boxShadow: '0 0 0 0 rgba(255,176,32,0.55)' }, '50%': { boxShadow: '0 0 0 12px rgba(255,176,32,0)' } },
      },
      animation: {
        'fade-up':     'fade-up 0.4s ease-out forwards',
        'amber-pulse': 'amber-pulse 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
