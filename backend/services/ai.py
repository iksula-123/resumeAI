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
        return response.text
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
    raw = await _chat(prompt, max_tokens=300)
    if raw is None:
        return bullet
    return raw.strip().strip('"').strip("'")


async def generate_summary(experience: str, skills: str) -> str:
    prompt = f"""Write a compelling 3-sentence professional resume summary for:
Experience: {experience or 'not provided'}
Skills: {skills or 'not provided'}

Requirements:
- Sentence 1: Years of experience + main specialisation
- Sentence 2: Key technical or domain strengths
- Sentence 3: What value they bring to employers

Return ONLY the 3-sentence summary, no labels or extra text."""
    raw = await _chat(prompt, max_tokens=600)
    if raw is None:
        role = experience.split(" at ")[0] if " at " in experience else (experience[:40] if experience else "professional")
        return (
            f"Results-driven {role} with extensive experience building scalable, high-performance solutions. "
            f"Proficient in {(skills[:80] + '…') if len(skills) > 80 else skills or 'modern technologies'}, "
            "with a consistent track record of delivering high-impact projects on time. "
            "Passionate about clean code, cross-team collaboration, and continuous professional growth."
        )
    return raw.strip()


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
    return raw.strip()


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
    raw = await _chat(prompt, max_tokens=500)
    if raw is None:
        return ("Structure your answer with the STAR method (Situation, Task, Action, Result) "
                "and include a measurable outcome. Keep it concise and focused on your specific contribution.")
    return raw.strip()


async def sample_answer(question: str, job_title: str) -> str:
    prompt = f"""Write a strong, natural-sounding sample answer (4-6 sentences) to this interview
question for a "{job_title or 'professional'}" role.

Question: {question}

Use the STAR method where relevant, include a concrete example with a measurable result,
and sound human, not robotic. Return only the answer text."""
    raw = await _chat(prompt, max_tokens=700)
    if raw is None:
        return ("A strong answer follows STAR: briefly set the Situation and your Task, detail the "
                "Actions you personally took, and finish with a measurable Result (e.g. a % improvement "
                "or time saved). Tie it back to the role you're applying for.")
    return raw.strip()
