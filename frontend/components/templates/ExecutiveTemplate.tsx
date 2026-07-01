import type { ResumeContent } from '../ResumeTemplates'

export default function ExecutiveTemplate({ data }: { data: ResumeContent }) {
  const { personalInfo: p, summary, experience = [], education = [], skills = [], certifications = [], achievements = [] } = data
  const skillNames = skills.map(s => typeof s === 'string' ? s : s.name)

  return (
    <div className="w-full min-h-full text-[10px] leading-relaxed font-sans bg-white">
      {/* Executive header */}
      <div className="bg-gray-900 text-white px-7 py-5">
        <h1 className="text-xl font-bold tracking-wider uppercase">{p?.fullName || 'John Doe'}</h1>
        <div className="text-gray-400 tracking-widest text-xs mt-0.5 uppercase">{p?.jobTitle}</div>
        <div className="h-px bg-gray-600 my-2" />
        <div className="flex gap-5 text-gray-400 text-[9px] flex-wrap">
          {p?.email && <span>✉ {p.email}</span>}
          {p?.phone && <span>📞 {p.phone}</span>}
          {p?.location && <span>📍 {p.location}</span>}
          {p?.linkedin && <span>in {p.linkedin}</span>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr,0.45fr] gap-0">
        {/* Main left column */}
        <div className="px-6 py-4 space-y-4 border-r border-gray-200">
          {summary && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-900 flex items-center gap-2 mb-1.5">
                <span className="flex-1 h-px bg-gray-200" />Executive Profile<span className="flex-1 h-px bg-gray-200" />
              </h2>
              <p className="text-gray-600">{summary}</p>
            </section>
          )}

          {experience.length > 0 && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-900 flex items-center gap-2 mb-2">
                <span className="flex-1 h-px bg-gray-200" />Career History<span className="flex-1 h-px bg-gray-200" />
              </h2>
              {experience.map((e, i) => (
                <div key={i} className="mb-3">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-900">{e.position}</span>
                    <span className="text-gray-500 text-[9px]">{e.startDate} – {e.current ? 'Present' : e.endDate}</span>
                  </div>
                  <div className="font-medium text-gray-600 italic">{e.company}{e.location ? ` | ${e.location}` : ''}</div>
                  <ul className="mt-1 space-y-0.5 list-disc pl-3.5">
                    {(e.bullets||[]).map((b,j) => <li key={j} className="text-gray-600">{b}</li>)}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {achievements.length > 0 && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-900 flex items-center gap-2 mb-2">
                <span className="flex-1 h-px bg-gray-200" />Key Achievements<span className="flex-1 h-px bg-gray-200" />
              </h2>
              <ul className="space-y-1">
                {achievements.map((a, i) => (
                  <li key={i} className="flex gap-2 text-gray-600"><span className="text-gray-900 font-bold">▸</span>{a}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <div className="bg-gray-50 px-4 py-4 space-y-4">
          {education.length > 0 && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-2">Education</h2>
              {education.map((e, i) => (
                <div key={i} className="mb-2">
                  <div className="font-bold text-gray-800">{e.degree}</div>
                  <div className="text-gray-600 italic">{e.field}</div>
                  <div className="text-gray-500">{e.institution}</div>
                  <div className="text-gray-400 text-[9px]">{e.startDate} – {e.endDate}</div>
                </div>
              ))}
            </section>
          )}

          {skillNames.length > 0 && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-2">Core Competencies</h2>
              <div className="space-y-1">
                {skillNames.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-700">
                    <span className="text-gray-400">◆</span>{s}
                  </div>
                ))}
              </div>
            </section>
          )}

          {certifications.length > 0 && (
            <section>
              <h2 className="text-[8px] font-bold uppercase tracking-widest text-gray-700 mb-2">Certifications</h2>
              {certifications.map((c, i) => (
                <div key={i} className="mb-1.5">
                  <div className="font-medium text-gray-800">{c.name}</div>
                  <div className="text-gray-500">{c.issuer} · {c.date}</div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
