import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12162B',        // primary text / dark bg
        paper: '#F5F6F3',      // light background (cool off-white, not cream)
        marigold: '#E8A33D',   // primary accent — credential/gold
        'marigold-dark': '#C6821F',
        teal: '#1F7A5C',       // secondary accent — growth / verified
        line: '#DFE1DA',       // hairline borders on light bg
        lineDark: '#2A2F4A',   // hairline borders on dark bg
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
