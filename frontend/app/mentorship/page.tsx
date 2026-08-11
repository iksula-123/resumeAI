'use client'

/**
 * Mentorship Marketplace (Module 3).
 *
 * Plug-and-play into the existing app: uses MentorshipShell (its own sidebar,
 * separate from the resume-builder's AppShell/Sidebar), the shared api
 * client (never calls Supabase directly), and the SahiCareer brand tokens.
 * Fully dynamic — every mentor, filter option, and count comes from
 * /api/mentorship/*; there is no seed/demo data, so an empty marketplace
 * renders a real empty state rather than fake cards.
 */
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MentorshipShell from '@/components/mentorship/MentorshipShell'
import { api } from '@/lib/api'

interface MentorCard {
  id: string
  profile_id: string
  full_name: string | null
  avatar_url: string | null
  headline: string | null
  designation: string | null
  company: string | null
  years_experience: number
  country: string | null
  session_price_amount: number
  session_price_currency: string
  is_featured: boolean
  rating_avg: number
  rating_count: number
  sessions_completed: number
  skills: string[]
  languages: string[]
  categories: string[]
  has_availability: boolean
}
interface MentorsResponse {
  mentors: MentorCard[]
  total: number
  page: number
  page_size: number
  total_pages: number
}
interface Category { id: string; name: string; slug: string; icon: string | null }
interface FilterOptions { skills: string[]; languages: string[]; countries: string[] }

const SORT_OPTIONS = [
  { value: 'rating', label: 'Highest Rated' },
  { value: 'sessions', label: 'Most Sessions' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
]

const money = (n: number, currency: string) =>
  n === 0 ? 'Free' : `${currency === 'INR' ? '₹' : currency + ' '}${n.toLocaleString('en-IN')}`

function MentorCardSkeleton() {
  return (
    <div className="panel-premium p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
        <div className="h-6 w-16 bg-gray-100 rounded-full" />
      </div>
      <div className="mt-4 h-9 bg-gray-100 rounded-lg" />
    </div>
  )
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  if (count === 0) return <span className="text-xs text-gray-400">No reviews yet</span>
  return (
    <span className="flex items-center gap-1 text-sm">
      <span className="text-amber-500">★</span>
      <span className="font-semibold text-gray-800">{rating.toFixed(1)}</span>
      <span className="text-gray-400 text-xs">({count})</span>
    </span>
  )
}

function MentorCard({ m }: { m: MentorCard }) {
  const router = useRouter()
  return (
    <div className="panel-premium p-5 flex flex-col hover:-translate-y-0.5 hover:shadow-lg transition">
      {m.is_featured && (
        <span className="self-start mb-2 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
          Featured
        </span>
      )}
      <div className="flex items-center gap-3">
        {m.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 shadow-soft" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-brand-gradient flex items-center justify-center text-white font-bold text-lg shrink-0">
            {(m.full_name || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{m.full_name || 'Mentor'}</p>
          <p className="text-xs text-gray-500 truncate">
            {[m.designation, m.company].filter(Boolean).join(' at ') || m.headline || '—'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <StarRating rating={m.rating_avg} count={m.rating_count} />
        <span className="text-xs text-gray-500">{m.years_experience}+ yrs exp</span>
      </div>

      {m.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.skills.slice(0, 4).map((s) => (
            <span key={s} className="text-[11px] bg-royal-50 text-royal-700 border border-royal-100 rounded-full px-2 py-0.5">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span className={m.has_availability ? 'text-good-700 font-medium' : ''}>
          {m.has_availability ? '● Available' : 'Availability on request'}
        </span>
        <span className="font-semibold text-gray-800">{money(m.session_price_amount, m.session_price_currency)}/session</span>
      </div>

      <button
        onClick={() => router.push(`/mentorship/${m.id}`)}
        className="mt-4 w-full text-sm py-2.5 rounded-lg border border-royal-200 text-royal-700 hover:bg-royal-50 transition font-medium"
      >
        View Profile
      </button>
    </div>
  )
}

export default function MentorshipMarketplacePage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ skills: [], languages: [], countries: [] })

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [skill, setSkill] = useState('')
  const [language, setLanguage] = useState('')
  const [country, setCountry] = useState('')
  const [minExperience, setMinExperience] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('rating')
  const [page, setPage] = useState(1)

  const [data, setData] = useState<MentorsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/mentorship/categories').then((r) => setCategories(r.categories)).catch(() => {})
    api.get<FilterOptions>('/api/mentorship/filters').then(setFilterOptions).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category) params.set('category', category)
      if (skill) params.set('skills', skill)
      if (language) params.set('languages', language)
      if (country) params.set('country', country)
      if (minExperience) params.set('min_experience', minExperience)
      if (maxPrice) params.set('max_price', maxPrice)
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('page_size', '12')
      const r = await api.get<MentorsResponse>(`/api/mentorship/mentors?${params.toString()}`)
      setData(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load mentors')
    } finally {
      setLoading(false)
    }
  }, [search, category, skill, language, country, minExperience, maxPrice, sort, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // any filter change resets to page 1
  const resetAndSet = (setter: (v: string) => void) => (v: string) => { setter(v); setPage(1) }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">Mentorship</h1>
        <p className="text-xs text-gray-500">Find a mentor to guide your next career step</p>
      </div>
    </>
  )

  return (
    <MentorshipShell topBar={topBar}>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-navy-600">Find your mentor</h2>
          <p className="text-sm text-gray-500 mt-1">Real professionals, real availability — book a session that fits your goals.</p>
        </div>

        {/* Search + sort */}
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, title, or company…"
            className="input-premium flex-1"
          />
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}
            className="input-premium md:w-56">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          {/* Filters */}
          <div className="panel-premium p-4 h-fit space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Category</p>
              <select value={category} onChange={(e) => resetAndSet(setCategory)(e.target.value)} className="input-premium text-sm">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            {filterOptions.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Skill</p>
                <select value={skill} onChange={(e) => resetAndSet(setSkill)(e.target.value)} className="input-premium text-sm">
                  <option value="">Any skill</option>
                  {filterOptions.skills.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {filterOptions.languages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Language</p>
                <select value={language} onChange={(e) => resetAndSet(setLanguage)(e.target.value)} className="input-premium text-sm">
                  <option value="">Any language</option>
                  {filterOptions.languages.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {filterOptions.countries.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Country</p>
                <select value={country} onChange={(e) => resetAndSet(setCountry)(e.target.value)} className="input-premium text-sm">
                  <option value="">Any country</option>
                  {filterOptions.countries.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Min. experience (yrs)</p>
              <input type="number" min={0} value={minExperience}
                onChange={(e) => resetAndSet(setMinExperience)(e.target.value)}
                className="input-premium text-sm" placeholder="Any" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Max. price (₹/session)</p>
              <input type="number" min={0} value={maxPrice}
                onChange={(e) => resetAndSet(setMaxPrice)(e.target.value)}
                className="input-premium text-sm" placeholder="Any" />
            </div>
            {(category || skill || language || country || minExperience || maxPrice || search) && (
              <button
                onClick={() => { setSearch(''); setCategory(''); setSkill(''); setLanguage(''); setCountry(''); setMinExperience(''); setMaxPrice(''); setPage(1) }}
                className="text-xs text-royal-600 hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Results */}
          <div>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
            )}

            {!loading && data && (
              <p className="text-xs text-gray-500 mb-3">{data.total} mentor{data.total === 1 ? '' : 's'} found</p>
            )}

            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {loading && Array.from({ length: 6 }).map((_, i) => <MentorCardSkeleton key={i} />)}
              {!loading && data?.mentors.map((m) => <MentorCard key={m.id} m={m} />)}
            </div>

            {!loading && data && data.mentors.length === 0 && (
              <div className="panel-premium p-12 text-center">
                <div className="text-4xl mb-3">🧑‍🏫</div>
                <p className="font-semibold text-gray-800">No mentors match yet</p>
                <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                  {data.total === 0 && !search && !category && !skill && !language && !country
                    ? "Mentorship is brand new on SahiCareer — mentors are being onboarded now. Check back soon, or try again once mentors are approved."
                    : "No mentors match these filters. Try clearing a few and searching again."}
                </p>
              </div>
            )}

            {!loading && data && data.total_pages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">← Prev</button>
                <span className="text-sm text-gray-500">Page {data.page} of {data.total_pages}</span>
                <button disabled={page >= data.total_pages} onClick={() => setPage((p) => p + 1)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Next →</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </MentorshipShell>
  )
}
