"""
ATS Intelligence 2.0 — Phase E benchmark dataset.

**What this is, honestly:** a hand-built, hand-labeled corpus used to check
whether the v2 engine (`compute_full_analysis()`) detects what it should
detect. It is NOT a scrape or reproduction of any competitor's dataset or
algorithm, and the labels below are NOT target scores to tune toward — they
are structural facts about the resumes/JDs themselves (created deliberately,
so the "expected" answer is verifiably true by construction, not guessed).
See docs/SAHICAREER_ATS_INTELLIGENCE_2.md §12 and docs/ATS_BENCHMARK_REPORT.md
for the methodology and results this dataset produces.

**Composition** (Phase E decisions: larger set, Python fixtures):
  - 12 resumes: 3 industries (Software Engineering, Data & Analytics,
    Digital Marketing) × 4 seniority bands (Junior, Mid, Senior, Lead).
    Half are deliberately written with strong, quantified bullets and a
    specific summary ("strong" quality bucket); half with generic,
    unquantified bullets and filler-phrase summaries ("weak" bucket) — this
    split is INDEPENDENT of seniority/industry, so quality detection isn't
    confounded with seniority.
  - 9 job descriptions: 3 per industry (a junior-level JD, a senior/lead JD,
    and an "adjacent" JD requiring a genuinely different tool stack in the
    same broad field — e.g. Java/Spring vs. the resumes' Python/Django —
    to produce real, honest missing-keyword cases, not fabricated ones).
  - 36 pairs (each resume × its own industry's 3 JDs), each with hand-labeled
    `expected_matched_keywords` / `expected_missing_keywords` (subsets of the
    JD's `keywords` list, true by construction — I either put a term in the
    resume's skills/experience or I deliberately didn't) and a coarse
    `expected_job_match_band` (high/medium/low — a direction, not a number).
  - 6 resumes (the "strong"/"weak" pairs within one industry — see
    RESUME_QUALITY_PROBES) carry additional hand-labeled quality
    expectations for the categories they were deliberately written to test
    (quantified_impact, action_verbs, summary_quality).
  - 5 synthetic raw_text probes for the Parsing Rate engine — content-based
    resumes can't produce real ATS anti-patterns (tables/columns/images),
    since `ResumeParser.from_content()` always emits clean, well-ordered
    text. These probe `parsing_quality.analyze_parsing_quality()` and
    `section_recognizer.recognize_sections()` directly with synthetic text
    simulating known bad-ATS patterns, asserting relative (not absolute)
    ordering — e.g. "corrupted text scores lower than clean text."
"""

# ─────────────────────────────────────────────────────────────────────────
# Resumes
# ─────────────────────────────────────────────────────────────────────────

def _exp(position, company, start, end, bullets, current=False, location="Bengaluru, India"):
    return {
        "id": position[:3].lower(), "position": position, "company": company, "location": location,
        "startDate": start, "endDate": end, "current": current, "bullets": bullets,
    }


def _edu(degree, field, institution, start, end):
    return {
        "id": degree[:3].lower(), "degree": degree, "field": field, "institution": institution,
        "location": "India", "startDate": start, "endDate": end, "gpa": "",
    }


def _skills(names):
    return [{"name": n, "level": 80} for n in names]


def _resume(full_name, job_title, summary, experience, education, skills, projects=None, certifications=None):
    return {
        "personalInfo": {
            "fullName": full_name, "jobTitle": job_title, "email": f"{full_name.split()[0].lower()}@example.com",
            "phone": "+91 90000 00000", "location": "Bengaluru, India", "linkedin": "", "website": "", "github": "",
        },
        "summary": summary,
        "experience": experience,
        "education": [education],
        "skills": _skills(skills),
        "projects": projects or [],
        "certifications": certifications or [],
        "achievements": [],
        "languages": [],
        "interests": [],
    }


BENCHMARK_RESUMES: dict[str, dict] = {
    # ── Software Engineering ────────────────────────────────────────────
    "swe_junior": _resume(
        "Aarav Sharma", "Junior Software Engineer",
        "Junior backend developer with 1 year of experience building REST APIs in Python. "
        "Shipped 3 internal tools used by a 12-person engineering team.",
        [_exp("Junior Software Engineer", "Bitwise Labs", "Jul 2024", "Present",
              ["Built a REST API in Python and Flask that cut manual data-entry time by 40% for the support team",
               "Fixed 25+ bugs across two sprints, reducing the open-bug backlog by 30%",
               "Wrote unit tests that increased test coverage from 40% to 65% on the core service"],
              current=True)],
        _edu("B.Tech", "Computer Science", "VIT Vellore", "2020", "2024"),
        ["Python", "SQL", "Git", "REST APIs", "Flask"],
    ),  # strong quality bucket
    "swe_mid": _resume(
        "Priya Nair", "Software Engineer",
        "Hardworking professional who is a team player and fast learner, looking for opportunities to grow.",
        [_exp("Software Engineer", "Orion Systems", "Jun 2021", "Present",
              ["Responsible for maintaining backend services and fixing bugs",
               "Worked on the Django application and database",
               "Helped with deployment and Docker configuration",
               "Assisted with AWS infrastructure tasks"],
              current=True)],
        _edu("B.E.", "Information Technology", "Anna University", "2017", "2021"),
        ["Python", "Django", "PostgreSQL", "Docker", "AWS", "REST APIs", "Git"],
    ),  # weak quality bucket
    "swe_senior": _resume(
        "Rohan Mehta", "Senior Software Engineer",
        "Senior backend engineer with 8 years building distributed systems in Python and Kubernetes, "
        "with a track record of measurable performance and reliability improvements.",
        [_exp("Senior Software Engineer", "Nimbus Cloud", "Mar 2018", "Present",
              ["Architected a microservices migration that reduced deployment time by 70% across 15 services",
               "Led a team of 5 engineers to deliver a Kubernetes-based CI/CD pipeline, cutting release cycles from 2 weeks to 2 days",
               "Optimized PostgreSQL query performance, reducing p95 latency by 45% for the checkout service",
               "Reduced AWS infrastructure costs by ₹18 lakh annually through Redis caching and autoscaling"],
              current=True),
         _exp("Software Engineer", "Bitwise Labs", "Jun 2015", "Feb 2018",
              ["Developed a Django-based billing system processing 10,000+ transactions per day"])],
        _edu("B.Tech", "Computer Science", "IIT Roorkee", "2011", "2015"),
        ["Python", "Django", "PostgreSQL", "AWS", "Docker", "Kubernetes", "Microservices", "CI/CD", "Redis"],
    ),  # strong quality bucket
    "swe_lead": _resume(
        "Karan Malhotra", "Engineering Lead",
        "Results-oriented, highly motivated engineering leader with a proven track record and excellent communication skills.",
        [_exp("Engineering Lead", "Vertex Technologies", "Jan 2016", "Present",
              ["Responsible for a team of 12 engineers across 3 squads",
               "Worked on system design and architecture decisions",
               "Helped set up the Kubernetes platform used company-wide",
               "Handled hiring and mentoring of new engineers"],
              current=True)],
        _edu("M.Tech", "Computer Science", "IIT Bombay", "2010", "2012"),
        ["Python", "System Design", "AWS", "Kubernetes", "Team Leadership", "Mentoring", "Architecture"],
    ),  # weak quality bucket

    # ── Data & Analytics ─────────────────────────────────────────────────
    "data_junior": _resume(
        "Sneha Iyer", "Data Analyst",
        "Data analyst with 1 year of experience turning SQL queries into dashboards that drove a 15% "
        "improvement in campaign targeting accuracy.",
        [_exp("Data Analyst", "Insight Metrics", "Aug 2024", "Present",
              ["Built 8 Tableau dashboards that reduced weekly reporting time by 5 hours across 3 teams",
               "Automated a SQL ETL script that cut data-refresh time from 3 hours to 20 minutes",
               "Analyzed customer churn data for 50,000 users, identifying a segment with 22% higher retention"],
              current=True)],
        _edu("B.Sc.", "Statistics", "Christ University", "2021", "2024"),
        ["SQL", "Excel", "Python", "Tableau"],
    ),
    "data_mid": _resume(
        "Vikram Rao", "Data Analyst",
        "Detail-oriented self-motivated professional seeking a position where I can use my skills.",
        [_exp("Data Analyst", "Quanta Insights", "May 2021", "Present",
              ["Responsible for building reports in Power BI",
               "Worked on Python scripts for data cleaning",
               "Helped the marketing team with statistics",
               "Assisted with Tableau dashboard maintenance"],
              current=True)],
        _edu("B.Sc.", "Statistics", "Fergusson College", "2017", "2021"),
        ["SQL", "Python", "Pandas", "Tableau", "Power BI", "Statistics"],
    ),
    "data_senior": _resume(
        "Ananya Desai", "Senior Data Scientist",
        "Senior data scientist with 8 years applying machine learning at scale, with a consistent record "
        "of translating models into measurable business impact.",
        [_exp("Senior Data Scientist", "Helios Analytics", "Feb 2018", "Present",
              ["Developed a churn-prediction model using Scikit-learn that improved retention campaign ROI by 32%",
               "Led a team of 4 data scientists building a recommendation engine that increased click-through rate by 18%",
               "Deployed models on AWS SageMaker serving 2 million predictions per day at 99.9% uptime",
               "Reduced model training time by 60% by migrating batch jobs to Spark"],
              current=True),
         _exp("Data Analyst", "Insight Metrics", "Jul 2014", "Jan 2018",
              ["Built statistical models that improved forecast accuracy by 25% for quarterly planning"])],
        _edu("M.Sc.", "Data Science", "IISc Bangalore", "2012", "2014"),
        ["Python", "SQL", "Machine Learning", "Scikit-learn", "Spark", "AWS", "Statistics"],
    ),
    "data_lead": _resume(
        "Manish Chopra", "Data & Analytics Lead",
        "Dynamic individual with a passion for data and excellent communication skills, seeking a challenging role.",
        [_exp("Data & Analytics Lead", "Northbridge Data", "Mar 2015", "Present",
              ["Responsible for the analytics roadmap across 4 product teams",
               "Worked on data strategy and stakeholder presentations",
               "Helped scale the Spark-based data platform",
               "Handled hiring for the analytics organization"],
              current=True)],
        _edu("M.Tech", "Computer Science", "IIT Madras", "2009", "2011"),
        ["Python", "SQL", "Machine Learning", "Team Leadership", "Data Strategy", "Spark", "Stakeholder Management"],
    ),

    # ── Digital Marketing ────────────────────────────────────────────────
    "mkt_junior": _resume(
        "Ishaan Kapoor", "Marketing Coordinator",
        "Marketing coordinator with 1 year of experience growing organic reach through SEO and content, "
        "delivering a 28% increase in organic traffic.",
        [_exp("Marketing Coordinator", "Brightside Media", "Jun 2024", "Present",
              ["Increased organic search traffic by 28% over 6 months through on-page SEO improvements",
               "Wrote 40+ blog posts that generated 15,000 additional monthly visits",
               "Grew Instagram engagement by 35% by launching a weekly content series"],
              current=True)],
        _edu("BBA", "Marketing", "Symbiosis Pune", "2021", "2024"),
        ["SEO", "Content Writing", "Social Media", "Google Analytics"],
    ),
    "mkt_mid": _resume(
        "Divya Menon", "Digital Marketing Specialist",
        "Passionate about marketing, a real go-getter who thinks outside the box.",
        [_exp("Digital Marketing Specialist", "Clickframe Agency", "Apr 2021", "Present",
              ["Responsible for running Google Ads campaigns",
               "Worked on email marketing sequences",
               "Helped with SEO audits for client websites",
               "Assisted with monthly Google Analytics reports"],
              current=True)],
        _edu("BBA", "Marketing", "NMIMS Mumbai", "2017", "2021"),
        ["SEO", "SEM", "Google Ads", "Email Marketing", "Google Analytics"],
    ),
    "mkt_senior": _resume(
        "Aditya Bhatt", "Senior Marketing Manager",
        "Senior marketing manager with 8 years driving measurable growth through integrated SEO, SEM, "
        "and brand strategy.",
        [_exp("Senior Marketing Manager", "Zenith Brands", "Jan 2018", "Present",
              ["Grew organic traffic by 65% year-over-year through a company-wide SEO strategy overhaul",
               "Managed a ₹2 crore annual marketing budget across 6 channels, improving ROAS by 40%",
               "Led a team of 6 marketers to launch a rebrand that increased brand awareness by 22%",
               "Reduced customer acquisition cost by 30% through SEM bid optimization"],
              current=True),
         _exp("Marketing Manager", "Brightside Media", "Jun 2014", "Dec 2017",
              ["Increased email open rates by 18% through a redesigned lifecycle campaign"])],
        _edu("MBA", "Marketing", "IIM Ahmedabad", "2012", "2014"),
        ["SEO", "SEM", "Marketing Strategy", "Google Analytics", "Team Leadership", "Budget Management"],
    ),
    "mkt_lead": _resume(
        "Neha Kulkarni", "Head of Marketing",
        "Team player with excellent communication skills and a proven track record, looking for the next challenge.",
        [_exp("Head of Marketing", "Solstice Retail", "Feb 2015", "Present",
              ["Responsible for the overall marketing strategy",
               "Worked on brand positioning and messaging",
               "Helped manage the marketing budget across teams",
               "Handled stakeholder communication with the executive team"],
              current=True)],
        _edu("MBA", "Marketing", "XLRI Jamshedpur", "2009", "2011"),
        ["Marketing Strategy", "Brand Management", "Team Leadership", "Budget Management", "Stakeholder Management"],
    ),
}

# Resumes deliberately written to test Resume Quality detection: (strong, weak)
# pairs within the same industry/role family — the ONLY difference between
# each pair is writing quality (bullet phrasing, summary), not seniority or
# skill set, so a quality-score difference between them is attributable to
# the thing actually being tested.
RESUME_QUALITY_PROBES: list[tuple[str, str]] = [
    ("swe_junior", "swe_mid"), ("swe_senior", "swe_lead"),
    ("data_junior", "data_mid"), ("data_senior", "data_lead"),
    ("mkt_junior", "mkt_mid"), ("mkt_senior", "mkt_lead"),
]

# ─────────────────────────────────────────────────────────────────────────
# Job descriptions — `keywords` drives the (highest-weighted, 45%) Keyword
# Match category; `required_skills`/`preferred_skills` drives Skills Match.
# ─────────────────────────────────────────────────────────────────────────

def _job(title, keywords, required_skills, preferred_skills=None, raw_text_extra=""):
    return {
        "job_title": title,
        "keywords": keywords,
        "required_skills": required_skills,
        "preferred_skills": preferred_skills or [],
        "responsibilities": [],
        "min_experience_years": None,
        "min_education": None,
        "industry": None,
        "certifications": [],
        "raw_text": f"{title}. Requires: {', '.join(required_skills)}. {raw_text_extra}",
        "parsed_by": "benchmark-fixture",
    }


BENCHMARK_JOBS: dict[str, dict] = {
    "swe_jd_junior": _job(
        "Junior Backend Developer",
        ["Python", "SQL", "Git", "REST APIs", "Problem Solving"],
        ["Python", "SQL", "Git", "REST APIs"],
    ),
    "swe_jd_senior": _job(
        "Senior Backend Engineer / Tech Lead",
        ["Python", "Django", "Kubernetes", "Microservices", "System Design", "AWS", "Team Leadership", "CI/CD"],
        ["Python", "Kubernetes", "Microservices", "System Design"], ["AWS", "CI/CD"],
    ),
    "swe_jd_adjacent": _job(
        "Java Backend Developer",
        ["Java", "Spring Boot", "Hibernate", "Maven", "Microservices", "Kafka"],
        ["Java", "Spring Boot", "Hibernate"], ["Kafka"],
    ),
    "data_jd_junior": _job(
        "Junior Data Analyst",
        ["SQL", "Excel", "Python", "Data Visualization", "Tableau"],
        ["SQL", "Excel", "Python"], ["Tableau"],
    ),
    "data_jd_senior": _job(
        "Senior Data Scientist",
        ["Python", "Machine Learning", "Spark", "AWS", "Statistics", "Team Leadership", "Scikit-learn"],
        ["Python", "Machine Learning", "Statistics"], ["Spark", "AWS"],
    ),
    "data_jd_adjacent": _job(
        "Data Engineer",
        ["Apache Airflow", "Kafka", "ETL Pipelines", "Snowflake", "dbt", "Spark"],
        ["Apache Airflow", "ETL Pipelines", "Snowflake"], ["dbt", "Kafka"],
    ),
    "mkt_jd_junior": _job(
        "Marketing Coordinator",
        ["SEO", "Content Writing", "Social Media", "Google Analytics"],
        ["SEO", "Content Writing"], ["Social Media"],
    ),
    "mkt_jd_senior": _job(
        "Senior Marketing Manager",
        ["Marketing Strategy", "SEO", "SEM", "Team Leadership", "Budget Management", "Brand Management"],
        ["Marketing Strategy", "Team Leadership", "Budget Management"], ["Brand Management"],
    ),
    "mkt_jd_adjacent": _job(
        "Performance Marketing Manager",
        ["Facebook Ads", "Google Ads", "A/B Testing", "Conversion Rate Optimization", "Growth Hacking", "Marketing Automation"],
        ["Facebook Ads", "A/B Testing", "Conversion Rate Optimization"], ["Growth Hacking", "Marketing Automation"],
    ),
}

_INDUSTRY_RESUMES = {
    "swe": ["swe_junior", "swe_mid", "swe_senior", "swe_lead"],
    "data": ["data_junior", "data_mid", "data_senior", "data_lead"],
    "mkt": ["mkt_junior", "mkt_mid", "mkt_senior", "mkt_lead"],
}
_INDUSTRY_JOBS = {
    "swe": ["swe_jd_junior", "swe_jd_senior", "swe_jd_adjacent"],
    "data": ["data_jd_junior", "data_jd_senior", "data_jd_adjacent"],
    "mkt": ["mkt_jd_junior", "mkt_jd_senior", "mkt_jd_adjacent"],
}

# Per-pair hand labels. `expected_matched_keywords`/`expected_missing_keywords`
# are subsets of the JD's `keywords` list — true by construction (the resume
# either has that skill listed/used, or deliberately doesn't).
# `expected_job_match_band`: "high" (>=60), "medium" (30-60), "low" (<30) —
# a direction, not a target number, and only asserted where construction
# makes the direction unambiguous.
PAIR_LABELS: dict[tuple[str, str], dict] = {
    # Software Engineering
    ("swe_junior", "swe_jd_junior"): {"matched": ["Python", "SQL", "Git", "REST APIs"], "missing": [], "band": "high"},
    ("swe_junior", "swe_jd_senior"): {"matched": ["Python"], "missing": ["Kubernetes", "Microservices", "System Design", "Team Leadership"], "band": "low"},
    ("swe_junior", "swe_jd_adjacent"): {"matched": [], "missing": ["Java", "Spring Boot", "Hibernate", "Kafka"], "band": "low"},
    # NOTE: swe_mid lists "PostgreSQL" but never the literal term "SQL" — the
    # engine correctly does NOT match it (PostgreSQL is one token; matching
    # "SQL" inside it would be exactly the kind of false positive Phase B's
    # word-boundary scan exists to prevent). Corrected after the first
    # benchmark run flagged this as a label error, not an engine bug — see
    # docs/ATS_BENCHMARK_REPORT.md.
    ("swe_mid", "swe_jd_junior"): {"matched": ["Python", "Git", "REST APIs"], "missing": ["SQL"], "band": "high"},
    ("swe_mid", "swe_jd_senior"): {"matched": ["Python", "Django", "AWS"], "missing": ["Kubernetes", "Microservices", "System Design", "Team Leadership"], "band": "medium"},
    ("swe_mid", "swe_jd_adjacent"): {"matched": [], "missing": ["Java", "Spring Boot", "Hibernate", "Kafka"], "band": "low"},
    # NOTE: swe_senior's skills/bullets never literally say "SQL", "Git", or
    # "REST APIs" (despite obviously using all three day-to-day) — corrected
    # after the first benchmark run; a resume that doesn't spell out a term
    # is a genuine, realistic ATS gap, not an engine detection bug.
    ("swe_senior", "swe_jd_junior"): {"matched": ["Python"], "missing": ["SQL", "Git", "REST APIs"], "band": "medium"},
    ("swe_senior", "swe_jd_senior"): {"matched": ["Python", "Django", "Kubernetes", "Microservices", "AWS", "CI/CD"], "missing": ["Team Leadership"], "band": "high"},
    ("swe_senior", "swe_jd_adjacent"): {"matched": [], "missing": ["Java", "Spring Boot", "Hibernate", "Kafka"], "band": "low"},
    # NOTE: swe_lead's skills never literally list "Git" either — corrected
    # after the first benchmark run for the same reason as swe_senior above.
    ("swe_lead", "swe_jd_junior"): {"matched": ["Python"], "missing": ["SQL", "REST APIs", "Git"], "band": "medium"},
    ("swe_lead", "swe_jd_senior"): {"matched": ["Python", "Kubernetes", "System Design", "AWS", "Team Leadership"], "missing": ["Django", "Microservices", "CI/CD"], "band": "high"},
    ("swe_lead", "swe_jd_adjacent"): {"matched": [], "missing": ["Java", "Spring Boot", "Hibernate", "Kafka"], "band": "low"},

    # Data & Analytics
    ("data_junior", "data_jd_junior"): {"matched": ["SQL", "Python", "Tableau"], "missing": [], "band": "high"},
    ("data_junior", "data_jd_senior"): {"matched": ["Python"], "missing": ["Machine Learning", "Spark", "Statistics", "Scikit-learn"], "band": "low"},
    ("data_junior", "data_jd_adjacent"): {"matched": [], "missing": ["Apache Airflow", "Kafka", "ETL Pipelines", "Snowflake", "dbt"], "band": "low"},
    ("data_mid", "data_jd_junior"): {"matched": ["SQL", "Python", "Tableau"], "missing": [], "band": "high"},
    ("data_mid", "data_jd_senior"): {"matched": ["Python", "Statistics"], "missing": ["Machine Learning", "Spark", "Scikit-learn"], "band": "medium"},
    ("data_mid", "data_jd_adjacent"): {"matched": [], "missing": ["Apache Airflow", "Kafka", "ETL Pipelines", "Snowflake", "dbt"], "band": "low"},
    ("data_senior", "data_jd_junior"): {"matched": ["SQL", "Python"], "missing": [], "band": "high"},
    ("data_senior", "data_jd_senior"): {"matched": ["Python", "Machine Learning", "Spark", "AWS", "Statistics", "Scikit-learn"], "missing": ["Team Leadership"], "band": "high"},
    ("data_senior", "data_jd_adjacent"): {"matched": ["Spark"], "missing": ["Apache Airflow", "Kafka", "ETL Pipelines", "Snowflake", "dbt"], "band": "low"},
    ("data_lead", "data_jd_junior"): {"matched": ["SQL", "Python"], "missing": [], "band": "high"},
    ("data_lead", "data_jd_senior"): {"matched": ["Python", "Machine Learning", "Team Leadership", "Spark"], "missing": ["Statistics", "Scikit-learn", "AWS"], "band": "high"},
    ("data_lead", "data_jd_adjacent"): {"matched": ["Spark"], "missing": ["Apache Airflow", "Kafka", "ETL Pipelines", "Snowflake", "dbt"], "band": "low"},

    # Digital Marketing
    ("mkt_junior", "mkt_jd_junior"): {"matched": ["SEO", "Content Writing", "Social Media"], "missing": [], "band": "high"},
    ("mkt_junior", "mkt_jd_senior"): {"matched": ["SEO"], "missing": ["Marketing Strategy", "SEM", "Team Leadership", "Budget Management"], "band": "low"},
    ("mkt_junior", "mkt_jd_adjacent"): {"matched": [], "missing": ["Facebook Ads", "Google Ads", "A/B Testing", "Conversion Rate Optimization", "Growth Hacking"], "band": "low"},
    ("mkt_mid", "mkt_jd_junior"): {"matched": ["SEO"], "missing": [], "band": "medium"},
    ("mkt_mid", "mkt_jd_senior"): {"matched": ["SEO", "SEM"], "missing": ["Marketing Strategy", "Team Leadership", "Budget Management"], "band": "low"},
    ("mkt_mid", "mkt_jd_adjacent"): {"matched": ["Google Ads"], "missing": ["Facebook Ads", "A/B Testing", "Conversion Rate Optimization", "Growth Hacking"], "band": "low"},
    ("mkt_senior", "mkt_jd_junior"): {"matched": ["SEO"], "missing": ["Content Writing"], "band": "medium"},
    ("mkt_senior", "mkt_jd_senior"): {"matched": ["SEO", "SEM", "Marketing Strategy", "Team Leadership", "Budget Management"], "missing": ["Brand Management"], "band": "high"},
    ("mkt_senior", "mkt_jd_adjacent"): {"matched": [], "missing": ["Facebook Ads", "Google Ads", "A/B Testing", "Conversion Rate Optimization", "Growth Hacking"], "band": "low"},
    ("mkt_lead", "mkt_jd_junior"): {"matched": [], "missing": ["SEO", "Content Writing", "Social Media"], "band": "low"},
    ("mkt_lead", "mkt_jd_senior"): {"matched": ["Marketing Strategy", "Team Leadership", "Budget Management"], "missing": ["SEO", "SEM"], "band": "medium"},
    ("mkt_lead", "mkt_jd_adjacent"): {"matched": [], "missing": ["Facebook Ads", "Google Ads", "A/B Testing", "Conversion Rate Optimization", "Growth Hacking"], "band": "low"},
}


def iter_pairs():
    """Yields (resume_key, job_key, labels) for every resume x its own
    industry's 3 JDs — 12 x 3 = 36 pairs."""
    for industry, resume_keys in _INDUSTRY_RESUMES.items():
        for resume_key in resume_keys:
            for job_key in _INDUSTRY_JOBS[industry]:
                labels = PAIR_LABELS[(resume_key, job_key)]
                yield resume_key, job_key, labels


def iter_adjacent_comparisons():
    """Yields (resume_key, same_industry_jd_key, adjacent_jd_key) for every
    resume — a more defensible ground-truth claim than an absolute score
    band (see docs/ATS_BENCHMARK_REPORT.md §1): the '_jd_adjacent' JD for
    each industry requires a genuinely different, non-overlapping tool
    stack (Java/Spring vs. Python/Django, Data Engineering vs. Analyst/
    Scientist tooling, paid-ads/growth vs. SEO/content) by deliberate
    construction, so — holding the resume's experience/education/seniority
    constant — its Job Match score against the adjacent JD should be lower
    than against EITHER same-industry JD it's paired with. This isolates
    the keyword/skills contribution instead of requiring a full hand-
    computation of the blended formula (experience/education/certifications/
    location all contribute too, and weren't independently modeled when
    this dataset's absolute band labels were first hand-written)."""
    for industry, resume_keys in _INDUSTRY_RESUMES.items():
        jd_junior, jd_senior, jd_adjacent = _INDUSTRY_JOBS[industry]
        for resume_key in resume_keys:
            yield resume_key, [jd_junior, jd_senior], jd_adjacent


# ─────────────────────────────────────────────────────────────────────────
# Parsing Rate anti-pattern probes — synthetic raw_text, not structured
# content (see module docstring for why). Labels are RELATIVE orderings,
# checked against a shared clean-text baseline, not absolute thresholds.
# ─────────────────────────────────────────────────────────────────────────

PARSING_BASELINE_TEXT = """Ananya Desai
Senior Data Scientist
ananya@example.com | +91 90000 00000

Summary
Senior data scientist with 8 years applying machine learning at scale.

Experience
Senior Data Scientist, Helios Analytics, Feb 2018 - Present
Developed a churn-prediction model that improved retention by 32%.
Led a team of 4 data scientists building a recommendation engine.

Education
M.Sc. Data Science, IISc Bangalore, 2012 - 2014

Skills
Python, SQL, Machine Learning, Scikit-learn, Spark, AWS"""

PARSING_PROBES: dict[str, dict] = {
    "corrupted_extraction": {
        "raw_text": "Ananya Desai��\x00\x00Senior Data Scientist�\x00Summary�\x00"
                    "�\x00�\x00Senior data �\x00\x00scientist �\x00with�\x00 8 �\x00years�\x00.",
        "expect_lower_than_baseline": ["parsed_character_ratio"],
    },
    "no_section_headers": {
        # Same content, but with every recognizable heading word removed —
        # simulates a resume whose section structure a parser couldn't find.
        "raw_text": "Ananya Desai\nSenior Data Scientist\n\n"
                    "Senior data scientist with 8 years applying machine learning at scale.\n\n"
                    "Senior Data Scientist, Helios Analytics, Feb 2018 - Present\n"
                    "Developed a churn-prediction model that improved retention by 32 percent.\n\n"
                    "M.Sc. Data Science, IISc Bangalore, 2012 - 2014\n\n"
                    "Python, SQL, Machine Learning, Scikit-learn, Spark, AWS",
        "expect_lower_than_baseline_sections": True,
    },
    "column_jumble": {
        # Simulates a multi-column PDF extracted as a flat run of very short,
        # disconnected lines (the reading_order_score heuristic's target).
        "raw_text": "\n".join([
            "Ananya", "Data Scientist", "Skills", "Python", "8 years", "SQL", "Experience", "ML",
            "2018", "AWS", "Spark", "Present", "Helios", "Summary", "Senior", "M.Sc.", "2012", "IISc",
        ]),
        "expect_lower_than_baseline": ["reading_order_score"],
    },
    "contact_buried": {
        # Contact info present but far from the top (footer-only pattern).
        "raw_text": "Summary\nSenior data scientist with 8 years applying machine learning at scale.\n\n"
                    "Experience\nSenior Data Scientist, Helios Analytics, Feb 2018 - Present\n"
                    "Developed a churn-prediction model that improved retention by 32 percent.\n\n"
                    + ("Additional details omitted for brevity. " * 40) +
                    "\n\nananya@example.com | +91 90000 00000",
        "expect_lower_than_baseline": ["contact_extraction_score"],
    },
    "clean_baseline": {
        "raw_text": PARSING_BASELINE_TEXT,
        "expect_lower_than_baseline": [],
    },
}

# ─────────────────────────────────────────────────────────────────────────
# Anti-gaming probes (Phase E addition) — hand-labeled cases for the real,
# already-shipped Phase D module `services/ats_engine/anti_gaming.py`.
# These call that module directly; nothing here reimplements detection
# logic. `_OVERUSE_THRESHOLD = 6` / `_JD_COPY_NGRAM = 12` /
# `_STUFFED_LINE_MIN_TOKENS = 8` are anti_gaming.py's own real thresholds
# (mirrored here only as comments, for the label's rationale — the test
# suite imports the module, it doesn't hardcode these numbers itself).
# ─────────────────────────────────────────────────────────────────────────

ANTI_GAMING_PROBES = {
    "stuffed_term": {
        # "kubernetes" appears 7 times (>= the module's threshold of 6).
        "raw_text": ("Deployed services on Kubernetes. Managed Kubernetes clusters daily. "
                     "Kubernetes networking was a core responsibility. Wrote Kubernetes operators. "
                     "Debugged Kubernetes pods in production. Automated Kubernetes upgrades. "
                     "Trained the team on Kubernetes best practices."),
        "terms": ["kubernetes"],
        "expect_stuffing_flagged": True,
    },
    "natural_use": {
        # "kubernetes" appears 3 times — normal, unremarkable repetition
        # across distinct bullets (below the threshold of 6).
        "raw_text": ("Deployed services on Kubernetes. Migrated the CI/CD pipeline to run on "
                     "Kubernetes. Mentored two engineers on Kubernetes fundamentals."),
        "terms": ["kubernetes"],
        "expect_stuffing_flagged": False,
    },
    "jd_copied": {
        # A verbatim 15-word run lifted directly from the JD text below.
        "resume_text": ("Experience\nSoftware Engineer, Acme Corp\n"
                         "Own the design, development, and delivery of scalable backend services "
                         "used by millions of customers worldwide every single day."),
        "job_text": ("We are looking for someone who will own the design, development, and delivery "
                     "of scalable backend services used by millions of customers worldwide every "
                     "single day, in a fast-paced environment."),
        "expect_jd_copying_flagged": True,
    },
    "jd_not_copied": {
        # Genuinely different phrasing — normal, expected keyword overlap
        # only (e.g. "Python", "backend"), no long verbatim run.
        "resume_text": ("Experience\nSoftware Engineer, Acme Corp\n"
                         "Built and maintained Python backend services for the payments team, "
                         "reducing checkout latency by 30% over two quarters."),
        "job_text": ("We are looking for a backend engineer with strong Python skills to join "
                     "our payments team and help us scale our checkout infrastructure."),
        "expect_jd_copying_flagged": False,
    },
    "stuffed_block": {
        # A dense, comma-separated list of >=8 short tokens with no
        # sentence structure — the "hidden keyword list" pattern.
        "raw_text": "Python, Django, Flask, AWS, Docker, Kubernetes, PostgreSQL, Redis, Kafka, GraphQL, REST, gRPC",
        "expect_stuffed_block_flagged": True,
    },
    "clean_bullet": {
        # A normal sentence — should never be mistaken for a stuffed block,
        # even though it lists several technologies.
        "raw_text": "Built a REST API in Python using Django and PostgreSQL, deployed with Docker on AWS.",
        "expect_stuffed_block_flagged": False,
    },
}
