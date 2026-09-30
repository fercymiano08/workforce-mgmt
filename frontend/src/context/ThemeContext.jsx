import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Font-size scaling only. A dark theme was added once (toggle in the top bar, color-scheme: light dark)
// with no matching dark styles, which made every native dropdown follow the phone's dark setting and
// nothing else. It was removed rather than completed: the app is light-only, and the control that
// "set" a theme no one asked for is gone.
const ThemeContext = createContext(null);

const FONT_SIZES = { small: '14px', medium: '16px', large: '18px' };

function getInitialFontSize() {
  try {
    const stored = window.localStorage.getItem('wf-font-size');
    if (stored && FONT_SIZES[stored]) return stored;
  } catch { /* ignore */ }
  return 'medium';
}

function applyFontSize(size) {
  document.documentElement.style.fontSize = FONT_SIZES[size] || FONT_SIZES.medium;
}

export function ThemeProvider({ children }) {
  const [fontSize, setFontSize] = useState(getInitialFontSize);

  // Apply font size on mount and when font size changes
  useEffect(() => {
    applyFontSize(fontSize);
    try { window.localStorage.setItem('wf-font-size', fontSize); } catch { /* ignore */ }
  }, [fontSize]);

  const value = useMemo(() => ({
    fontSize, setFontSize,
  }), [fontSize]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};