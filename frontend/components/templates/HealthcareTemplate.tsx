import type { ResumeContent } from '../ResumeTemplates'

const ACCENT = '#0d9488'

/**
 * Healthcare — clean, trustworthy clinical CV. Licenses & Certifications get
 * a bordered, elevated treatment (strong hierarchy, per the brief) without
 * using any graphics/icons for the credential itself — still plain text,
 * ATS-safe. "Professional Memberships" (a common ask for this persona) isn't
 * rendered as its own section — there's no representable field for it in
 * ResumeContent without repurposing user-entered interests in a misleading
 * way; noted as a known limitation rather than faked.
 */
export default function HealthcareTemplate({ data }: { data: ResumeContent }) {
  const {
    personalInfo: p, summary, experience = [], education = [], skills = [],
    projects = [], certifications = [], achievements = [], languages = [], interests = [],
  } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)

  const heading = (text: string) => (
    <h2 className="font-bold uppercase text-[9px] tracking-widest mb-2" style={{ color: ACCENT }}>{text}</h2>
  )

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-sans bg-white px-8 py-6">
      {/* Header */}
      <div className="border-b-2 pb-3 mb-4" style={{ borderColor: ACCENT }}>
        <h1 className="text-xl font-bold text-gray-900">{p?.fullName || 'John Doe'}</h1>
        {p?.jobTitle && <div className="font-medium mt-0.5" style={{ color: ACCENT }}>{p.jobTitle}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-gray-500 text-[9px]">
          {p?.location && <span>{p.location}</span>}
          {p?.phone && <span>{p.phone}</span>}
          {p?.email && <span>{p.email}</span>}
          {p?.linkedin && <span>{p.linkedin}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3">
          {heading('Professional Profile')}
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-3">
          {heading('Clinical Experience')}
          {experience.map((e, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between items-start">
                <div><span className="font-bold text-gray-800">{e.position}</span>{e.company && <span className="text-gray-500"> · {e.company}</span>}</div>
                <span className="text-gray-400 text-[9px] whitespace-nowrap ml-2">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {(e.bullets || []).map((b, j) => <li key={j} className="text-gray-600 flex gap-1.5"><span style={{ color: ACCENT }}>•</span>{b}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Licenses & Certifications — elevated hierarchy: bordered card, no icons */}
      {certifications.length > 0 && (
        <section className="mb-3">
          {heading('Licenses & Certifications')}
          <div className="border-l-4 rounded-r-lg px-3 py-2 space-y-1.5" style={{ borderColor: ACCENT, backgroundColor: `${ACCENT}0d` }}>
            {certifications.map((c, i) => (
              <div key={i}>
                <span className="font-bold text-gray-800">{c.name}</span>
                {(c.issuer || c.date) && <span className="text-gray-500"> — {[c.issuer, c.date].filter(Boolean).join(', ')}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {skillNames.length > 0 && (
        <section className="mb-3">
          {heading('Clinical Skills')}
          <div className="flex flex-wrap gap-1.5">
            {skillNames.map((s, i) => (
              <span key={i} className="text-gray-700 text-[9px] border px-2 py-0.5 rounded" style={{ borderColor: `${ACCENT}50` }}>{s}</span>
            ))}
          </div>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-3">
          {heading('Education')}
          {education.map((e, i) => (
            <div key={i} className="flex justify-between mb-1">
              <div>
                <div className="font-bold text-gray-800">{e.degree}{e.field ? ` in ${e.field}` : ''}</div>
                <div className="text-gray-500">{e.institution}</div>
              </div>
              <div className="text-gray-400 text-[9px] text-right">{e.startDate} – {e.endDate}</div>
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-3">
          {heading('Clinical Training & Projects')}
          {projects.map((proj, i) => (
            <div key={i} className="mb-2">
              <div className="font-bold text-gray-800">{proj.name}{proj.technologies && <span className="font-normal text-gray-500"> — {proj.technologies}</span>}</div>
              {proj.description && <div className="text-gray-600">{proj.description}</div>}
            </div>
          ))}
        </section>
      )}

      {achievements.length > 0 && (
        <section className="mb-3">
          {heading('Achievements')}
          <ul className="space-y-0.5">
            {achievements.map((a, i) => <li key={i} className="text-gray-600 flex gap-1.5"><span style={{ color: ACCENT }}>•</span>{a}</li>)}
          </ul>
        </section>
      )}

      {languages.length > 0 && (
        <section className="mb-3">
          {heading('Languages')}
          <div className="text-gray-600">
            {languages.map((l, i) => typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join('  ·  ')}
          </div>
        </section>
      )}

      {interests.length > 0 && (
        <section>
          {heading('Interests')}
          <div className="text-gray-600">{interests.join('  ·  ')}</div>
        </section>
      )}
    </div>
  )
}
