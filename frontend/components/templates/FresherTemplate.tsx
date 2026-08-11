import type { ResumeContent } from '../ResumeTemplates'

const ACCENT = '#16a34a'

/**
 * Fresher — modern, confident layout for students/entry-level candidates.
 * "interests" is rendered as Extracurricular Activities, a natural, honest
 * fit for what a student typically lists there (no new field — same
 * `interests: string[]` everyone else uses).
 *
 * Adaptive ordering: when there's no professional experience, Education and
 * Projects move up (right after the objective) instead of leaving a large
 * empty Experience section — the same adaptive rule is mirrored in the PDF/
 * DOCX builder (see backend/routers/export.py's fresher config).
 */
export default function FresherTemplate({ data }: { data: ResumeContent }) {
  const {
    personalInfo: p, summary, experience = [], education = [], skills = [],
    projects = [], certifications = [], achievements = [], languages = [], interests = [],
  } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name).filter(Boolean)
  const hasExperience = experience.length > 0

  const heading = (text: string) => (
    <h2 className="font-bold uppercase text-[9px] tracking-widest mb-2 pb-0.5 border-b-2" style={{ color: ACCENT, borderColor: ACCENT }}>{text}</h2>
  )

  const educationBlock = education.length > 0 && (
    <section className="mb-3">
      {heading('Education')}
      {education.map((e, i) => (
        <div key={i} className="flex justify-between mb-1.5">
          <div>
            <div className="font-bold text-gray-800">{e.degree}{e.field ? ` in ${e.field}` : ''}</div>
            <div className="text-gray-500">{e.institution}{e.gpa ? ` · GPA: ${e.gpa}` : ''}</div>
          </div>
          <div className="text-gray-400 text-[9px] text-right whitespace-nowrap ml-2">{e.startDate} – {e.endDate}</div>
        </div>
      ))}
    </section>
  )

  const projectsBlock = projects.length > 0 && (
    <section className="mb-3">
      {heading('Projects')}
      {projects.map((proj, i) => (
        <div key={i} className="mb-2">
          <div className="font-bold text-gray-800">{proj.name}{proj.technologies && <span className="font-normal text-gray-500"> — {proj.technologies}</span>}</div>
          {proj.description && <div className="text-gray-600">{proj.description}</div>}
        </div>
      ))}
    </section>
  )

  const experienceBlock = hasExperience && (
    <section className="mb-3">
      {heading('Internships & Experience')}
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
  )

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-sans bg-white px-8 py-6">
      {/* Header */}
      <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: `${ACCENT}12` }}>
        <h1 className="text-xl font-bold text-gray-900">{p?.fullName || 'John Doe'}</h1>
        {p?.jobTitle && <div className="font-medium mt-0.5" style={{ color: ACCENT }}>{p.jobTitle}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-gray-500 text-[9px]">
          {p?.location && <span>{p.location}</span>}
          {p?.phone && <span>{p.phone}</span>}
          {p?.email && <span>{p.email}</span>}
          {p?.linkedin && <span>{p.linkedin}</span>}
          {p?.github && <span>{p.github}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3">
          {heading('Career Objective')}
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {/* Adaptive order: no experience → Education + Projects promoted right after the objective */}
      {!hasExperience && (
        <>
          {educationBlock}
          {projectsBlock}
        </>
      )}

      {skillNames.length > 0 && (
        <section className="mb-3">
          {heading('Technical Skills')}
          <div className="flex flex-wrap gap-1.5">
            {skillNames.map((s, i) => (
              <span key={i} className="text-gray-700 text-[9px] px-2 py-0.5 rounded-full" style={{ backgroundColor: `${ACCENT}15` }}>{s}</span>
            ))}
          </div>
        </section>
      )}

      {hasExperience && (
        <>
          {experienceBlock}
          {educationBlock}
          {projectsBlock}
        </>
      )}

      {certifications.length > 0 && (
        <section className="mb-3">
          {heading('Certifications')}
          {certifications.map((c, i) => (
            <div key={i} className="text-gray-600">
              <span className="font-medium text-gray-800">{c.name}</span>
              {(c.issuer || c.date) && <span className="text-gray-400"> — {[c.issuer, c.date].filter(Boolean).join(', ')}</span>}
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

      {interests.length > 0 && (
        <section className="mb-3">
          {heading('Extracurricular Activities')}
          <div className="text-gray-600">{interests.join('  ·  ')}</div>
        </section>
      )}

      {languages.length > 0 && (
        <section>
          {heading('Languages')}
          <div className="text-gray-600">
            {languages.map((l, i) => typeof l === 'string' ? l : `${l.name}${l.proficiency ? ` (${l.proficiency})` : ''}`).join('  ·  ')}
          </div>
        </section>
      )}
    </div>
  )
}
