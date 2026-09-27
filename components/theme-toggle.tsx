'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme-provider'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, mounted, toggleTheme } = useTheme()
  // Before hydration the theme is unknown; render the light-mode icon so the
  // server and client markup match (the page colors are already correct via
  // the boot script in app/layout.tsx).
  const isDark = mounted && theme === 'dark'
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button type="button" className={cn('theme-toggle', className)} onClick={toggleTheme} aria-label={label} aria-pressed={isDark} title={label}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
