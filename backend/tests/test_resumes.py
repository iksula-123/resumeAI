import pytest


DEMO_TOKEN = "demo-test-user"
HEADERS = {"Authorization": f"Bearer {DEMO_TOKEN}"}


@pytest.mark.asyncio
async def test_list_resumes_unauthenticated(client):
    r = await client.get("/api/resumes/")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_signup_and_create_resume(client):
    # Signup
    r = await client.post("/api/auth/signup", json={
        "email": "test@example.com",
        "password": "password123",
        "full_name": "Test User",
    })
    assert r.status_code == 200
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create resume
    r2 = await client.post("/api/resumes/", json={"title": "My Test Resume"}, headers=headers)
    assert r2.status_code == 201
    resume = r2.json()
    assert resume["title"] == "My Test Resume"
    assert "id" in resume

    # List resumes
    r3 = await client.get("/api/resumes/", headers=headers)
    assert r3.status_code == 200
    assert len(r3.json()) >= 1

    # Get resume
    r4 = await client.get(f"/api/resumes/{resume['id']}", headers=headers)
    assert r4.status_code == 200
    assert r4.json()["title"] == "My Test Resume"

    # Update resume
    r5 = await client.put(
        f"/api/resumes/{resume['id']}",
        json={"title": "Updated Title"},
        headers=headers,
    )
    assert r5.status_code == 200
    assert r5.json()["title"] == "Updated Title"

    # Delete resume
    r6 = await client.delete(f"/api/resumes/{resume['id']}", headers=headers)
    assert r6.status_code == 204


@pytest.mark.asyncio
async def test_ats_score(client):
    r = await client.post("/api/auth/signup", json={
        "email": "ats@example.com",
        "password": "pass123",
        "full_name": "ATS Tester",
    })
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r2 = await client.post("/api/ats/score", json={
        "resume_content": {
            "personalInfo": {"fullName": "ATS Tester", "email": "ats@example.com"},
            "summary": "Python developer with FastAPI experience",
            "experience": [],
            "education": [],
            "skills": ["Python", "FastAPI", "PostgreSQL"],
        },
        "job_description": "We are looking for a Python developer with FastAPI and PostgreSQL experience.",
    }, headers=headers)

    assert r2.status_code == 200
    data = r2.json()
    assert "score" in data
    assert data["score"] > 0
    assert "matched" in data
    assert "python" in data["matched"] or "fastapi" in data["matched"]
