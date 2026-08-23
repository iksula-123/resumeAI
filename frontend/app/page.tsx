'use client'

import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import TrustedBy from '@/components/landing/TrustedBy'
import WhySahiCareer from '@/components/landing/WhySahiCareer'
import Services from '@/components/landing/Services'
import PlatformFeatures from '@/components/landing/PlatformFeatures'
import Workflow from '@/components/landing/Workflow'
import AIAssistant from '@/components/landing/AIAssistant'
import MentorSpotlight from '@/components/landing/MentorSpotlight'
import Testimonials from '@/components/landing/Testimonials'
import Statistics from '@/components/landing/Statistics'
import Pricing from '@/components/landing/Pricing'
import FAQ from '@/components/landing/FAQ'
import CTABanner from '@/components/landing/CTABanner'
import Footer from '@/components/landing/Footer'

// Deliberately NOT auto-redirecting a logged-in visitor away from here — the
// three service cards below (Resume Builder / AI Buddy / Mentorly) must stay
// clickable for an already-authenticated user, taking them straight to the
// service (see Services.tsx), not bounced through /dashboard first. Anyone
// who wants their dashboard can reach it via the navbar or a service card.
export default function HomePage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />
      <Hero />
      <TrustedBy />
      <WhySahiCareer />
      <Services />
      <PlatformFeatures />
      <Workflow />
      <AIAssistant />
      <MentorSpotlight />
      <Testimonials />
      <Statistics />
      <Pricing />
      <FAQ />
      <CTABanner />
      <Footer />
    </main>
  )
}
