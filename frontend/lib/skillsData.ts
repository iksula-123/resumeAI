// Skill suggestions grouped by job category.
// Used by the resume editor to autocomplete skills and surface role-relevant ones.

export const SKILL_CATEGORIES: Record<string, string[]> = {
  'Frontend Development': [
    'React', 'Next.js', 'Vue.js', 'Angular', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3',
    'Tailwind CSS', 'Sass', 'Redux', 'Zustand', 'Webpack', 'Vite', 'Jest', 'React Testing Library',
    'Accessibility (a11y)', 'Responsive Design', 'Figma', 'Storybook', 'GraphQL', 'REST APIs',
  ],
  'Backend Development': [
    'Node.js', 'Express.js', 'Python', 'Django', 'FastAPI', 'Flask', 'Java', 'Spring Boot',
    'Go', 'Ruby on Rails', 'PHP', 'Laravel', 'C#', '.NET', 'PostgreSQL', 'MySQL', 'MongoDB',
    'Redis', 'REST APIs', 'GraphQL', 'Microservices', 'RabbitMQ', 'Kafka', 'gRPC',
  ],
  'Full Stack Development': [
    'React', 'Next.js', 'Node.js', 'TypeScript', 'Python', 'Django', 'PostgreSQL', 'MongoDB',
    'REST APIs', 'GraphQL', 'Docker', 'AWS', 'CI/CD', 'Tailwind CSS', 'Redis', 'Git', 'Prisma',
  ],
  'Mobile Development': [
    'React Native', 'Flutter', 'Swift', 'SwiftUI', 'Kotlin', 'Java', 'Objective-C', 'Dart',
    'Android SDK', 'iOS SDK', 'Firebase', 'Expo', 'Push Notifications', 'App Store Deployment',
  ],
  'DevOps & Cloud': [
    'Docker', 'Kubernetes', 'AWS', 'Google Cloud', 'Azure', 'Terraform', 'Ansible', 'CI/CD',
    'GitHub Actions', 'Jenkins', 'Prometheus', 'Grafana', 'Linux', 'Bash', 'Nginx', 'Helm',
    'CloudFormation', 'Datadog', 'Site Reliability', 'Load Balancing',
  ],
  'Data Science & ML': [
    'Python', 'R', 'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Keras',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'SQL', 'Jupyter',
    'Matplotlib', 'Statistics', 'Data Visualization', 'Feature Engineering', 'MLOps', 'Spark',
  ],
  'Data Analytics': [
    'SQL', 'Excel', 'Power BI', 'Tableau', 'Looker', 'Python', 'R', 'Google Analytics',
    'Data Visualization', 'Statistics', 'A/B Testing', 'ETL', 'Data Modeling', 'dbt', 'BigQuery',
  ],
  'UI/UX Design': [
    'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator', 'Wireframing', 'Prototyping',
    'User Research', 'Usability Testing', 'Design Systems', 'Interaction Design', 'Typography',
    'Accessibility', 'Information Architecture', 'Responsive Design', 'InVision',
  ],
  'Product Management': [
    'Product Strategy', 'Roadmapping', 'Agile', 'Scrum', 'Jira', 'User Stories', 'A/B Testing',
    'Market Research', 'Stakeholder Management', 'Analytics', 'Wireframing', 'KPIs', 'OKRs',
    'Go-to-Market', 'Prioritization', 'Customer Discovery',
  ],
  'Project Management': [
    'Agile', 'Scrum', 'Kanban', 'Jira', 'Asana', 'Trello', 'Risk Management', 'Budgeting',
    'Stakeholder Management', 'Gantt Charts', 'PMP', 'Resource Planning', 'MS Project',
  ],
  'Digital Marketing': [
    'SEO', 'SEM', 'Google Ads', 'Meta Ads', 'Content Marketing', 'Email Marketing', 'Copywriting',
    'Google Analytics', 'Social Media Marketing', 'HubSpot', 'Marketing Automation', 'A/B Testing',
    'Conversion Optimization', 'Brand Strategy', 'Canva', 'Mailchimp',
  ],
  'Sales': [
    'Salesforce', 'CRM', 'Lead Generation', 'Cold Calling', 'Negotiation', 'Account Management',
    'Pipeline Management', 'B2B Sales', 'Closing', 'Prospecting', 'HubSpot', 'Upselling',
  ],
  'Finance & Accounting': [
    'Financial Modeling', 'Excel', 'QuickBooks', 'SAP', 'Accounting', 'Budgeting', 'Forecasting',
    'Financial Analysis', 'Auditing', 'Taxation', 'GAAP', 'Bookkeeping', 'Valuation', 'Risk Analysis',
  ],
  'Human Resources': [
    'Recruiting', 'Talent Acquisition', 'Onboarding', 'Employee Relations', 'HRIS', 'Payroll',
    'Performance Management', 'Compensation & Benefits', 'Workday', 'Conflict Resolution', 'Compliance',
  ],
  'Customer Support': [
    'Zendesk', 'Intercom', 'CRM', 'Live Chat', 'Ticketing Systems', 'Troubleshooting',
    'Customer Success', 'SLA Management', 'Conflict Resolution', 'Product Knowledge',
  ],
  'Content & Writing': [
    'Copywriting', 'Content Strategy', 'SEO Writing', 'Editing', 'Proofreading', 'Storytelling',
    'WordPress', 'Technical Writing', 'Social Media', 'Research', 'Blogging', 'Grammarly',
  ],
  'Cybersecurity': [
    'Network Security', 'Penetration Testing', 'SIEM', 'Firewalls', 'Incident Response',
    'Vulnerability Assessment', 'Python', 'Linux', 'Encryption', 'ISO 27001', 'OWASP', 'Kali Linux',
  ],
}

// Soft skills offered as a secondary suggestion set for every role.
export const SOFT_SKILLS = [
  'Communication', 'Leadership', 'Problem Solving', 'Teamwork', 'Time Management',
  'Adaptability', 'Critical Thinking', 'Collaboration', 'Attention to Detail', 'Mentoring',
]

export const CATEGORY_NAMES = Object.keys(SKILL_CATEGORIES)

// Keyword → category, used to guess a category from a job title.
const TITLE_KEYWORDS: [RegExp, string][] = [
  [/front[\s-]?end|react|vue|angular|ui develop/i, 'Frontend Development'],
  [/back[\s-]?end|api|server|node|django|spring/i, 'Backend Development'],
  [/full[\s-]?stack/i, 'Full Stack Development'],
  [/mobile|ios|android|flutter|react native/i, 'Mobile Development'],
  [/devops|sre|site reliability|cloud|infra|platform engineer/i, 'DevOps & Cloud'],
  [/machine learning|ml engineer|data scien|ai engineer|deep learning/i, 'Data Science & ML'],
  [/data analyst|business intelligence|\bbi\b|analytics/i, 'Data Analytics'],
  [/ux|ui designer|product designer|graphic|visual design/i, 'UI/UX Design'],
  [/product manager|product owner|\bpm\b/i, 'Product Management'],
  [/project manager|program manager|scrum master/i, 'Project Management'],
  [/marketing|seo|growth|content market/i, 'Digital Marketing'],
  [/sales|account executive|business development/i, 'Sales'],
  [/finance|account|financial|auditor/i, 'Finance & Accounting'],
  [/\bhr\b|human resource|recruit|talent/i, 'Human Resources'],
  [/support|success|help desk/i, 'Customer Support'],
  [/writer|content|editor|copywrit/i, 'Content & Writing'],
  [/security|cyber|penetration|infosec/i, 'Cybersecurity'],
  [/engineer|developer|software/i, 'Full Stack Development'], // generic fallback
]

export function detectCategory(jobTitle?: string): string {
  if (jobTitle) {
    for (const [re, cat] of TITLE_KEYWORDS) {
      if (re.test(jobTitle)) return cat
    }
  }
  return 'Full Stack Development'
}

/** Skills for a category (plus soft skills), excluding ones already chosen. */
export function popularForCategory(category: string, exclude: string[] = []): string[] {
  const ex = new Set(exclude.map((s) => s.toLowerCase()))
  const base = SKILL_CATEGORIES[category] || []
  return [...base, ...SOFT_SKILLS].filter((s) => !ex.has(s.toLowerCase()))
}

/**
 * Autocomplete: rank category skills first, then all other skills.
 * startsWith matches rank above substring matches.
 */
export function suggestSkills(
  query: string,
  category: string,
  exclude: string[] = [],
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase()
  const ex = new Set(exclude.map((s) => s.toLowerCase()))

  // Build a de-duplicated pool: category first, then everything else.
  const pool: string[] = []
  const seen = new Set<string>()
  const push = (arr: string[]) => {
    for (const s of arr) {
      const k = s.toLowerCase()
      if (!seen.has(k)) { seen.add(k); pool.push(s) }
    }
  }
  push(SKILL_CATEGORIES[category] || [])
  push(SOFT_SKILLS)
  Object.values(SKILL_CATEGORIES).forEach(push)

  const avail = pool.filter((s) => !ex.has(s.toLowerCase()))
  if (!q) return avail.slice(0, limit)

  const starts: string[] = []
  const includes: string[] = []
  for (const s of avail) {
    const l = s.toLowerCase()
    if (l.startsWith(q)) starts.push(s)
    else if (l.includes(q)) includes.push(s)
  }
  return [...starts, ...includes].slice(0, limit)
}
