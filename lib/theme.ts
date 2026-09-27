// Dark/light theme shared by every route. The switch is a single class on <html>
// (`html.theme-dark`), so pages, logins, dashboards and modals all re-theme from
// one place. Plain module (no 'use client') because app/layout.tsx inlines
// THEME_BOOT_SCRIPT into <head> before React hydrates.
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'bum-theme'
export const THEME_DARK_CLASS = 'theme-dark'
export const THEME_DARK_UTILITY_CLASS = 'dark'
export const THEME_META_COLORS: Record<Theme, string> = { light: '#f3f3ee', dark: '#151713' }

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isDark = theme === 'dark'
  root.classList.toggle(THEME_DARK_CLASS, isDark)
  root.classList.toggle(THEME_DARK_UTILITY_CLASS, isDark)
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_META_COLORS[theme])
}

export function readClientTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  if (document.documentElement.classList.contains(THEME_DARK_CLASS)) return 'dark'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Inlined in <head> so a stored/system dark preference is on <html> before the
// first paint — no flash of the light theme on load or client-side navigation.
export const THEME_BOOT_SCRIPT = `(function(){try{var s=window.localStorage.getItem('${THEME_STORAGE_KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('${THEME_DARK_CLASS}',d);r.classList.toggle('${THEME_DARK_UTILITY_CLASS}',d);r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'${THEME_META_COLORS.dark}':'${THEME_META_COLORS.light}')}catch(e){}})();`
