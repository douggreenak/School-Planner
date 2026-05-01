'use client';
// ============================================================
// Google-styled Material UI Theme — Light + Dark modes
// ============================================================
import { createTheme, alpha, type Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark' | 'system';

export function getTheme(mode: 'light' | 'dark'): Theme {
  const isLight = mode === 'light';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: '#1a73e8',
        light: '#4285F4',
        dark: '#1557b0',
        contrastText: '#fff',
      },
      secondary: {
        main: isLight ? '#5f6368' : '#9aa0a6',
        light: '#80868b',
        dark: '#3c4043',
      },
      error:   { main: isLight ? '#d93025' : '#f28b82' },
      warning: { main: isLight ? '#f9ab00' : '#fdd663' },
      success: { main: isLight ? '#1e8e3e' : '#81c995' },
      info:    { main: '#1a73e8' },
      background: {
        default: isLight ? '#f8f9fa' : '#121212',
        paper:   isLight ? '#ffffff' : '#1e1e1e',
      },
      text: {
        primary:   isLight ? '#202124' : '#e3e3e3',
        secondary: isLight ? '#5f6368' : '#9aa0a6',
      },
      divider: isLight ? '#e0e0e0' : 'rgba(255,255,255,0.12)',
      action: {
        hover:    isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
        selected: isLight ? 'rgba(26,115,232,0.08)' : 'rgba(66,133,244,0.16)',
      },
    },
    typography: {
      fontFamily: '"Google Sans", "Roboto", "Arial", sans-serif',
      h1: { fontWeight: 400, fontSize: '2rem', letterSpacing: 0 },
      h2: { fontWeight: 400, fontSize: '1.5rem', letterSpacing: 0 },
      h3: { fontWeight: 500, fontSize: '1.25rem', letterSpacing: 0 },
      h4: { fontWeight: 500, fontSize: '1.125rem' },
      h5: { fontWeight: 500, fontSize: '1rem' },
      h6: { fontWeight: 500, fontSize: '0.875rem' },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            padding: '8px 24px',
            fontSize: '0.875rem',
          },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 12,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: isLight
                ? '0 1px 6px rgba(0,0,0,0.1)'
                : '0 1px 6px rgba(0,0,0,0.4)',
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 16, fontWeight: 500 },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            boxShadow: 'none',
            borderBottom: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRight: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            backgroundColor: theme.palette.background.paper,
          }),
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: '0 25px 25px 0',
            marginRight: 12,
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.08 : 0.16),
              color: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.14 : 0.24),
              },
            },
          }),
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          size: 'small',
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none', // Remove MUI's default dark-mode gradient overlay
          },
        },
      },
    },
  });
}
