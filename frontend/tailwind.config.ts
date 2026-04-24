import type { Config } from 'tailwindcss';

// Design tokens lifted from DESIGN.md + the Forge amber/teal palette.
// Kept CSS-variable-driven so shadcn components pick up the theme.
const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans:    ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:    ['"IBM Plex Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Forge palette
        forge: {
          bg:      '#08090B',
          panel:   '#0E1116',
          line:    '#1C2128',
          amber:   '#F5A623',
          teal:    '#14B8A6',
          cyan:    '#22D3EE',
          nominal: '#4ADE80',
          warn:    '#F59E0B',
          crit:    '#EF4444',
        },
        // shadcn tokens (CSS vars set in index.css)
        border: 'hsl(var(--border))',
        input:  'hsl(var(--input))',
        ring:   'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'fade-in':          { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-in-subtitle': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'accordion-down':   { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up':     { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'fade-in':          'fade-in 0.6s ease-out forwards',
        'fade-in-subtitle': 'fade-in-subtitle 0.8s ease-out forwards',
        'accordion-down':   'accordion-down 0.2s ease-out',
        'accordion-up':     'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
