/**
 * Heuristic skill categorization — presentation-only grouping for the Tech
 * Stack template. This does NOT add a field to the Skill data model (Skill
 * stays { name, level? }, exactly as everywhere else in the app) — it's a
 * best-effort keyword match purely for how TechStackTemplate visually groups
 * an existing flat skills list. Unmatched skills fall into "Other".
 *
 * Mirrored (kept in sync by hand) in backend/services/skill_categories.py for
 * the PDF/DOCX builder — see that file's docstring.
 */

export const SKILL_CATEGORY_ORDER = [
  'Languages', 'Frontend', 'Backend', 'Frameworks', 'Database',
  'Cloud', 'DevOps', 'Testing', 'Tools', 'Other',
] as const

export type SkillCategory = typeof SKILL_CATEGORY_ORDER[number]

const KEYWORD_MAP: Record<Exclude<SkillCategory, 'Other'>, string[]> = {
  Languages: [
    'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'c', 'go', 'golang',
    'rust', 'php', 'ruby', 'kotlin', 'swift', 'scala', 'dart', 'sql', 'html', 'css',
  ],
  Frontend: [
    'react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte', 'redux', 'tailwind',
    'bootstrap', 'sass', 'jquery', 'webpack', 'vite', 'html5', 'css3', 'ember',
  ],
  Backend: [
    'node', 'node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'spring boot',
    '.net', 'asp.net', 'laravel', 'rails', 'ruby on rails', 'nestjs', 'graphql', 'rest api',
  ],
  Frameworks: [
    'flutter', 'react native', 'xamarin', 'unity', 'tensorflow', 'pytorch', 'pandas',
    'numpy', 'scikit-learn', '.net core', 'hibernate', 'entity framework',
  ],
  Database: [
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'oracle',
    'dynamodb', 'cassandra', 'elasticsearch', 'firebase', 'mariadb', 'sql server',
  ],
  Cloud: [
    'aws', 'azure', 'gcp', 'google cloud', 'amazon web services', 'ec2', 's3',
    'lambda', 'cloudfront', 'heroku', 'vercel', 'netlify', 'digitalocean',
  ],
  DevOps: [
    'docker', 'kubernetes', 'k8s', 'jenkins', 'ci/cd', 'terraform', 'ansible',
    'github actions', 'gitlab ci', 'helm', 'nginx', 'linux', 'bash', 'shell scripting',
  ],
  Testing: [
    'jest', 'mocha', 'cypress', 'selenium', 'pytest', 'junit', 'testng',
    'playwright', 'postman', 'qa automation', 'test automation', 'unit testing',
  ],
  Tools: [
    'git', 'github', 'gitlab', 'jira', 'confluence', 'figma', 'postman', 'swagger',
    'vscode', 'intellij', 'notion', 'slack', 'agile', 'scrum',
  ],
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Boundary match, not raw substring — a short keyword like "c" or "go" must
 * appear as its own token, or it false-positives on unrelated skills that
 * merely contain those letters (e.g. "React"/"Docker" both contain the
 * letter "c", "PostgreSQL" contains "sql" as a substring but not as a
 * separate word). Uses lookaround rather than \b: plain \b fails on
 * keywords ending in symbols like "c#", "c++", ".net", "ci/cd" (a "word
 * boundary" requires a transition to/from a word character, which doesn't
 * exist right after a trailing symbol at end-of-string).
 */
export function categorizeSkill(name: string): SkillCategory {
  const lower = name.trim().toLowerCase()
  if (!lower) return 'Other'
  for (const category of SKILL_CATEGORY_ORDER) {
    if (category === 'Other') continue
    const hit = KEYWORD_MAP[category].some(kw =>
      new RegExp(`(?<![a-z0-9])${escapeRegExp(kw)}(?![a-z0-9])`).test(lower)
    )
    if (hit) return category
  }
  return 'Other'
}

export function groupSkillsByCategory(skillNames: string[]): { category: string; skills: string[] }[] {
  const buckets = new Map<string, string[]>()
  for (const name of skillNames) {
    const cat = categorizeSkill(name)
    if (!buckets.has(cat)) buckets.set(cat, [])
    buckets.get(cat)!.push(name)
  }
  return SKILL_CATEGORY_ORDER
    .filter(cat => buckets.has(cat))
    .map(cat => ({ category: cat, skills: buckets.get(cat)! }))
}
