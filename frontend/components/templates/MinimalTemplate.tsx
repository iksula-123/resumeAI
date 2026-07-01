import type { ResumeContent } from '../ResumeTemplates'

export default function MinimalTemplate({ data }: { data: ResumeContent }) {
  const { personalInfo: p, summary, experience = [], education = [], skills = [] } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name)

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-sans bg-white px-8 py-7">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-light text-gray-900 tracking-tight">{p?.fullName || 'John Doe'}</h1>
        <div className="text-gray-500 mt-0.5">{p?.jobTitle}</div>
        <div className="flex gap-4 mt-2 text-gray-400 text-[9px]">
          {p?.email && <span>{p.email}</span>}
          {p?.phone && <span>{p.phone}</span>}
          {p?.location && <span>{p.location}</span>}
        </div>
      </div>

      {summary && (
        <section className="mb-4">
          <p className="text-gray-500 border-l-2 border-gray-200 pl-3">{summary}</p>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">Experience</h2>
          {experience.map((e, i) => (
            <div key={i} className="mb-3 grid grid-cols-[1fr,auto] gap-x-4">
              <div>
                <div className="font-medium text-gray-800">{e.position}</div>
                <div className="text-gray-500">{e.company}{e.location ? `, ${e.location}` : ''}</div>
                <ul className="mt-1 space-y-0.5">
                  {(e.bullets||[]).map((b,j) => (
                    <li key={j} className="text-gray-500 flex gap-1.5"><span className="text-gray-300">–</span>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="text-gray-400 text-[9px] whitespace-nowrap text-right">{e.startDate}<br/>{e.current ? 'Present' : e.endDate}</div>
            </div>
          ))}
        </section>
      )}

      {education.length > 0 && (
        <section className="mb-4">
          <h2 className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">Education</h2>
          {education.map((e, i) => (
            <div key={i} className="grid grid-cols-[1fr,auto] gap-x-4 mb-1.5">
              <div>
                <div className="font-medium text-gray-800">{e.degree}{e.field ? ` in ${e.field}` : ''}</div>
                <div className="text-gray-500">{e.institution}</div>
              </div>
              <div className="text-gray-400 text-[9px] whitespace-nowrap text-right">{e.startDate}<br/>{e.endDate}</div>
            </div>
          ))}
        </section>
      )}

      {skillNames.length > 0 && (
        <section>
          <h2 className="text-[8px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-2">Skills</h2>
          <div className="flex flex-wrap gap-1.5">
            {skillNames.map((s, i) => (
              <span key={i} className="text-gray-500 text-[9px] bg-gray-50 px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
