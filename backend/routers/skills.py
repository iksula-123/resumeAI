from fastapi import APIRouter, HTTPException

router = APIRouter()

@router.get("/skills")
async def get_skills():
    """Get all available skills"""
    return {
        "skills": [
            "Python", "JavaScript", "TypeScript", "React", "Next.js",
            "FastAPI", "PostgreSQL", "AWS", "Docker", "Git",
            "HTML", "CSS", "Tailwind", "SQL", "REST API", "Node.js",
            "MongoDB", "Redis", "GraphQL", "Vue.js", "Angular",
            "Java", "C++", "Go", "Rust", "Kotlin"
        ]
    }

@router.get("/skills/search")
async def search_skills(q: str = ""):
    """Search skills by query"""
    all_skills = [
        "Python", "JavaScript", "TypeScript", "React", "Next.js",
        "FastAPI", "PostgreSQL", "AWS", "Docker", "Git",
        "HTML", "CSS", "Tailwind", "SQL", "REST API", "Node.js",
        "MongoDB", "Redis", "GraphQL", "Vue.js", "Angular",
        "Java", "C++", "Go", "Rust", "Kotlin"
    ]
    
    if not q:
        return {"skills": all_skills}
    
    # Filter skills by query
    filtered = [s for s in all_skills if q.lower() in s.lower()]
    return {"skills": filtered}

@router.post("/skills/validate")
async def validate_skill(skill: str):
    """Validate if a skill exists"""
    valid_skills = [
        "Python", "JavaScript", "TypeScript", "React", "Next.js",
        "FastAPI", "PostgreSQL", "AWS", "Docker", "Git",
        "HTML", "CSS", "Tailwind", "SQL", "REST API", "Node.js",
        "MongoDB", "Redis", "GraphQL", "Vue.js", "Angular",
        "Java", "C++", "Go", "Rust", "Kotlin"
    ]
    
    is_valid = skill in valid_skills
    return {"skill": skill, "valid": is_valid}