import type { ResumeContent } from '../ResumeTemplates'

export default function ModernTemplate({ data }: { data: ResumeContent }) {
  const { personalInfo: p, summary, experience = [], education = [], skills = [], languages = [] } = data
  const normalSkills = skills.map(s => typeof s === 'string' ? { name: s, level: 75 } : s)

  return (
    <div className="flex w-full min-h-full text-[10px] leading-relaxed font-sans bg-white">
      {/* Left sidebar */}
      <div className="w-[38%] bg-[#1e3a8a] text-white flex flex-col py-6 px-4 gap-4 flex-shrink-0">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-blue-400 border-2 border-white flex items-center justify-center text-2xl font-bold">
            {p?.fullName?.[0] || 'J'}
          </div>
          <div className="text-center">
            <div className="font-bold text-sm leading-tight">{p?.fullName || 'John Doe'}</div>
            <div className="text-blue-300 text-[9px] mt-0.5">{p?.jobTitle}</div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <div className="text-blue-300 text-[8px] uppercase font-bold tracking-widest mb-1.5">Contact</div>
          <div className="space-y-1">
            {p?.location && <div className="flex gap-1.5 text-blue-100"><span>📍</span>{p.location}</div>}
            {p?.phone && <div className="flex gap-1.5 text-blue-100"><span>📞</span>{p.phone}</div>}
            {p?.email && <div className="flex gap-1.5 text-blue-100 break-all"><span>✉</span>{p.email}</div>}
            {p?.linkedin && <div className="flex gap-1.5 text-blue-100"><span>in</span>{p.linkedin}</div>}
            {p?.github && <div className="flex gap-1.5 text-blue-100"><span>⊙</span>{p.github}</div>}
          </div>
        </div>

        {/* Skills */}
        {normalSkills.length > 0 && (
          <div>
            <div className="text-blue-300 text-[8px] uppercase font-bold tracking-widest mb-1.5">Skills</div>
            <div className="space-y-1.5">
              {normalSkills.map((s, i) => (
                <div key={i}>
                  <div className="text-blue-100">{s.name}</div>
                  <div className="flex gap-0.5 mt-0.5">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className="h-1 flex-1 rounded-full" style={{ background: n <= Math.round((s.level||70)/20) ? '#93c5fd' : 'rgba(255,255,255,0.2)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {languages.length > 0 && (
          <div>
            <div className="text-blue-300 text-[8px] uppercase font-bold tracking-widest mb-1.5">Languages</div>
            {languages.map((l, i) => (
              <div key={i} className="flex justify-between text-blue-100 mb-1">
                <span>{typeof l === 'string' ? l : l.name}</span>
                {typeof l !== 'string' && <span className="text-blue-300">{l.proficiency}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right main */}
      <div className="flex-1 px-5 py-6 space-y-4">
        {summary && (
          <section>
            <h2 className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest border-b border-[#1e3a8a] pb-0.5 mb-1.5">Professional Summary</h2>
            <p className="text-gray-600">{summary}</p>
          </section>
        )}
        {experience.length > 0 && (
          <section>
            <h2 className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest border-b border-[#1e3a8a] pb-0.5 mb-1.5">Work Experience</h2>
            {experience.map((e, i) => (
              <div key={i} className="mb-2">
                <div className="flex justify-between"><span className="font-bold text-gray-800">{e.position}</span><span className="text-gray-400">{e.startDate} – {e.current ? 'Present' : e.endDate}</span></div>
                <div className="text-gray-500">{e.company}{e.location ? ` · ${e.location}` : ''}</div>
                <ul className="mt-0.5 space-y-0.5 pl-3">
                  {(e.bullets || []).map((b, j) => <li key={j} className="text-gray-600 before:content-['•'] before:mr-1.5">{b}</li>)}
                </ul>
              </div>
            ))}
          </section>
        )}
        {education.length > 0 && (
          <section>
            <h2 className="text-[8px] font-bold text-[#1e3a8a] uppercase tracking-widest border-b border-[#1e3a8a] pb-0.5 mb-1.5">Education</h2>
            {education.map((e, i) => (
              <div key={i} className="flex justify-between">
                <div><div className="font-bold text-gray-800">{e.degree}{e.field ? ` in ${e.field}` : ''}</div><div className="text-gray-500">{e.institution}</div></div>
                <div className="text-gray-400">{e.startDate} – {e.endDate}</div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
