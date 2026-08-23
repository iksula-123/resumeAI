// Canonical, editable Resume Builder content shape + small helpers.
//
// Extracted from frontend/app/resumes/[id]/edit/page.tsx (SahiCareer UI/UX +
// Gamification phase) so the Resume Editor and the new Create-from-Scratch
// wizard (frontend/app/resumes/create/page.tsx) share ONE definition instead
// of two drifting copies. This is the stricter, editor-facing shape (fields
// required, not optional) — it is structurally compatible with the looser
// `ResumeContent` exported by components/ResumeTemplates.tsx (used for
// preview/PDF/DOCX rendering), so a value of this type can be passed
// directly wherever that type is expected.
//
// Do not add a third resume-content shape anywhere else in the app — patch
// this one.

export interface Skill { name: string; level: number }
export interface Experience {
  id: string; position: string; company: string; location: string
  startDate: string; endDate: string; current: boolean; bullets: string[]
}
export interface Education {
  id: string; degree: string; field: string; institution: string
  location: string; startDate: string; endDate: string; gpa: string
}
export interface Project { id: string; name: string; technologies: string; description: string }
export interface Certification { id: string; name: string; issuer: string; date: string }
export interface Language { name: string; proficiency: string }
export interface CustomSection { id: string; title: string; content: string }

export interface ResumeContent {
  personalInfo: { fullName: string; jobTitle: string; email: string; phone: string; location: string; linkedin: string; website: string; github: string }
  summary: string
  experience: Experience[]
  education: Education[]
  skills: Skill[]
  projects: Project[]
  certifications: Certification[]
  achievements: string[]
  languages: Language[]
  interests: string[]
  customSections: CustomSection[]
}

// Section nav config — shared by the Resume Editor's left rail and the
// Create-from-Scratch wizard's step list (Achievements/Languages/Interests
// are wizard-skippable but keep the same key/icon/label everywhere so a
// resume built in one flow reads identically in the other).
export const RESUME_SECTIONS = [
  { key: 'personalInfo', icon: '👤', label: 'Personal Information' },
  { key: 'summary', icon: '📝', label: 'Professional Summary' },
  { key: 'experience', icon: '💼', label: 'Work Experience' },
  { key: 'education', icon: '🎓', label: 'Education' },
  { key: 'skills', icon: '⚡', label: 'Skills' },
  { key: 'projects', icon: '🚀', label: 'Projects' },
  { key: 'certifications', icon: '🏆', label: 'Certifications' },
  { key: 'achievements', icon: '🌟', label: 'Achievements' },
  { key: 'languages', icon: '🌐', label: 'Languages' },
  { key: 'interests', icon: '❤️', label: 'Interests' },
] as const

export function uid() { return Math.random().toString(36).slice(2) }

export function emptyContent(): ResumeContent {
  return {
    personalInfo: { fullName: '', jobTitle: '', email: '', phone: '', location: '', linkedin: '', website: '', github: '' },
    summary: '',
    experience: [], education: [], skills: [], projects: [],
    certifications: [], achievements: [], languages: [], interests: [],
    customSections: [],
  }
}

// A lightweight, non-scoring measure of "how much of the resume is filled
// in" — used by the Resume Progress component. This is Profile Completeness,
// deliberately NOT Resume ATS Health (see docs/ATS_ANALYSIS_MODES.md) and
// never sent to or computed from any ATS endpoint.
export interface CompletionSection { key: string; label: string; done: boolean; weight: number }

export function computeCompletion(content: ResumeContent): { pct: number; sections: CompletionSection[] } {
  const p = content.personalInfo
  const sections: CompletionSection[] = [
    { key: 'personalInfo', label: 'Personal Information', done: !!(p.fullName && p.email), weight: 15 },
    { key: 'summary', label: 'Summary', done: !!content.summary?.trim(), weight: 10 },
    { key: 'experience', label: 'Experience', done: content.experience.length > 0, weight: 20 },
    { key: 'education', label: 'Education', done: content.education.length > 0, weight: 15 },
    { key: 'skills', label: 'Skills', done: content.skills.length >= 3, weight: 15 },
    { key: 'projects', label: 'Projects', done: content.projects.length > 0, weight: 10 },
    { key: 'certifications', label: 'Certifications', done: content.certifications.length > 0, weight: 5 },
    { key: 'achievements', label: 'Achievements', done: content.achievements.length > 0, weight: 5 },
    { key: 'languages', label: 'Languages', done: content.languages.length > 0, weight: 3 },
    { key: 'interests', label: 'Interests', done: content.interests.length > 0, weight: 2 },
  ]
  const total = sections.reduce((a, s) => a + s.weight, 0)
  const earned = sections.filter(s => s.done).reduce((a, s) => a + s.weight, 0)
  return { pct: total ? Math.round((earned / total) * 100) : 0, sections }
}
