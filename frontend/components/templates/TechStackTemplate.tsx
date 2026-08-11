import type { ResumeContent } from '../ResumeTemplates'
import { groupSkillsByCategory } from '@/lib/skillCategories'

const ACCENT = '#0ea5e9'

/**
 * Tech Stack — premium single-column developer resume. Sections shown are
 * driven purely by data presence (matching shared/template-specs.json's
 * "tech-stack" sections list — every field it declares), same rule the PDF/
 * DOCX builder uses (see backend/routers/export.py TEMPLATE_BUILDERS /
 * services/skill_categories.py). No skill bars, star ratings, or icons in
 * place of text — plain, ATS-safe text throughout.
 */
export default function TechStackTemplate({ data }: { data: ResumeContent }) {
  const {
    personalInfo: p, summary, experience = [], education = [], skills = [],
    projects = [], certifications = [], achievements = [], languages = [],
  } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)
  const grouped = groupSkillsByCategory(skillNames)

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
          {p?.github && <span>{p.github}</span>}
          {p?.website && <span>{p.website}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest mb-1" style={{ color: ACCENT }}>Professional Summary</h2>
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {grouped.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Technical Skills</h2>
          <div className="space-y-1">
            {grouped.map(g => (
              <div key={g.category} className="flex gap-2">
                <span className="font-semibold text-gray-700 w-20 flex-shrink-0">{g.category}:</span>
                <span className="text-gray-600">{g.skills.join(', ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Experience</h2>
          {experience.map((e, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between items-start">
                <div><span className="font-bold text-gray-800">{e.position}</span>{e.company && <span className="text-gray-500"> · {e.company}</span>}</div>
                <span className="text-gray-400 text-[9px] whitespace-nowrap ml-2">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {(e.bullets || []).map((b, j) => (
                  <li key={j} className="text-gray-600 flex gap-1.5"><span style={{ color: ACCENT }}>▹</span>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Projects</h2>
          {projects.map((proj, i) => (
            <div key={i} className="mb-2">
              <div className="font-bold text-gray-800">{proj.name}{proj.technologies && <span className="font-normal text-gray-500"> — {proj.technologies}</span>}</div>
              {proj.description && <div className="text-gray-600">{proj.description}</div>}
            </div>
          ))}
        </section>
      )}

      {certifications.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Certifications</h2>
          {certifications.map((c, i) => (
            <div key={i} className="text-gray-600">
              <span className="font-medium text-gray-800">{c.name}</span>
              {(c.issuer || c.date) && <span className="text-gray-400"> — {[c.issuer, c.date].filter(Boolean).join(', ')}</span>}
            </div>
          ))}
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Education</h2>
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

      {achievements.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Achievements</h2>
          <ul className="space-y-0.5">
            {achievements.map((a, i) => <li key={i} className="text-gray-600 flex gap-1.5"><span style={{ color: ACCENT }}>▹</span>{a}</li>)}
          </ul>
        </section>
      )}

      {languages.length > 0 && (
        <section>
          <h2 className="font-bold uppercase text-[9px] tracking-widest border-b pb-0.5 mb-2" style={{ color: ACCENT, borderColor: '#e5e7eb' }}>Languages</h2>
          <div className="text-gray-600">
            {languages.map((l, i) => typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join('  ·  ')}
          </div>
        </section>
      )}
    </div>
  )
}
