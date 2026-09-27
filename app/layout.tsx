import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import { ThemeProvider } from '@/lib/theme-provider'
import './globals.css'

export const metadata: Metadata = { title: 'BUM. — Your body. Your edge.', description: 'Personal coaching for building a body and mindset that can keep up with the life you want.', generator: 'v0.app' }
export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#f3f3ee' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className="bg-background" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} /></head><body className="antialiased"><ThemeProvider>{children}</ThemeProvider>{process.env.NODE_ENV === 'production' && <Analytics />}</body></html> }
