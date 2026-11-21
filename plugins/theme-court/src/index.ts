import { defaultTheme, definePlugin } from '@racket-club/plugin-sdk';

/**
 * Example theme plugin: court-green colours, side menu on wide screens, compact cards.
 * A theme can also replace named components (SessionCard, AppHeader, BottomNav, AvatarFrame)
 * by adding them under `theme.components`.
 */
export default definePlugin({
  id: 'theme-court',
  name: { en: 'Court Green theme', vi: 'Giao diện Sân Xanh' },
  version: '0.1.0',
  requiresCore: '^0.1.0',
  theme: {
    id: 'theme-court',
    tokens: {
      light: {
        ...defaultTheme.tokens.light,
        'color.primary': '#0b6b3a',
        'color.onPrimary': '#ffffff',
        'color.accent': '#e8c547',
        'color.background': '#f3f7f2',
        'radius.card': '8px',
        'radius.button': '6px',
      },
      dark: {
        'color.primary': '#5fd08f',
        'color.onPrimary': '#062414',
        'color.background': '#0c1510',
        'color.surface': '#13211a',
      },
    },
    editable: ['color.primary', 'color.onPrimary', 'color.accent'],
    layout: { nav: 'side-menu', density: 'compact' },
  },
});
