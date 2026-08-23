import ModernTemplate from './templates/ModernTemplate'
import ProfessionalTemplate from './templates/ProfessionalTemplate'
import MinimalTemplate from './templates/MinimalTemplate'
import CreativeTemplate from './templates/CreativeTemplate'
import ExecutiveTemplate from './templates/ExecutiveTemplate'
import TechStackTemplate from './templates/TechStackTemplate'
import FresherTemplate from './templates/FresherTemplate'
import AcademicTemplate from './templates/AcademicTemplate'
import HealthcareTemplate from './templates/HealthcareTemplate'
import InternationalTemplate from './templates/InternationalTemplate'
import templateSpecs from '../../shared/template-specs.json'

export interface Skill { name: string; level?: number }
export interface Experience {
  id: string; position: string; company: string; location?: string
  startDate: string; endDate: string; current: boolean; bullets: string[]
}
export interface Education {
  id: string; degree: string; field: string; institution: string
  location?: string; startDate: string; endDate: string; gpa?: string
}
export interface Language { name: string; proficiency?: string }
export interface Certification { id: string; name: string; issuer?: string; date?: string }

export interface ResumeContent {
  personalInfo: {
    fullName?: string; jobTitle?: string; email?: string; phone?: string
    location?: string; linkedin?: string; website?: string; github?: string
  }
  summary?: string
  experience?: Experience[]
  education?: Education[]
  skills?: (Skill | string)[]
  projects?: { id: string; name: string; technologies?: string; description?: string }[]
  certifications?: Certification[]
  achievements?: string[]
  languages?: (Language | string)[]
  interests?: string[]
  customSections?: { id: string; title: string; content: string }[]
}

export interface TemplateSpec {
  id: string
  name: string
  category: string
  description: string
  layoutFamily: string
  accent: string
  font: string
  sections: string[]
  atsCompatibility: string
  atsNotes?: string
  bestFor: string[]
  popular?: boolean
  pro?: boolean
  status: 'available' | 'coming_soon'
}

// shared/template-specs.json is the single source of truth for template
// metadata — read by both this file and backend/routers/export.py. Do not
// hand-maintain a second copy of this list here.
export const TEMPLATE_SPECS: TemplateSpec[] = (templateSpecs as { templates: TemplateSpec[] }).templates

// Only templates with a real React component + PDF/DOCX design go in the
// picker today. The 5 new template ids exist in the shared spec (status:
// "coming_soon") for the export foundation, but stay hidden from the UI
// until their visual designs are implemented — same 5 items, same shape,
// same order as before this change.
export const TEMPLATE_LIST = TEMPLATE_SPECS.filter(t => t.status === 'available')

interface Props {
  content: ResumeContent
  template?: string
}

export default function ResumeTemplates({ content, template = 'modern' }: Props) {
  switch (template) {
    case 'professional':  return <ProfessionalTemplate data={content} />
    case 'minimal':       return <MinimalTemplate data={content} />
    case 'creative':      return <CreativeTemplate data={content} />
    case 'executive':     return <ExecutiveTemplate data={content} />
    case 'tech-stack':    return <TechStackTemplate data={content} />
    case 'fresher':       return <FresherTemplate data={content} />
    case 'academic':      return <AcademicTemplate data={content} />
    case 'healthcare':    return <HealthcareTemplate data={content} />
    case 'international': return <InternationalTemplate data={content} />
    default:              return <ModernTemplate data={content} />
  }
}
