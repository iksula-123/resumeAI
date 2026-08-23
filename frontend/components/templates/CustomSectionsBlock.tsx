import type { ResumeContent } from '../ResumeTemplates'

/**
 * Shared renderer for user-named freeform sections (content.customSections
 * -- "Professional Development", "Publications", whatever the candidate
 * titled it). One implementation for every template, so a fix here fixes
 * all of them at once (per the CRUD/consistency acceptance test's
 * follow-up: templates weren't rendering Projects/Custom Sections at all --
 * see docs/ATS_NAVIGATION_AND_EDITOR_HANDOFF.md). Each template passes its
 * OWN heading style so this blends into that template's existing visual
 * language instead of imposing one look on every template. The section
 * title is ALWAYS whatever the user actually typed -- never hardcoded,
 * never defaulted to a specific example name. Rendered last, after every
 * fixed section, matching the same order the editor's own "Resume
 * Sections" panel already uses (customSections are appended after the
 * fixed list there too) -- never inserted in the middle of the resume.
 */
export default function CustomSectionsBlock({
  sections,
  headingClassName,
  headingStyle,
  textClassName = 'text-gray-600',
  sectionClassName = 'mb-3',
}: {
  sections: ResumeContent['customSections']
  headingClassName: string
  headingStyle?: React.CSSProperties
  textClassName?: string
  sectionClassName?: string
}) {
  const list = (sections || []).filter(cs => (cs.title || '').trim() || (cs.content || '').trim())
  if (list.length === 0) return null
  return (
    <>
      {list.map(cs => (
        <section key={cs.id} className={sectionClassName}>
          <h2 className={headingClassName} style={headingStyle}>{cs.title || 'Additional Information'}</h2>
          <p className={textClassName} style={{ whiteSpace: 'pre-wrap' }}>{cs.content}</p>
        </section>
      ))}
    </>
  )
}
