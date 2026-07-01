import type { ResumeContent } from '../ResumeTemplates'

export default function ProfessionalTemplate({ data }: { data: ResumeContent }) {
  const { personalInfo: p, summary, experience = [], education = [], skills = [] } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name)

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-serif bg-white px-8 py-6">
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
        <h1 className="text-xl font-bold text-gray-900 tracking-wide">{p?.fullName || 'John Doe'}</h1>
        <div className="text-gray-600 mt-1">{p?.jobTitle}</div>
        <div className="flex items-center justify-center gap-3 mt-1.5 text-gray-500 text-[9px] flex-wrap">
          {p?.email && <span>✉ {p.email}</span>}
          {p?.phone && <span>📞 {p.phone}</span>}
          {p?.location && <span>📍 {p.location}</span>}
          {p?.linkedin && <span>in {p.linkedin}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-3">
          <h2 className="font-bold text-gray-900 uppercase text-[9px] tracking-widest mb-1">Professional Summary</h2>
          <p className="text-gray-600">{summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold text-gray-900 uppercase text-[9px] tracking-widest border-b border-gray-300 pb-0.5 mb-2">Experience</h2>
          {experience.map((e, i) => (
            <div key={i} className="mb-2.5">
              <div className="flex justify-between items-start">
                <div><span className="font-bold text-gray-800">{e.position}</span> — <span className="italic text-gray-600">{e.company}</span></div>
                <span className="text-gray-500 text-[9px] whitespace-nowrap ml-2">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
              </div>
              {e.location && <div className="text-gray-500 text-[9px]">{e.location}</div>}
              <ul className="mt-1 space-y-0.5 list-disc pl-4">
                {(e.bullets||[]).map((b,j) => <li key={j} className="text-gray-600">{b}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-3">
          <h2 className="font-bold text-gray-900 uppercase text-[9px] tracking-widest border-b border-gray-300 pb-0.5 mb-2">Education</h2>
          {education.map((e, i) => (
            <div key={i} className="flex justify-between mb-1.5">
              <div>
                <div className="font-bold text-gray-800">{e.degree}{e.field ? ` in ${e.field}` : ''}</div>
                <div className="italic text-gray-600">{e.institution}</div>
              </div>
              <div className="text-gray-500 text-[9px] text-right">{e.startDate} – {e.endDate}{e.gpa ? <><br/>GPA: {e.gpa}</> : ''}</div>
            </div>
          ))}
        </section>
      )}

      {skillNames.length > 0 && (
        <section>
          <h2 className="font-bold text-gray-900 uppercase text-[9px] tracking-widest border-b border-gray-300 pb-0.5 mb-2">Technical Skills</h2>
          <div className="flex flex-wrap gap-2">
            {skillNames.map((s, i) => (
              <span key={i} className="border border-gray-400 text-gray-700 px-2 py-0.5 text-[9px]">{s}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
