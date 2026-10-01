import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Tema de la aplicación (claro u oscuro).
 *
 * El tema se aplica como atributo `data-theme` en <html>: los tokens de color
 * de `index.css` cambian según ese atributo, de modo que ningún componente
 * necesita saber qué tema está activo.
 */

export type ThemePreference = 'dark' | 'light';

const STORAGE_KEY = 'electropro_theme_v1';

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* almacenamiento no disponible */
  }
  // Sin preferencia guardada se respeta la del sistema operativo.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  }
  return 'dark';
}

function applyTheme(theme: ThemePreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  // Avisa al navegador para que pinte controles nativos acordes al tema.
  document.documentElement.style.colorScheme = theme;
}

interface ThemeContextValue {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
    []
  );

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return context;
}
