'use client';
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ThemeProvider, useMediaQuery } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { getTheme, type ThemeMode } from '@/lib/theme';

// ---- Context ----

interface ThemeModeCtx {
  mode: ThemeMode;      // 'light' | 'dark' | 'system'
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeCtx>({
  mode: 'system',
  resolved: 'light',
  setMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

// ---- Provider ----

const STORAGE_KEY = 'school-planner-theme';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      setModeState(stored);
    }
    setMounted(true);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
    // Also persist to Google Sheets (fire-and-forget)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'themeMode', value: m }),
    }).catch(() => {});
  }, []);

  // Also load from Sheets on mount (for cross-device sync)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.themeMode && !localStorage.getItem(STORAGE_KEY)) {
          setModeState(s.themeMode);
          localStorage.setItem(STORAGE_KEY, s.themeMode);
        }
      })
      .catch(() => {});
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => getTheme(resolved), [resolved]);

  const ctx = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return (
    <ThemeModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          {/* Prevent flash — hide until we read localStorage */}
          <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
            {children}
          </div>
        </LocalizationProvider>
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
