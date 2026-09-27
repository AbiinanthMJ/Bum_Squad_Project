'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { THEME_DARK_CLASS, THEME_STORAGE_KEY, applyTheme, readClientTheme, type Theme } from '@/lib/theme'

type ThemeContextValue = { theme: Theme; mounted: boolean; setTheme: (theme: Theme) => void; toggleTheme: () => void }

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // The boot script already decided; read it back so provider state matches the DOM.
    const initial = readClientTheme()
    setThemeState(initial)
    applyTheme(initial)
    setMounted(true)
    // Follow the OS only while the visitor has not made an explicit choice.
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(THEME_STORAGE_KEY)) return
      const next: Theme = event.matches ? 'dark' : 'light'
      setThemeState(next)
      applyTheme(next)
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next) } catch {}
    setThemeState(next)
    applyTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains(THEME_DARK_CLASS) ? 'light' : 'dark')
  }, [setTheme])

  const value = useMemo(() => ({ theme, mounted, setTheme, toggleTheme }), [theme, mounted, setTheme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider> (mounted in app/layout.tsx).')
  return context
}
