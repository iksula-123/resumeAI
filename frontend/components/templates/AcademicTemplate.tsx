import type { ResumeContent } from '../ResumeTemplates'
import CustomSectionsBlock from './CustomSectionsBlock'

const ACCENT = '#7c2d12'

/**
 * Academic — formal CV structure for researchers/educators, built entirely
 * from the same ResumeContent fields every other template uses (no second
 * data model). Common academic-CV sections not representable by the current
 * data model (References, standalone Conference Presentations, Professional
 * Memberships) are intentionally NOT fabricated — see the Phase 2 report's
 * "known limitations". Instead, the closest honest fits are relabeled:
 *   projects       → "Publications & Research Projects"
 *   achievements   → "Awards & Honors"
 *   skills         → "Areas of Expertise" (doubles as research interests)
 *   experience     → "Academic & Research Experience" (covers teaching too)
 * Education is promoted near the top, matching standard academic CV convention.
 */
export default function AcademicTemplate({ data }: { data: ResumeContent }) {
  const {
    personalInfo: p, summary, experience = [], education = [], skills = [],
    projects = [], certifications = [], achievements = [], languages = [], interests = [],
    customSections = [],
  } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)

  const heading = (text: string) => (
    <h2 className="font-bold text-[9px] uppercase tracking-widest mb-1.5 flex items-center gap-2" style={{ color: ACCENT }}>
      <span className="flex-1 h-px" style={{ backgroundColor: `${ACCENT}40` }} />{text}<span className="flex-1 h-px" style={{ backgroundColor: `${ACCENT}40` }} />
    </h2>
  )

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-serif bg-white px-8 py-6">
      {/* Header */}
      <div className="text-center border-b-2 pb-3 mb-4" style={{ borderColor: ACCENT }}>
        <h1 className="text-xl font-bold text-gray-900 tracking-wide">{p?.fullName || 'John Doe'}</h1>
        {p?.jobTitle && <div className="text-gray-600 mt-0.5">{p.jobTitle}</div>}
        <div className="flex items-center justify-center gap-3 mt-1.5 text-gray-500 text-[9px] flex-wrap">
          {p?.email && <span>{p.email}</span>}
          {p?.phone && <span>{p.phone}</span>}
          {p?.location && <span>{p.location}</span>}
          {p?.linkedin && <span>{p.linkedin}</span>}
          {p?.website && <span>{p.website}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3.5">
          {heading('Academic Profile')}
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-3.5">
          {heading('Education')}
          {education.map((e, i) => (
            <div key={i} className="flex justify-between mb-1.5">
              <div>
                <div className="font-bold text-gray-800">{e.degree}{e.field ? `, ${e.field}` : ''}</div>
                <div className="italic text-gray-600">{e.institution}</div>
              </div>
              <div className="text-gray-500 text-[9px] text-right whitespace-nowrap ml-2">{e.startDate} – {e.endDate}{e.gpa ? <><br />GPA: {e.gpa}</> : ''}</div>
            </div>
          ))}
        </section>
      )}

      {skillNames.length > 0 && (
        <section className="mb-3.5">
          {heading('Areas of Expertise')}
          <p className="text-gray-600">{skillNames.join('  ·  ')}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-3.5">
          {heading('Academic & Research Experience')}
          {experience.map((e, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between">
                <span className="font-bold text-gray-800">{e.position}</span>
                <span className="text-gray-500 text-[9px]">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
              </div>
              <div className="italic text-gray-600">{e.company}{e.location ? `, ${e.location}` : ''}</div>
              <ul className="mt-1 space-y-0.5 list-disc pl-4">
                {(e.bullets || []).map((b, j) => <li key={j} className="text-gray-600">{b}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-3.5">
          {heading('Publications & Research Projects')}
          {projects.map((proj, i) => (
            <div key={i} className="mb-2">
              <div className="text-gray-800"><span className="font-bold">{proj.name}</span>{proj.technologies && <span className="text-gray-500"> — {proj.technologies}</span>}</div>
              {proj.description && <div className="text-gray-600 pl-3">{proj.description}</div>}
            </div>
          ))}
        </section>
      )}

      {achievements.length > 0 && (
        <section className="mb-3.5">
          {heading('Awards & Honors')}
          <ul className="space-y-0.5 list-disc pl-4">
            {achievements.map((a, i) => <li key={i} className="text-gray-600">{a}</li>)}
          </ul>
        </section>
      )}

      {certifications.length > 0 && (
        <section className="mb-3.5">
          {heading('Certifications & Professional Development')}
          {certifications.map((c, i) => (
            <div key={i} className="text-gray-600">
              <span className="font-medium text-gray-800">{c.name}</span>
              {(c.issuer || c.date) && <span className="text-gray-500"> — {[c.issuer, c.date].filter(Boolean).join(', ')}</span>}
            </div>
          ))}
        </section>
      )}

      {languages.length > 0 && (
        <section className="mb-3.5">
          {heading('Languages')}
          <p className="text-gray-600">
            {languages.map((l, i) => typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join('  ·  ')}
          </p>
        </section>
      )}

      {interests.length > 0 && (
        <section className="mb-3.5">
          {heading('Interests')}
          <p className="text-gray-600">{interests.join('  ·  ')}</p>
        </section>
      )}

      <CustomSectionsBlock sections={customSections}
        headingClassName="font-bold text-[9px] uppercase tracking-widest mb-1.5" headingStyle={{ color: ACCENT }}
        sectionClassName="mb-3.5" />
    </div>
  )
}
