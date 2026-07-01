import ModernTemplate from './templates/ModernTemplate'
import ProfessionalTemplate from './templates/ProfessionalTemplate'
import MinimalTemplate from './templates/MinimalTemplate'
import CreativeTemplate from './templates/CreativeTemplate'
import ExecutiveTemplate from './templates/ExecutiveTemplate'

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
}

export const TEMPLATE_LIST = [
  { id: 'modern', name: 'Modern', category: 'Modern', accent: '#1e3a8a', description: 'Dark sidebar, clean layout', popular: true },
  { id: 'professional', name: 'Professional', category: 'Professional', accent: '#374151', description: 'Classic serif, traditional' },
  { id: 'minimal', name: 'Minimal', category: 'Minimal', accent: '#6b7280', description: 'Clean, white space, elegant' },
  { id: 'creative', name: 'Creative', category: 'Creative', accent: '#7c3aed', description: 'Gradient header, vibrant', popular: true },
  { id: 'executive', name: 'Executive', category: 'Executive', accent: '#111827', description: 'Dark header, two-column', pro: true },
]

interface Props {
  content: ResumeContent
  template?: string
}

export default function ResumeTemplates({ content, template = 'modern' }: Props) {
  switch (template) {
    case 'professional': return <ProfessionalTemplate data={content} />
    case 'minimal':      return <MinimalTemplate data={content} />
    case 'creative':     return <CreativeTemplate data={content} />
    case 'executive':    return <ExecutiveTemplate data={content} />
    default:             return <ModernTemplate data={content} />
  }
}
