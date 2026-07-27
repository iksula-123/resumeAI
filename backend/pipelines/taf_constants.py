"""
Constants for the TAF pipeline: PII columns, title normalization rules,
junk detection patterns, and the skills lexicon.

This module is the reusable "cleanup IP": abbreviation/synonym expansion,
junk detection, and skill extraction that stand in for the SahiCareer
2019-2022 local models until those are wired in.
"""

# ---------------------------------------------------------------------------
# 1. RECRUITER PII — dropped before ANY further processing (spec Section 3.2).
#    PII must never reach an AI call, never be aggregated, never be persisted.
# ---------------------------------------------------------------------------
PII_COLUMNS = [
    "Contact Person",
    "Contact Mobile No",
    "Recruiter Email Id",
    "Approver Email Id",
    "Verification Email",
    "CreatedBy",
    "TAF Manager",
    "BD Manager",
    "Recruiter Company",
    "TAF Confirmation Doc Url",
    # extra person identifiers present in the export, stripped for safety:
    "UpdatedBy",
    "Approval Remarks",   # free-text, can name individuals
]

# ---------------------------------------------------------------------------
# 2. TITLE NORMALIZATION
# ---------------------------------------------------------------------------

# Abbreviation / synonym → canonical expansion. Conservative on purpose:
# only mappings that are unambiguous in this BFSI/IT/retail/sales dataset.
# Keys are matched against the FULL normalized title (whole-string) OR as
# standalone tokens, depending on ABBREV_WHOLE vs ABBREV_TOKEN below.
ABBREV_WHOLE = {
    "cse": "customer service executive",
    "csa": "customer service associate",
    "cce": "customer care executive",
    "cre": "customer relationship executive",
    "bde": "business development executive",
    "bdm": "business development manager",
    "deo": "data entry operator",
    "de": "data entry operator",
    "tsr": "tele sales representative",
    "tse": "territory sales executive",
    "rm": "relationship manager",
    "bo": "back office executive",
    "kyc": "kyc executive",
    "hr": "hr executive",
    "mis": "mis executive",
    "co": "computer operator",
}

# Multi-word phrase normalizations (applied as substring replacements on the
# normalized title before tokenization).
PHRASE_NORMALIZE = {
    "tele caller": "telecaller",
    "tele calling": "telecalling",
    "tele sales": "telesales",
    "tele marketing": "telemarketing",
    "back office": "backoffice",
    "front office": "frontoffice",
    "data entry": "dataentry",
    "customer care": "customercare",
    "customer service": "customerservice",
    "customer support": "customersupport",
    "business development": "businessdevelopment",
    "relationship manager": "relationshipmanager",
    "field sales": "fieldsales",
    "inside sales": "insidesales",
}
# reverse map to pretty-print a canonical title back to spaced words
PHRASE_PRETTY = {v: k for k, v in PHRASE_NORMALIZE.items()}

# Noise tokens removed from titles (hiring/marketing/gender/urgency/location noise).
TITLE_STOPWORDS = {
    "urgent", "urgently", "immediate", "immediately", "required", "require",
    "requirement", "wanted", "hiring", "hire", "opening", "openings", "vacancy",
    "vacancies", "job", "jobs", "for", "in", "at", "the", "a", "an", "with",
    "fresher", "freshers", "male", "female", "candidate", "candidates", "post",
    "position", "profile", "work", "from", "home", "wfh", "part", "full", "time",
    "apply", "now", "new", "and", "&", "cum", "or", "any",
}

# Pure seniority prefixes collapsed away so "Jr Sales Executive" groups with
# "Sales Executive". (Assistant/Associate are real roles, so NOT included here.)
SENIORITY_TOKENS = {"jr", "junior", "sr", "senior", "trainee", "intern"}

# ---------------------------------------------------------------------------
# 3. JUNK DETECTION (spec Section 3.4)
# ---------------------------------------------------------------------------
JUNK_TITLE_EXACT = {
    "", "n", "na", "n/a", "nil", "none", "test", "testing", "abc", "abcd",
    "xyz", "asdf", "qwerty", "tbd", "todo", "dummy", "sample", ".", "-", "--",
    "...", "job", "post", "vacancy", "0", "1", "check", "demo",
}
# A title is junk if, after cleaning, it is empty / too short / all non-alpha /
# in JUNK_TITLE_EXACT / has no alphabetic character.
MIN_TITLE_LEN = 3

# Skill text is treated as junk (skipped during aggregation) if it matches these.
JUNK_SKILL_EXACT = {"", "n", "na", "n/a", "nil", "none", "-", ".", "any", "no"}

# ---------------------------------------------------------------------------
# 4. SKILLS LEXICON — curated common skills for Indian entry-level BFSI/IT/
#    retail/sales roles. Each canonical skill maps to the surface forms we
#    match (case-insensitive, word-boundary) inside the messy Skill Requirements
#    free text. This yields clean, real skills instead of sentence fragments.
# ---------------------------------------------------------------------------
SKILLS_LEXICON = {
    "Communication": ["communication", "verbal communication", "written communication", "communicate"],
    "English Proficiency": ["english", "spoken english", "fluent english", "english speaking"],
    "Customer Service": ["customer service", "customer support", "customer care", "customer handling", "customer satisfaction"],
    "Sales": ["sales", "selling", "sales target", "revenue"],
    "Telecalling": ["telecalling", "tele calling", "telecaller", "cold calling", "outbound calls", "calling"],
    "MS Excel": ["excel", "ms excel", "microsoft excel", "spreadsheet"],
    "MS Office": ["ms office", "microsoft office", "ms-office"],
    "MS Word": ["ms word", "microsoft word"],
    "Data Entry": ["data entry", "dataentry", "data management", "data processing"],
    "Typing": ["typing", "typing speed", "keyboard"],
    "Tally": ["tally", "tally erp"],
    "Accounting": ["accounting", "accounts", "bookkeeping", "book keeping", "gst", "taxation"],
    "Computer Knowledge": ["computer knowledge", "basic computer", "computer literacy", "computer operating"],
    "Problem Solving": ["problem solving", "problem-solving", "troubleshooting"],
    "Teamwork": ["teamwork", "team work", "team player", "team handling"],
    "Time Management": ["time management", "punctual", "punctuality"],
    "Interpersonal Skills": ["interpersonal", "people skills", "relationship building"],
    "Negotiation": ["negotiation", "negotiating"],
    "Marketing": ["marketing", "digital marketing", "field marketing", "promotion"],
    "Lead Generation": ["lead generation", "lead gen", "leads"],
    "CRM": ["crm", "customer relationship management"],
    "Banking": ["banking", "bank", "loans", "credit card", "casa"],
    "Insurance": ["insurance", "policy", "life insurance"],
    "Networking": ["networking", "lan", "tcp/ip", "router"],
    "Hardware Troubleshooting": ["hardware", "desktop support", "system troubleshooting"],
    "Windows OS": ["windows", "windows os", "operating system"],
    "Adaptability": ["adaptability", "adaptable", "flexible", "flexibility"],
    "Multitasking": ["multitasking", "multi tasking"],
    "Presentation Skills": ["presentation", "presentations"],
    "Convincing Skills": ["convincing", "persuasion", "persuasive"],
    "Documentation": ["documentation", "record keeping", "filing"],
    "Inventory Management": ["inventory", "stock management", "stock keeping"],
    "Billing": ["billing", "invoicing", "cashier", "cash handling"],
    "Hindi": ["hindi"],
    "Local Language": ["regional language", "local language", "vernacular"],
    "Leadership": ["leadership", "team lead", "team leading"],
    "Analytical Skills": ["analytical", "analysis", "analytics"],
}
