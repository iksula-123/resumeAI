import type { ResumeContent } from '../ResumeTemplates'
import CustomSectionsBlock from './CustomSectionsBlock'

const ACCENT = '#1e293b'

/**
 * International — clean, conservative global CV. Deliberately does NOT
 * render a photo, date of birth, gender, marital status, religion, or
 * nationality — those fields don't exist on ResumeContent.personalInfo at
 * all (only fullName/jobTitle/email/phone/location/linkedin/website/github),
 * so this is satisfied by construction, not by extra filtering logic. If a
 * market-specific field like this is ever added to the data model, it must
 * stay opt-in here, never default-rendered.
 */
export default function InternationalTemplate({ data }: { data: ResumeContent }) {
  const {
    personalInfo: p, summary, experience = [], education = [], skills = [],
    projects = [], certifications = [], achievements = [], languages = [], interests = [],
    customSections = [],
  } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)

  const heading = (text: string) => (
    <h2 className="font-bold uppercase text-[9px] tracking-[0.15em] border-b pb-1 mb-2" style={{ color: ACCENT, borderColor: '#cbd5e1' }}>{text}</h2>
  )

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-serif bg-white px-8 py-6">
      {/* Header */}
      <div className="pb-3 mb-4 border-b" style={{ borderColor: ACCENT }}>
        <h1 className="text-xl font-bold" style={{ color: ACCENT }}>{p?.fullName || 'John Doe'}</h1>
        {p?.jobTitle && <div className="text-gray-600 mt-0.5">{p.jobTitle}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-gray-500 text-[9px]">
          {p?.email && <span>{p.email}</span>}
          {p?.phone && <span>{p.phone}</span>}
          {p?.location && <span>{p.location}</span>}
          {p?.linkedin && <span>{p.linkedin}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3">
          {heading('Professional Summary')}
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {skillNames.length > 0 && (
        <section className="mb-3">
          {heading('Core Competencies')}
          <p className="text-gray-600">{skillNames.join('  ·  ')}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-3">
          {heading('Professional Experience')}
          {experience.map((e, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between">
                <span className="font-bold text-gray-800">{e.position}{e.company && `, ${e.company}`}</span>
                <span className="text-gray-500 text-[9px] whitespace-nowrap ml-2">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
              </div>
              {e.location && <div className="text-gray-500 text-[9px]">{e.location}</div>}
              <ul className="mt-1 space-y-0.5 list-disc pl-4">
                {(e.bullets || []).map((b, j) => <li key={j} className="text-gray-600">{b}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      {achievements.length > 0 && (
        <section className="mb-3">
          {heading('Key Achievements')}
          <ul className="space-y-0.5 list-disc pl-4">
            {achievements.map((a, i) => <li key={i} className="text-gray-600">{a}</li>)}
          </ul>
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-3">
          {heading('Education')}
          {education.map((e, i) => (
            <div key={i} className="flex justify-between mb-1">
              <div>
                <div className="font-bold text-gray-800">{e.degree}{e.field ? `, ${e.field}` : ''}</div>
                <div className="text-gray-500">{e.institution}</div>
              </div>
              <div className="text-gray-400 text-[9px] text-right">{e.startDate} – {e.endDate}</div>
            </div>
          ))}
        </section>
      )}

      {certifications.length > 0 && (
        <section className="mb-3">
          {heading('Certifications')}
          {certifications.map((c, i) => (
            <div key={i} className="text-gray-600">
              <span className="font-medium text-gray-800">{c.name}</span>
              {(c.issuer || c.date) && <span className="text-gray-500"> — {[c.issuer, c.date].filter(Boolean).join(', ')}</span>}
            </div>
          ))}
        </section>
      )}

      {projects.length > 0 && (
        <section className="mb-3">
          {heading('Projects')}
          {projects.map((proj, i) => (
            <div key={i} className="mb-2">
              <div className="font-bold text-gray-800">{proj.name}{proj.technologies && <span className="font-normal text-gray-500"> — {proj.technologies}</span>}</div>
              {proj.description && <div className="text-gray-600">{proj.description}</div>}
            </div>
          ))}
        </section>
      )}

      {languages.length > 0 && (
        <section className="mb-3">
          {heading('Languages')}
          <p className="text-gray-600">
            {languages.map((l, i) => typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join('  ·  ')}
          </p>
        </section>
      )}

      {interests.length > 0 && (
        <section className="mb-3">
          {heading('Additional Information')}
          <p className="text-gray-600">{interests.join('  ·  ')}</p>
        </section>
      )}

      <CustomSectionsBlock sections={customSections} headingClassName="font-bold uppercase text-[9px] tracking-[0.15em] border-b pb-1 mb-2" headingStyle={{ color: ACCENT, borderColor: '#cbd5e1' }} />
    </div>
  )
}
