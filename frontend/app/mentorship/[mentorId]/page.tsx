'use client'

/**
 * Mentor Profile (Module 4) — fully dynamic, one GET to
 * /api/mentorship/mentors/{id}. Availability shown here is real (computed
 * server-side from recurring rules + actual bookings) but read-only —
 * booking itself is Module 5, so "Book Session" is intentionally disabled
 * rather than linking somewhere that doesn't work yet.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import BookingModal from '@/components/mentorship/BookingModal'
import { api } from '@/lib/api'

interface MentorProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  headline: string | null
  bio: string | null
  designation: string | null
  company: string | null
  years_experience: number
  country: string | null
  timezone: string
  session_price_amount: number
  session_price_currency: string
  is_featured: boolean
  rating_avg: number
  rating_count: number
  sessions_completed: number
  skills: string[]
  languages: string[]
  categories: string[]
  achievements: string[]
  experience: { position: string; company: string | null; start_date: string | null; end_date: string | null; is_current: boolean; bullets: string[] }[]
  education: { institution: string; degree: string | null; field: string | null; start_date: string | null; end_date: string | null }[]
  certifications: { name: string; issuer: string | null; issue_date: string | null; credential_url: string | null }[]
  reviews: { id: string; rating: number; review_text: string | null; reviewer_name: string | null; created_at: string | null }[]
  rating_breakdown: Record<string, number>
  upcoming_slots: { date: string; start_time: string; end_time: string }[]
  session_types: string[]
}

const money = (n: number, currency: string) => (n === 0 ? 'Free' : `${currency === 'INR' ? '₹' : currency + ' '}${n.toLocaleString('en-IN')}`)
const SESSION_TYPE_LABELS: Record<string, string> = {
  one_on_one: '1:1 Mentorship', resume_review: 'Resume Review', mock_interview: 'Mock Interview',
  career_guidance: 'Career Guidance', group_session: 'Group Session',
}
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export default function MentorProfilePage() {
  const params = useParams<{ mentorId: string }>()
  const router = useRouter()
  const [mentor, setMentor] = useState<MentorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [shared, setShared] = useState(false)
  const [showBooking, setShowBooking] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    api.get<MentorProfile>(`/api/mentorship/mentors/${params.mentorId}`)
      .then(setMentor)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this mentor'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [params.mentorId])

  const shareProfile = async () => {
    const url = window.location.href
    if (navigator.share) {
      try { await navigator.share({ title: mentor?.full_name || 'Mentor', url }); return } catch { /* user cancelled */ }
    }
    await navigator.clipboard.writeText(url)
    setShared(true)
    setTimeout(() => setShared(false), 2000)
  }

  const topBar = (
    <>
      <button onClick={() => router.push('/mentorship')} className="text-sm text-gray-500 hover:text-gray-800">← Back to Mentors</button>
    </>
  )

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-6xl mx-auto">
        {loading && (
          <div className="panel-premium p-8 animate-pulse space-y-4">
            <div className="flex gap-4">
              <div className="w-20 h-20 rounded-full bg-gray-100" />
              <div className="flex-1 space-y-2 py-2">
                <div className="h-5 bg-gray-100 rounded w-1/3" />
                <div className="h-4 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="panel-premium p-10 text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="font-semibold text-gray-800">Mentor not found</p>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </div>
        )}

        {!loading && mentor && (
          <div className="space-y-6">
            {/* header */}
            <div className="panel-premium p-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                {mentor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mentor.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover shadow-soft" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-2xl">
                    {(mentor.full_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-navy-600">{mentor.full_name || 'Mentor'}</h1>
                    {mentor.is_featured && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Featured</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {[mentor.designation, mentor.company].filter(Boolean).join(' at ') || mentor.headline}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                    {mentor.rating_count > 0 ? (
                      <span className="flex items-center gap-1"><span className="text-amber-500">★</span> <b className="text-gray-800">{mentor.rating_avg.toFixed(1)}</b> ({mentor.rating_count} reviews)</span>
                    ) : <span>No reviews yet</span>}
                    <span>{mentor.years_experience}+ yrs experience</span>
                    <span>{mentor.sessions_completed} sessions completed</span>
                    {mentor.country && <span>{mentor.country}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-lg font-bold text-gray-900">{money(mentor.session_price_amount, mentor.session_price_currency)}<span className="text-xs font-normal text-gray-500">/session</span></span>
                  {mentor.upcoming_slots.length > 0 ? (
                    <button onClick={() => setShowBooking(true)} className="btn-primary text-sm px-5 py-2.5 font-semibold">
                      Book Session
                    </button>
                  ) : (
                    <button
                      disabled
                      title="This mentor hasn't published availability yet"
                      className="text-sm px-5 py-2.5 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed font-semibold"
                    >
                      No availability yet
                    </button>
                  )}
                  <button onClick={shareProfile} className="text-xs text-royal-600 hover:underline">
                    {shared ? 'Link copied!' : '🔗 Share Profile'}
                  </button>
                </div>
              </div>
              {mentor.categories.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {mentor.categories.map((c) => <span key={c} className="text-[11px] bg-navy-50 text-navy-700 border border-navy-100 rounded-full px-2.5 py-1">{c}</span>)}
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-[1fr_320px] gap-6">
              {/* main column */}
              <div className="space-y-6">
                {mentor.bio && (
                  <section className="panel-premium p-6">
                    <h2 className="font-semibold text-gray-800 mb-2">About</h2>
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{mentor.bio}</p>
                  </section>
                )}

                {mentor.experience.length > 0 && (
                  <section className="panel-premium p-6">
                    <h2 className="font-semibold text-gray-800 mb-4">Experience</h2>
                    <div className="space-y-4">
                      {mentor.experience.map((e, i) => (
                        <div key={i}>
                          <p className="text-sm font-semibold text-gray-800">{e.position}{e.company && ` — ${e.company}`}</p>
                          <p className="text-xs text-gray-500">{e.start_date} – {e.is_current ? 'Present' : e.end_date}</p>
                          {e.bullets.length > 0 && (
                            <ul className="mt-1 list-disc ml-4 text-xs text-gray-600 space-y-0.5">
                              {e.bullets.map((b, j) => <li key={j}>{b}</li>)}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {mentor.education.length > 0 && (
                  <section className="panel-premium p-6">
                    <h2 className="font-semibold text-gray-800 mb-4">Education</h2>
                    <div className="space-y-3">
                      {mentor.education.map((e, i) => (
                        <div key={i}>
                          <p className="text-sm font-semibold text-gray-800">{e.degree}{e.field && ` in ${e.field}`}</p>
                          <p className="text-xs text-gray-500">{e.institution} · {e.start_date} – {e.end_date}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {mentor.certifications.length > 0 && (
                  <section className="panel-premium p-6">
                    <h2 className="font-semibold text-gray-800 mb-4">Certifications</h2>
                    <div className="space-y-2">
                      {mentor.certifications.map((c, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-gray-800">{c.name}</span>
                          {c.issuer && <span className="text-gray-500"> — {c.issuer}</span>}
                          {c.issue_date && <span className="text-xs text-gray-400"> · {c.issue_date}</span>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {mentor.achievements.length > 0 && (
                  <section className="panel-premium p-6">
                    <h2 className="font-semibold text-gray-800 mb-4">Achievements</h2>
                    <ul className="list-disc ml-4 text-sm text-gray-600 space-y-1">
                      {mentor.achievements.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </section>
                )}

                {/* Reviews */}
                <section className="panel-premium p-6">
                  <h2 className="font-semibold text-gray-800 mb-4">Reviews ({mentor.rating_count})</h2>
                  {mentor.rating_count > 0 && (
                    <div className="mb-5 space-y-1">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = mentor.rating_breakdown[String(star)] || 0
                        const pct = mentor.rating_count ? Math.round((count / mentor.rating_count) * 100) : 0
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs">
                            <span className="w-8 text-gray-500">{star}★</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-6 text-right text-gray-400">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {mentor.reviews.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No reviews yet — be the first to book and review this mentor.</p>
                  ) : (
                    <div className="space-y-4">
                      {mentor.reviews.map((r) => (
                        <div key={r.id} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-800">{r.reviewer_name || 'Learner'}</span>
                            <span className="text-amber-500 text-xs">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                          </div>
                          {r.review_text && <p className="text-sm text-gray-600 mt-1">{r.review_text}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* sidebar */}
              <div className="space-y-6">
                {mentor.skills.length > 0 && (
                  <section className="panel-premium p-5">
                    <h2 className="text-sm font-semibold text-gray-800 mb-3">Skills</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {mentor.skills.map((s) => <span key={s} className="text-[11px] bg-royal-50 text-royal-700 border border-royal-100 rounded-full px-2.5 py-1">{s}</span>)}
                    </div>
                  </section>
                )}

                {mentor.languages.length > 0 && (
                  <section className="panel-premium p-5">
                    <h2 className="text-sm font-semibold text-gray-800 mb-3">Languages</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {mentor.languages.map((l) => <span key={l} className="text-[11px] bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-1">{l}</span>)}
                    </div>
                  </section>
                )}

                <section className="panel-premium p-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-3">Session Types</h2>
                  <div className="flex flex-col gap-1.5">
                    {mentor.session_types.map((t) => (
                      <span key={t} className="text-xs text-gray-600">• {SESSION_TYPE_LABELS[t] || t}</span>
                    ))}
                  </div>
                </section>

                <section className="panel-premium p-5">
                  <h2 className="text-sm font-semibold text-gray-800 mb-3">Upcoming Availability</h2>
                  {mentor.upcoming_slots.length === 0 ? (
                    <p className="text-xs text-gray-400">No open slots published yet — check back soon.</p>
                  ) : (
                    <div className="space-y-2">
                      {mentor.upcoming_slots.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs bg-good-50 text-good-700 border border-good-100 rounded-lg px-3 py-2">
                          <span className="font-medium">{fmtDate(s.date)}</span>
                          <span>{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 mt-2">Times shown in {mentor.timezone}</p>
                </section>
              </div>
            </div>
          </div>
        )}

        {showBooking && mentor && (
          <BookingModal
            mentorId={mentor.id}
            mentorName={mentor.full_name}
            sessionTypes={mentor.session_types}
            upcomingSlots={mentor.upcoming_slots}
            onClose={() => setShowBooking(false)}
            onBooked={load}
          />
        )}
      </div>
    </MentorshipShell>
  )
}
