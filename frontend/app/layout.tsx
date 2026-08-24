import type { Metadata } from 'next'
import { Inter, Poppins, Mukta } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Poppins — headings, per the SahiCareer brand guideline (friendly, modern).
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

// Mukta — carries Hindi/Devanagari text; guideline calls this non-negotiable
// since users write in their own language.
const mukta = Mukta({
  subsets: ['latin', 'devanagari'],
  weight: ['400', '600', '700'],
  variable: '--font-mukta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SahiCareer — Your Career Journey Starts Here',
  description: 'SahiCareer helps you build your resume, get AI-powered career guidance, and connect with mentors — all in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${mukta.variable}`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
