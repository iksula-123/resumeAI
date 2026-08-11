"""
Heuristic skill categorization — presentation-only grouping for the Tech
Stack template's PDF/DOCX output. Does NOT add a field to the resume data
model (a skill is still just a name); this is a best-effort keyword match
purely for how the "single-column" builder groups an existing flat skills
list when rendering template_id == "tech-stack".

Mirrored (kept in sync by hand) in frontend/lib/skillCategories.ts for the
React preview — see that file's docstring. Keep the two lists aligned.
"""

CATEGORY_ORDER = [
    "Languages", "Frontend", "Backend", "Frameworks", "Database",
    "Cloud", "DevOps", "Testing", "Tools", "Other",
]

_KEYWORD_MAP = {
    "Languages": [
        "javascript", "typescript", "python", "java", "c#", "c++", "c", "go", "golang",
        "rust", "php", "ruby", "kotlin", "swift", "scala", "dart", "sql", "html", "css",
    ],
    "Frontend": [
        "react", "next.js", "nextjs", "vue", "angular", "svelte", "redux", "tailwind",
        "bootstrap", "sass", "jquery", "webpack", "vite", "html5", "css3", "ember",
    ],
    "Backend": [
        "node", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot",
        ".net", "asp.net", "laravel", "rails", "ruby on rails", "nestjs", "graphql", "rest api",
    ],
    "Frameworks": [
        "flutter", "react native", "xamarin", "unity", "tensorflow", "pytorch", "pandas",
        "numpy", "scikit-learn", ".net core", "hibernate", "entity framework",
    ],
    "Database": [
        "postgresql", "postgres", "mysql", "mongodb", "redis", "sqlite", "oracle",
        "dynamodb", "cassandra", "elasticsearch", "firebase", "mariadb", "sql server",
    ],
    "Cloud": [
        "aws", "azure", "gcp", "google cloud", "amazon web services", "ec2", "s3",
        "lambda", "cloudfront", "heroku", "vercel", "netlify", "digitalocean",
    ],
    "DevOps": [
        "docker", "kubernetes", "k8s", "jenkins", "ci/cd", "terraform", "ansible",
        "github actions", "gitlab ci", "helm", "nginx", "linux", "bash", "shell scripting",
    ],
    "Testing": [
        "jest", "mocha", "cypress", "selenium", "pytest", "junit", "testng",
        "playwright", "postman", "qa automation", "test automation", "unit testing",
    ],
    "Tools": [
        "git", "github", "gitlab", "jira", "confluence", "figma", "postman", "swagger",
        "vscode", "intellij", "notion", "slack", "agile", "scrum",
    ],
}


import re


def categorize_skill(name: str) -> str:
    """Boundary match, not raw substring — a short keyword like "c" or "go"
    must appear as its own token, or it false-positives on unrelated skills
    that merely contain those letters (e.g. "React"/"Docker" both contain the
    letter "c", "PostgreSQL" contains "sql" as a substring but not as a
    separate word). Uses lookaround rather than \\b: plain \\b fails on
    keywords ending in symbols like "c#", "c++", ".net", "ci/cd" (a "word
    boundary" requires a transition to/from a word character, which doesn't
    exist right after a trailing symbol at end-of-string)."""
    lower = (name or "").strip().lower()
    if not lower:
        return "Other"
    for category in CATEGORY_ORDER:
        if category == "Other":
            continue
        for kw in _KEYWORD_MAP[category]:
            pattern = r"(?<![a-z0-9])" + re.escape(kw) + r"(?![a-z0-9])"
            if re.search(pattern, lower):
                return category
    return "Other"


def group_skills_by_category(skill_names: list[str]) -> list[tuple[str, list[str]]]:
    """Returns [(category, [skill, ...]), ...] in CATEGORY_ORDER, empty
    categories omitted."""
    buckets: dict[str, list[str]] = {}
    for name in skill_names:
        cat = categorize_skill(name)
        buckets.setdefault(cat, []).append(name)
    return [(cat, buckets[cat]) for cat in CATEGORY_ORDER if cat in buckets]
