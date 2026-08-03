/** @type {import('tailwindcss').Config} */

// ── Design system Migo (extraído del Figma) ──
const purple = {
  50: '#F5EBFA', 100: '#E7CFF1', 200: '#D0A6E1', 300: '#B87ACF', 400: '#A052BD',
  500: '#8A2FA0', 600: '#6E2681', 700: '#531C61', 800: '#3B1446', 900: '#290E31',
};
const yellow = {
  50: '#FEFBE6', 100: '#FCF3AE', 200: '#F9E85F', 300: '#F6DE1E', 400: '#E7C90F',
  500: '#C2A50D', 600: '#96800A', 700: '#6E5E08', 800: '#4C4106', 900: '#2E2704',
};
const green = {
  50: '#E8F6ED', 100: '#C6E9D2', 200: '#97D6AC', 300: '#5FBF80', 400: '#38B060',
  500: '#2EA84F', 600: '#24883F', 700: '#1B682F', 800: '#134B22', 900: '#0C3016',
};
const amber = {
  50: '#FEF4E4', 100: '#FBE1B9', 200: '#F8CB85', 300: '#F6B451', 400: '#F5A526',
  500: '#F5A013', 600: '#D3830A', 700: '#A5660B', 800: '#7C4D0B', 900: '#523307',
};
const red = {
  50: '#FDECEC', 100: '#F8CBCB', 200: '#F2A3A3', 300: '#EE7B7B', 400: '#EC5C5C',
  500: '#EA4B4B', 600: '#D33636', 700: '#AF2727', 800: '#851D1D', 900: '#571313',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca — Purple (primario) y Yellow (secundario)
        brand: purple,
        accent: yellow,
        // Sobrescribimos las familias que usan los componentes para que hereden la marca
        violet: purple,
        purple,
        yellow,
        green,
        amber,
        red,
        sidebar: {
          DEFAULT: purple[800],
          hover: purple[700],
          active: purple[500],
          muted: '#B190C4',
        },
        migo: {
          purple: purple[500],
          heading: purple[600],
          green: green[500],
          amber: amber[500],
          red: red[500],
          blue: '#3b82f6', // color categórico auxiliar (grooming en agenda)
          violet: purple[500],
        },
        canvas: '#F6F7F9',
      },
      fontFamily: {
        // Roboto = cuerpo (default), Outfit = títulos
        sans: ['Roboto', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        heading: ['Outfit', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Escala tipográfica del Figma
        h2: ['26px', { lineHeight: '1.2', fontWeight: '700' }],
        h3: ['18px', { lineHeight: '1.3', fontWeight: '500' }],
        h4: ['16px', { lineHeight: '1.4', fontWeight: '500' }],
        'body-sm': ['14px', { lineHeight: '1.5' }],
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        // Design system: X2 Y2 · blur 21 · spread 0 · #7F398A 10%
        card: '2px 2px 21px 0 rgba(127, 57, 138, 0.10)',
      },
    },
  },
  plugins: [],
};
