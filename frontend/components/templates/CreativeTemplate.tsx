import type { ResumeContent } from '../ResumeTemplates'

export default function CreativeTemplate({ data }: { data: ResumeContent }) {
  const { personalInfo: p, summary, experience = [], education = [], skills = [] } = data
  const normalSkills = skills.map(s => typeof s === 'string' ? { name: s, level: 75 } : s)

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-sans bg-white">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white px-7 py-5">
        <h1 className="text-xl font-bold tracking-tight">{p?.fullName || 'John Doe'}</h1>
        <div className="text-purple-200 mt-0.5 text-xs">{p?.jobTitle}</div>
        <div className="flex gap-3 mt-2 text-purple-100 text-[9px] flex-wrap">
          {p?.email && <span>✉ {p.email}</span>}
          {p?.phone && <span>📞 {p.phone}</span>}
          {p?.location && <span>📍 {p.location}</span>}
          {p?.linkedin && <span>in {p.linkedin}</span>}
        </div>
      </div>

      <div className="flex">
        {/* Left accent */}
        <div className="w-1 bg-gradient-to-b from-purple-600 to-blue-600 flex-shrink-0" />

        <div className="flex-1 px-6 py-4 space-y-4">
          {summary && (
            <section>
              <h2 className="font-bold text-purple-700 text-[8px] uppercase tracking-widest mb-1">About Me</h2>
              <p className="text-gray-600">{summary}</p>
            </section>
          )}

          {experience.length > 0 && (
            <section>
              <h2 className="font-bold text-purple-700 text-[8px] uppercase tracking-widest mb-2">Experience</h2>
              {experience.map((e, i) => (
                <div key={i} className="mb-2.5 pl-3 border-l-2 border-purple-100">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-800">{e.position}</span>
                    <span className="text-[9px] text-gray-400">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
                  </div>
                  <div className="text-indigo-600 font-medium">{e.company}{e.location ? ` · ${e.location}` : ''}</div>
                  <ul className="mt-0.5 space-y-0.5">
                    {(e.bullets||[]).map((b,j) => (
                      <li key={j} className="text-gray-600 flex gap-1.5"><span className="text-purple-400">›</span>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          <div className="grid grid-cols-2 gap-4">
            {education.length > 0 && (
              <section>
                <h2 className="font-bold text-purple-700 text-[8px] uppercase tracking-widest mb-2">Education</h2>
                {education.map((e, i) => (
                  <div key={i} className="mb-1.5">
                    <div className="font-bold text-gray-800">{e.degree}</div>
                    <div className="text-indigo-600">{e.field}</div>
                    <div className="text-gray-500">{e.institution}</div>
                    <div className="text-gray-400 text-[9px]">{e.startDate} – {e.endDate}</div>
                  </div>
                ))}
              </section>
            )}

            {normalSkills.length > 0 && (
              <section>
                <h2 className="font-bold text-purple-700 text-[8px] uppercase tracking-widest mb-2">Skills</h2>
                <div className="space-y-1">
                  {normalSkills.slice(0,6).map((s, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-gray-600 mb-0.5">
                        <span>{s.name}</span>
                        <span className="text-[9px] text-gray-400">{s.level}%</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${s.level}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
