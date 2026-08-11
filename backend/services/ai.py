"""
AI service — provider priority:
  1. Google Gemini 1.5 Flash (free tier, set GEMINI_API_KEY)
  2. OpenAI GPT-4o-mini (set OPENAI_API_KEY with credits)
  3. Smart static fallback (always works)
"""
import json
import os


# ─── Gemini ──────────────────────────────────────────────────────────────────

def _gemini_model():
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=key)
        return genai.GenerativeModel("gemini-2.5-flash")
    except Exception:
        return None


async def _gemini_chat(prompt: str, max_tokens: int = 500) -> str | None:
    model = _gemini_model()
    if model is None:
        return None
    try:
        response = await model.generate_content_async(
            prompt,
            generation_config={"max_output_tokens": max_tokens, "temperature": 0.7},
        )
        text = response.text
        # Best-effort token accounting (Phase 14)
        try:
            um = getattr(response, "usage_metadata", None)
            if um is not None:
                from services.usage import record_usage
                await record_usage(
                    "gemini-2.0-flash-lite",
                    getattr(um, "prompt_token_count", 0),
                    getattr(um, "candidates_token_count", 0),
                )
        except Exception:
            pass
        return text
    except Exception:
        return None


# ─── OpenAI ──────────────────────────────────────────────────────────────────

def _openai_client():
    key = os.getenv("OPENAI_API_KEY", "")
    if not key:
        return None
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=key)
    except Exception:
        return None


async def _openai_chat(messages: list[dict], max_tokens: int = 500) -> str | None:
    cl = _openai_client()
    if cl is None:
        return None
    try:
        response = await cl.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
    except Exception:
        return None


# ─── Unified chat (tries Gemini → OpenAI → None) ─────────────────────────────

async def _chat(prompt: str, max_tokens: int = 500) -> str | None:
    result = await _gemini_chat(prompt, max_tokens)
    if result:
        return result
    result = await _openai_chat(
        [{"role": "user", "content": prompt}], max_tokens
    )
    return result  # None if both fail → callers use smart fallback


def _extract_json_list(raw: str) -> list | None:
    """Pull a JSON array out of an LLM response, tolerating ``` fences / prose."""
    if not raw:
        return None
    cleaned = raw.replace("```json", "").replace("```", "")
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(cleaned[start:end + 1])
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def _extract_json_object(raw: str) -> dict | None:
    """Pull a JSON object out of an LLM response, tolerating ``` fences / prose."""
    if not raw:
        return None
    cleaned = raw.replace("```json", "").replace("```", "")
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(cleaned[start:end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return None


def _finish_incomplete(text: str) -> str:
    """Guard against a generation that got cut off mid-sentence (e.g. hit the token
    budget before finishing) — trim back to the last complete sentence instead of
    showing a dangling half-word/phrase like "...Agile methodologies, data-"."""
    text = text.strip()
    if not text or text[-1] in '.!?"\'”’':
        return text
    for i in range(len(text) - 1, -1, -1):
        if text[i] in ".!?":
            return text[:i + 1].strip()
    return text  # no earlier sentence boundary found — better to show it than blank it


def _clean_lines(raw: str) -> list[str]:
    """Fallback parse: one item per line, stripped of bullets/quotes/fences."""
    out = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or "```" in s or s in ("[", "]"):
            continue
        s = s.lstrip("•-*0123456789. ").strip().strip('"').strip(",").strip('"').strip()
        if s and s not in ("[", "]"):
            out.append(s)
    return out


# ─── Public functions ─────────────────────────────────────────────────────────

async def generate_bullets(position: str, company: str, description: str) -> list[str]:
    prompt = f"""Generate 4 strong resume bullet points for:
Position: {position}
Company: {company}
Context: {description[:400]}

Rules:
- Start each with a strong action verb (Led, Built, Increased, Reduced, Developed…)
- Include quantified results (%, $, numbers) where possible
- Maximum 20 words each

Return ONLY a valid JSON array of 4 strings, nothing else. Example:
["Led team of 8 engineers to deliver payment feature, reducing checkout time by 40%", "..."]"""

    raw = await _chat(prompt, max_tokens=1200)
    if raw is None:
        return _fallback_bullets(position, company)
    parsed = _extract_json_list(raw)
    items = [str(b) for b in parsed] if parsed else _clean_lines(raw)
    bullets = [b for b in items if b][:4]
    return bullets if bullets else _fallback_bullets(position, company)


def _fallback_bullets(position: str, company: str) -> list[str]:
    return [
        f"Led key initiatives as {position} at {company}, delivering measurable impact",
        "Improved team efficiency by 30% through process automation and workflow optimization",
        "Collaborated cross-functionally with stakeholders to deliver projects on schedule",
        "Mentored junior team members and contributed to technical documentation and best practices",
    ]


async def enhance_bullet(bullet: str) -> str:
    prompt = f"""Rewrite this resume bullet to be more impactful:
"{bullet}"

Rules: strong action verb, quantified result if possible, ≤20 words.
Return ONLY the improved bullet text, no quotes or explanation."""
    raw = await _chat(prompt, max_tokens=500)
    if raw is None:
        return bullet
    return _finish_incomplete(raw.strip().strip('"').strip("'"))


async def generate_summary(experience: str, skills: str) -> str:
    prompt = f"""Write a compelling 3-sentence professional resume summary for:
Experience: {experience or 'not provided'}
Skills: {skills or 'not provided'}

Requirements:
- Sentence 1: Years of experience + main specialisation
- Sentence 2: Key technical or domain strengths
- Sentence 3: What value they bring to employers

Return ONLY the 3-sentence summary, no labels or extra text."""
    raw = await _chat(prompt, max_tokens=1000)
    if raw is None:
        role = experience.split(" at ")[0] if " at " in experience else (experience[:40] if experience else "professional")
        return (
            f"Results-driven {role} with extensive experience building scalable, high-performance solutions. "
            f"Proficient in {(skills[:80] + '…') if len(skills) > 80 else skills or 'modern technologies'}, "
            "with a consistent track record of delivering high-impact projects on time. "
            "Passionate about clean code, cross-team collaboration, and continuous professional growth."
        )
    return _finish_incomplete(raw.strip())


async def generate_cover_letter(
    job_title: str,
    company: str,
    job_description: str,
    applicant_name: str,
    resume_summary: str = "",
) -> str:
    prompt = f"""Write a professional cover letter body (3 short paragraphs, ~200 words) for:
Applicant: {applicant_name or 'the candidate'}
Role: {job_title} at {company}
Job description excerpt: {job_description[:600]}
Applicant background: {resume_summary or 'experienced professional'}

Structure:
- Paragraph 1: Enthusiasm for the role and why it is a great fit
- Paragraph 2: Two key relevant achievements with impact
- Paragraph 3: Closing call-to-action

Return ONLY the body paragraphs, no salutation, no signature."""
    raw = await _chat(prompt, max_tokens=1200)
    if raw is None:
        return (
            f"I am excited to apply for the {job_title} role at {company}. "
            "My background closely aligns with your requirements, and I am confident I can make an immediate contribution to your team.\n\n"
            "Throughout my career, I have consistently delivered results by combining strong technical skills with a collaborative approach. "
            "I have led projects that improved efficiency, reduced costs, and enhanced user experience — "
            "and I look forward to bringing that same impact to your organisation.\n\n"
            f"I would welcome the opportunity to discuss how my experience can benefit {company}. "
            "Thank you for considering my application — I hope to speak with you soon."
        )
    return _finish_incomplete(raw.strip())


async def role_summary_suggestion(
    role_title: str,
    skills: list[str] | None = None,
    industry: str = "",
    is_fresher: bool = True,
) -> str:
    """A role-tailored professional summary SUGGESTION (spec Milestone C, 'blue').

    This is a candidate-confirmed suggestion, never asserted as fact: it stays
    truthful for a fresher (aspiration + skills), never invents years of experience
    or specific employers. The candidate edits/confirms it before it appears.
    """
    skills = skills or []
    skill_str = ", ".join(skills[:8]) if skills else "relevant core skills"
    level = ("an entry-level candidate / fresher" if is_fresher
             else "an experienced professional")
    ind = f" in the {industry} sector" if industry else ""
    prompt = f"""Write a 2-3 sentence professional resume summary SUGGESTION for {level}
targeting a "{role_title}"{ind} role.

Strict rules (this is a suggestion the candidate will confirm, not a factual claim):
- Do NOT invent specific years of experience, employers, projects, or metrics.
- For a fresher, emphasise aptitude, the listed skills, and eagerness to contribute.
- Keep it honest, generic enough to be true, and easy for the candidate to edit.
- Weave in these skills naturally where relevant: {skill_str}.

Return ONLY the summary text, no labels, no quotes."""
    raw = await _chat(prompt, max_tokens=700)
    if raw is None:
        base = "Motivated" if is_fresher else "Results-driven"
        return (f"{base} candidate seeking a {role_title} role{ind}, with a foundation in "
                f"{skill_str}. Quick to learn, dependable, and eager to contribute and grow. "
                "Edit this summary to reflect your own experience and strengths.")
    return _finish_incomplete(raw.strip().strip('"'))


async def suggest_skills(job_title: str, existing: list[str] | None = None) -> list[str]:
    """Return up to 12 relevant, in-demand skills for a job title (AI-powered)."""
    existing = existing or []
    have = ", ".join(existing) if existing else "none"
    prompt = f"""List the 12 most relevant, in-demand resume skills for this role:
Job title: {job_title or 'professional'}
Already listed (exclude these): {have}

Mix hard/technical skills and the most valuable tools. Keep each 1-3 words.
Return ONLY a valid JSON array of strings, nothing else.
Example: ["React", "TypeScript", "REST APIs", "Docker"]"""

    raw = await _chat(prompt, max_tokens=1500)
    if raw is None:
        return []
    have_lc = {s.lower() for s in existing}
    out, seen = [], set()

    parsed = _extract_json_list(raw)
    items = [str(s) for s in parsed] if parsed is not None else _clean_lines(raw)

    for name in items:
        name = name.strip().strip('"').strip(",").strip()
        k = name.lower()
        if name and len(name) <= 40 and k not in have_lc and k not in seen:
            seen.add(k)
            out.append(name)
    return out[:12]


def _fallback_questions(job_title: str) -> list[dict]:
    role = job_title.strip() or "this role"
    tech = [
        f"Walk me through the core technical skills required for a {role} and how you've applied them.",
        f"Describe the most technically challenging project you've worked on as a {role}.",
        f"How do you stay current with tools and best practices relevant to a {role}?",
        f"What does a high-quality outcome look like in a {role} position, and how do you measure it?",
        f"Explain a technical concept central to a {role} as if to a non-technical stakeholder.",
    ]
    behavioral = [
        "Tell me about a time you handled a difficult disagreement with a teammate.",
        "Describe a situation where you had to meet a tight deadline. What did you do?",
        "Give an example of a project where you took initiative or showed leadership.",
        "Tell me about a time you failed or made a mistake. What did you learn?",
    ]
    hr = [
        "Tell me about yourself.",
        f"Why do you want this {role} position, and why now?",
        "Where do you see yourself in five years?",
    ]
    out = [{"type": "Technical", "question": q} for q in tech]
    out += [{"type": "Behavioral", "question": q} for q in behavioral]
    out += [{"type": "HR", "question": q} for q in hr]
    return out


async def generate_interview_questions(job_title: str) -> list[dict]:
    """Return ~12 categorized interview questions for a role (AI, with smart fallback)."""
    prompt = f"""Generate 12 realistic interview questions for a "{job_title or 'professional'}" role.
Mix: 5 Technical, 4 Behavioral, 3 HR questions.
Return ONLY a valid JSON array of objects, nothing else. Each object:
{{"type": "Technical", "question": "..."}}
"type" must be exactly one of: Technical, HR, Behavioral."""
    raw = await _chat(prompt, max_tokens=1500)
    out = []
    if raw:
        parsed = _extract_json_list(raw)
        if parsed:
            for item in parsed:
                if isinstance(item, dict) and item.get("question"):
                    t = str(item.get("type", "Technical")).title()
                    if t not in ("Technical", "Hr", "Behavioral"):
                        t = "Technical"
                    out.append({"type": "HR" if t == "Hr" else t, "question": str(item["question"]).strip()})
    # Fall back to role-tailored templates if the AI was unavailable / rate-limited
    return out[:15] if out else _fallback_questions(job_title)


async def answer_feedback(question: str, answer: str) -> str:
    prompt = f"""You are an experienced interview coach. Give concise, constructive feedback
(3-4 sentences) on this candidate's answer.

Question: {question}
Candidate's answer: {answer}

Call out one genuine strength and 1-2 specific, actionable improvements.
Reference the STAR method if the answer lacks structure. Be encouraging but honest.
Return only the feedback text."""
    raw = await _chat(prompt, max_tokens=700)
    if raw is None:
        return ("Structure your answer with the STAR method (Situation, Task, Action, Result) "
                "and include a measurable outcome. Keep it concise and focused on your specific contribution.")
    return _finish_incomplete(raw.strip())


async def sample_answer(question: str, job_title: str) -> str:
    prompt = f"""Write a strong, natural-sounding sample answer (4-6 sentences) to this interview
question for a "{job_title or 'professional'}" role.

Question: {question}

Use the STAR method where relevant, include a concrete example with a measurable result,
and sound human, not robotic. Return only the answer text."""
    raw = await _chat(prompt, max_tokens=900)
    if raw is None:
        return ("A strong answer follows STAR: briefly set the Situation and your Task, detail the "
                "Actions you personally took, and finish with a measurable Result (e.g. a % improvement "
                "or time saved). Tie it back to the role you're applying for.")
    return _finish_incomplete(raw.strip())


# ─── Multilingual (Phase 3) ───────────────────────────────────────────────────

LANGUAGES = {
    "en": "English", "de": "German", "fr": "French", "es": "Spanish",
    "it": "Italian", "nl": "Dutch", "ar": "Arabic", "ja": "Japanese",
    "zh": "Chinese (Simplified)", "hi": "Hindi", "mr": "Marathi", "pt": "Portuguese",
}


async def translate_resume(content: dict, target_language: str) -> dict | None:
    """Translate the descriptive text of a resume into the target language.

    Proper nouns (names, companies, schools) are kept as-is; summary, bullets,
    field/degree labels, project descriptions and achievements are translated.
    Returns a translated copy of `content`, or None if AI is unavailable.
    """
    import copy
    lang = LANGUAGES.get(target_language, target_language or "English")

    payload = {
        "summary": content.get("summary", ""),
        "experience": [
            {"bullets": e.get("bullets", [])} for e in (content.get("experience") or [])
        ],
        "education": [
            {"degree": e.get("degree", ""), "field": e.get("field", "")}
            for e in (content.get("education") or [])
        ],
        "projects": [
            {"description": p.get("description", "")} for p in (content.get("projects") or [])
        ],
        "achievements": content.get("achievements", []),
    }

    prompt = f"""Translate the text values in this resume JSON into {lang}.
Rules: translate descriptive text naturally and professionally; do NOT translate
proper nouns, brand/tool names, or acronyms; keep the exact JSON structure and array
lengths. Return ONLY the translated JSON object.

{json.dumps(payload, ensure_ascii=False)[:5000]}"""

    raw = await _chat(prompt, max_tokens=4000)
    if raw is None:
        return None
    obj = _extract_json_object(raw)
    if not obj:
        return None

    out = copy.deepcopy(content)
    if obj.get("summary"):
        out["summary"] = str(obj["summary"])
    for i, e in enumerate(out.get("experience") or []):
        tb = (obj.get("experience") or [])
        if i < len(tb) and isinstance(tb[i], dict) and tb[i].get("bullets"):
            e["bullets"] = [str(b) for b in tb[i]["bullets"]]
    for i, e in enumerate(out.get("education") or []):
        te = (obj.get("education") or [])
        if i < len(te) and isinstance(te[i], dict):
            if te[i].get("degree"):
                e["degree"] = str(te[i]["degree"])
            if te[i].get("field"):
                e["field"] = str(te[i]["field"])
    for i, p in enumerate(out.get("projects") or []):
        tp = (obj.get("projects") or [])
        if i < len(tp) and isinstance(tp[i], dict) and tp[i].get("description"):
            p["description"] = str(tp[i]["description"])
    if isinstance(obj.get("achievements"), list) and obj["achievements"]:
        out["achievements"] = [str(a) for a in obj["achievements"]]
    return out


# ─── AI Career Copilot (Phase 7) ──────────────────────────────────────────────

COPILOT_PROMPTS = [
    "How can I make my resume stand out for a senior role?",
    "What skills should I learn next for my career?",
    "Help me write a strong professional summary.",
    "How do I explain a career gap in interviews?",
    "What are common mistakes that hurt ATS scores?",
    "How should I negotiate a higher salary?",
]


def _copilot_fallback(message: str) -> str:
    """Deterministic, genuinely useful guidance when the model is unavailable."""
    m = (message or "").lower()
    if any(k in m for k in ("ats", "applicant tracking", "keyword")):
        return ("To pass ATS: mirror the exact keywords from the job description, use a single-column "
                "layout with standard section headings (Experience, Education, Skills), avoid tables, "
                "text boxes and images, and save as a text-based PDF. Quantify achievements so recruiters "
                "see impact at a glance.")
    if any(k in m for k in ("summary", "profile", "objective")):
        return ("A strong summary is 2–3 sentences: your title + years of experience, your 2–3 strongest "
                "skills tied to the target role, and one quantified achievement. Lead with impact, not duties — "
                "e.g. 'Senior Engineer with 6 years scaling fintech platforms; cut latency 40%.'")
    if any(k in m for k in ("gap", "unemploy", "break")):
        return ("Address a career gap honestly and briefly: state what you did (upskilling, caregiving, "
                "freelance, health) and pivot quickly to what you bring now. Frame it as growth. On the resume, "
                "use years instead of months and consider a 'Professional Development' entry.")
    if any(k in m for k in ("salary", "negotiat", "offer", "pay")):
        return ("Research the market range first (Levels.fyi, Glassdoor). Never give a number first — ask for "
                "their range. When you counter, anchor on value and a specific figure with a small buffer, and "
                "negotiate the whole package (equity, bonus, PTO, remote), not just base.")
    if any(k in m for k in ("skill", "learn", "grow", "next")):
        return ("Pick skills where market demand meets your trajectory. Look at 5–10 target job postings and "
                "list the skills that repeat — those are your priorities. Balance one deep technical skill with "
                "one leadership/communication skill. Use our Skill-Gap tool to see exactly what's missing.")
    if any(k in m for k in ("interview", "star", "answer")):
        return ("Prepare 5–6 STAR stories (Situation, Task, Action, Result) covering leadership, conflict, "
                "failure and impact. Quantify every result. Research the company, prepare thoughtful questions, "
                "and practice out loud. Try our Interview Prep tool for role-specific questions.")
    return ("Great career question! In general: tailor every resume to the specific role, quantify your impact "
            "with numbers, keep formatting ATS-friendly, and keep learning in-demand skills. Ask me about your "
            "resume, ATS scores, interviews, skills to learn, or salary negotiation and I'll go deeper.")


async def career_copilot(message: str, history: list[dict] | None = None,
                         profile_context: str = "") -> dict:
    """Personalized career-coach chat reply. Always returns {reply, ai}."""
    message = (message or "").strip()
    if not message:
        return {"reply": "Ask me anything about your resume, career, interviews or job search!", "ai": False}

    convo = ""
    for turn in (history or [])[-6:]:
        role = "User" if turn.get("role") == "user" else "Copilot"
        convo += f"{role}: {str(turn.get('content', '')).strip()}\n"

    ctx = f"\nWhat you know about this user:\n{profile_context}\n" if profile_context else ""
    prompt = f"""You are ResumeAI Copilot, an expert career coach and resume strategist inside a resume-builder app.
Be warm, specific and actionable. Give concrete, tailored advice — not generic platitudes.
Keep replies to 3–6 sentences unless the user asks for more. Use plain text (no markdown headers).
When relevant, point the user to app tools: Resume Editor, ATS Scan, Skill-Gap, Interview Prep, AI Upgrade.
{ctx}
Recent conversation:
{convo}User: {message}
Copilot:"""
    raw = await _chat(prompt, max_tokens=900)
    if raw is None:
        return {"reply": _copilot_fallback(message), "ai": False}
    return {"reply": _finish_incomplete(raw.strip()), "ai": True}


# ─── Skill-gap analysis ───────────────────────────────────────────────────────

async def required_skills_for(target: str) -> list[str]:
    """AI list of the key skills required for a target role or job description."""
    target = (target or "").strip()
    is_jd = len(target) > 80
    if is_jd:
        prompt = (f"From this job description, extract the 15 most important required skills "
                  f"and technologies:\n\n{target[:1800]}\n\n")
    else:
        prompt = f'List the 15 most important, in-demand skills required for a "{target or "professional"}" role.\n'
    prompt += "Keep each 1-3 words. Return ONLY a JSON array of skill-name strings."

    raw = await _chat(prompt, max_tokens=1500)
    if not raw:
        return []
    parsed = _extract_json_list(raw)
    items = [str(s) for s in parsed] if parsed else _clean_lines(raw)
    out, seen = [], set()
    for s in items:
        name = s.strip().strip('"').strip(",").strip()
        k = name.lower()
        if name and len(name) <= 40 and k not in seen:
            seen.add(k)
            out.append(name)
    return out[:15]


async def skill_gap(target: str, current_skills: list[str]) -> dict:
    """Compare a resume's skills against those required for a target role/JD."""
    required = await required_skills_for(target)
    cur_lc = {s.lower() for s in (current_skills or [])}
    matched = [r for r in required if r.lower() in cur_lc]
    missing = [r for r in required if r.lower() not in cur_lc]
    match_score = round(len(matched) / len(required) * 100) if required else 0
    return {
        "required": required,
        "matched": matched,
        "missing": missing,
        "match_score": match_score,
    }


# ─── AI Resume Upgrade: parse raw text → structured content ───────────────────

def _empty_content() -> dict:
    return {
        "personalInfo": {"fullName": "", "jobTitle": "", "email": "", "phone": "",
                         "location": "", "linkedin": "", "website": "", "github": ""},
        "summary": "", "experience": [], "education": [], "skills": [],
        "projects": [], "certifications": [], "languages": [], "achievements": [], "interests": [],
    }


def _normalize_content(obj: dict) -> dict:
    """Coerce an AI/parsed object into our canonical content shape."""
    c = _empty_content()
    if not isinstance(obj, dict):
        return c
    pi = obj.get("personalInfo") or {}
    if isinstance(pi, dict):
        for k in c["personalInfo"]:
            c["personalInfo"][k] = str(pi.get(k, "") or "")
    c["summary"] = str(obj.get("summary", "") or "")
    for i, e in enumerate(obj.get("experience", []) or []):
        if not isinstance(e, dict):
            continue
        bullets = e.get("bullets", [])
        if isinstance(bullets, str):
            bullets = [bullets]
        c["experience"].append({
            "id": f"exp{i}", "position": str(e.get("position", "") or ""),
            "company": str(e.get("company", "") or ""), "location": str(e.get("location", "") or ""),
            "startDate": str(e.get("startDate", "") or ""), "endDate": str(e.get("endDate", "") or ""),
            "current": bool(e.get("current", False)),
            "bullets": [str(b) for b in bullets if str(b).strip()],
        })
    for i, e in enumerate(obj.get("education", []) or []):
        if not isinstance(e, dict):
            continue
        c["education"].append({
            "id": f"edu{i}", "degree": str(e.get("degree", "") or ""), "field": str(e.get("field", "") or ""),
            "institution": str(e.get("institution", "") or ""), "location": str(e.get("location", "") or ""),
            "startDate": str(e.get("startDate", "") or ""), "endDate": str(e.get("endDate", "") or ""),
            "gpa": str(e.get("gpa", "") or ""),
        })
    for s in obj.get("skills", []) or []:
        if isinstance(s, dict) and s.get("name"):
            c["skills"].append({"name": str(s["name"]), "level": int(s.get("level", 75) or 75)})
        elif isinstance(s, str) and s.strip():
            c["skills"].append({"name": s.strip(), "level": 75})
    for i, p in enumerate(obj.get("projects", []) or []):
        if isinstance(p, dict) and p.get("name"):
            c["projects"].append({"id": f"proj{i}", "name": str(p["name"]),
                                  "technologies": str(p.get("technologies", "") or ""),
                                  "description": str(p.get("description", "") or "")})
    for i, cert in enumerate(obj.get("certifications", []) or []):
        if isinstance(cert, dict) and cert.get("name"):
            c["certifications"].append({"id": f"cert{i}", "name": str(cert["name"]),
                                        "issuer": str(cert.get("issuer", "") or ""),
                                        "date": str(cert.get("date", "") or "")})
    for l in obj.get("languages", []) or []:
        if isinstance(l, dict) and l.get("name"):
            c["languages"].append({"name": str(l["name"]), "proficiency": str(l.get("proficiency", "") or "")})
        elif isinstance(l, str) and l.strip():
            c["languages"].append({"name": l.strip(), "proficiency": ""})
    ach = obj.get("achievements", []) or []
    c["achievements"] = [str(a) for a in ach if str(a).strip()] if isinstance(ach, list) else []
    return c


async def parse_resume_to_content(text: str) -> dict | None:
    """Use AI to turn raw resume text into our structured content JSON."""
    snippet = text[:6000]
    prompt = f"""Extract the following resume text into structured JSON.

RESUME TEXT:
{snippet}

Return ONLY a JSON object with EXACTLY these keys:
{{
  "personalInfo": {{"fullName","jobTitle","email","phone","location","linkedin","github","website"}},
  "summary": "professional summary text",
  "experience": [{{"position","company","location","startDate","endDate","current":false,"bullets":["..."]}}],
  "education": [{{"degree","field","institution","location","startDate","endDate","gpa"}}],
  "skills": ["skill1","skill2"],
  "projects": [{{"name","technologies","description"}}],
  "certifications": [{{"name","issuer","date"}}],
  "languages": [{{"name","proficiency"}}]
}}
Use the actual data from the text. If a field is unknown, use "". Return only valid JSON."""
    raw = await _chat(prompt, max_tokens=4000)
    if raw is None:
        return None
    obj = _extract_json_object(raw)
    return _normalize_content(obj) if obj else None


# ─── AI Resume Upgrade: enhance a structured resume ───────────────────────────

async def enhance_resume(content: dict) -> dict:
    """Return an improved copy of the resume content (stronger bullets, summary, skills)."""
    import copy
    job_title = (content.get("personalInfo") or {}).get("jobTitle", "")
    skills_now = [s["name"] if isinstance(s, dict) else s for s in (content.get("skills") or [])]

    payload = json.dumps({
        "jobTitle": job_title,
        "summary": content.get("summary", ""),
        "experience": [
            {"position": e.get("position", ""), "company": e.get("company", ""),
             "bullets": e.get("bullets", [])}
            for e in (content.get("experience") or [])
        ],
        "skills": skills_now,
    })[:5000]

    prompt = f"""You are an expert resume writer. Improve this resume data.

CURRENT DATA (JSON):
{payload}

Rules:
- Rewrite each experience bullet to start with a strong action verb and include a quantified result (%, $, time, scale) where plausible. Keep it truthful to the role. Max 22 words each.
- Write a compelling 3-sentence professional summary.
- Suggest a strong skill set (merge existing + add relevant in-demand ones for the job title).

Return ONLY a JSON object:
{{
  "summary": "...",
  "experience": [{{"position":"...","company":"...","bullets":["...","..."]}}],
  "skills": ["...", "..."]
}}"""
    raw = await _chat(prompt, max_tokens=4000)
    enhanced = copy.deepcopy(content)

    obj = _extract_json_object(raw) if raw else None
    if obj:
        if obj.get("summary"):
            enhanced["summary"] = str(obj["summary"]).strip()
        ai_exps = obj.get("experience") or []
        for i, exp in enumerate(enhanced.get("experience") or []):
            if i < len(ai_exps) and isinstance(ai_exps[i], dict):
                new_bullets = ai_exps[i].get("bullets") or []
                new_bullets = [str(b).strip() for b in new_bullets if str(b).strip()]
                if new_bullets:
                    exp["bullets"] = new_bullets
        ai_skills = obj.get("skills") or []
        merged, seen = [], set()
        for s in [*skills_now, *ai_skills]:
            name = str(s).strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                merged.append({"name": name, "level": 80})
        if merged:
            enhanced["skills"] = merged
        return enhanced

    # ── Fallback (AI unavailable): targeted local improvements ────────────────
    if not enhanced.get("summary"):
        enhanced["summary"] = await generate_summary(
            ", ".join(f"{e.get('position','')} at {e.get('company','')}" for e in enhanced.get("experience") or []),
            ", ".join(skills_now),
        )
    if len(skills_now) < 6:
        extra = await suggest_skills(job_title, skills_now)
        enhanced["skills"] = [{"name": n, "level": 80} for n in [*skills_now, *extra]]
    return enhanced
