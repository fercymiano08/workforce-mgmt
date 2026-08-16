import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

const FONT_SIZES = { small: '14px', medium: '16px', large: '18px' };

function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem('wf-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch { /* ignore */ }
  return 'light';
}

function getInitialFontSize() {
  try {
    const stored = window.localStorage.getItem('wf-font-size');
    if (stored && FONT_SIZES[stored]) return stored;
  } catch { /* ignore */ }
  return 'medium';
}

function applyThemeClass(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    prefersDark ? root.classList.add('dark') : root.classList.remove('dark');
  }
}

function applyFontSize(size) {
  document.documentElement.style.fontSize = FONT_SIZES[size] || FONT_SIZES.medium;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [fontSize, setFontSize] = useState(getInitialFontSize);

  // Apply theme class on mount and when theme changes
  useEffect(() => {
    applyThemeClass(theme);
    try { window.localStorage.setItem('wf-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // Apply font size on mount and when fontSize changes
  useEffect(() => {
    applyFontSize(fontSize);
    try { window.localStorage.setItem('wf-font-size', fontSize); } catch { /* ignore */ }
  }, [fontSize]);

  // Listen for OS theme changes when on "system"
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeClass('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{
      theme, setTheme, toggleTheme, isDark: theme === 'dark',
      fontSize, setFontSize,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
