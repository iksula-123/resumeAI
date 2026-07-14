# API Reference

Base URL: `http://localhost:8000` (dev) · your Render URL (prod).
Interactive docs (auto-generated): **`/docs`** (Swagger) and **`/redoc`**.

## Authentication
Two schemes:
- **Dashboard API** — `Authorization: Bearer <supabase_jwt>`. Used by the web app.
- **Public API (`/api/v1`)** — `X-API-Key: rsk_live_…`. For integrations; rate-limited
  to **60 requests/min per key**.

A `401` means the JWT expired/invalid (re-login) or the API key is invalid/revoked.

---

## Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | — | Register (email/password); returns `access_token` + user |
| POST | `/login` | — | Log in; returns `access_token` + user |
| GET | `/me` | Bearer | Current user (auto-creates the profile) |
| GET | `/profile/{user_id}` | Bearer | A user's profile (self or admin) |

## Resumes — `/api/resumes`
| Method | Path | Description |
|---|---|---|
| GET | `/` | List the user's resumes (with assembled `content`) |
| POST | `/` | Create (`title, template_id, content, ats_score, source`) |
| GET | `/{id}` | Get one |
| PUT | `/{id}` | Update (snapshots a version) |
| DELETE | `/{id}` | Delete |
| GET | `/{id}/versions` | Version history |
| GET | `/{id}/versions/{version_id}` | One version incl. content |
| POST | `/{id}/versions/{version_id}/restore` | **Rollback** (reversible) |

## AI Resume Upgrade — `/api/upgrade`
| Method | Path | Description |
|---|---|---|
| POST | `/parse` | multipart file (PDF/DOCX/TXT) → structured `content` (+ archives original to Storage) |
| POST | `/analyze` | `{content}` → ATS readiness score + recommendations (no JD) |
| POST | `/enhance` | `{content}` → `{original, enhanced, ats_before, ats_after, improvements}` |

## AI — `/api/ai`
| Method | Path | Description |
|---|---|---|
| POST | `/generate-bullets` | Achievement bullets for a role |
| POST | `/enhance-bullet` | Rewrite one bullet |
| POST | `/generate-summary` | Professional summary |
| POST | `/generate-cover-letter` | Cover letter body |
| POST | `/suggest-skills` | Role-relevant skills |
| POST | `/skill-gap` | `{target, current_skills}` → matched/missing + match % |
| POST | `/interview-questions` | 12 role questions (Technical/Behavioral/HR) |
| POST | `/answer-feedback` | Coaching on a practice answer |
| POST | `/sample-answer` | Model STAR answer |

> All AI endpoints degrade to deterministic fallbacks if the AI quota/key is unavailable.

## ATS — `/api/ats`
| Method | Path | Description |
|---|---|---|
| POST | `/score` | `{resume_content, job_description, resume_id?, job_title?}` → score + matched/missing + suggestions (saves an `ats_report` when tied to a resume) |
| GET | `/reports` | All ATS scans for the user |
| GET | `/reports/{resume_id}` | Scans for one resume |
| DELETE | `/reports/{report_id}` | Delete a scan |

## Export — `/api/export`
| Method | Path | Description |
|---|---|---|
| POST | `/pdf` | `{content, title}` → PDF stream (archived to Storage) |
| POST | `/docx` | `{content, title}` → DOCX stream (archived to Storage) |

## Cover Letters — `/api/cover-letters`
`GET /` · `POST /` · `GET /{id}` · `PUT /{id}` · `DELETE /{id}`

## Job Tracker — `/api/applications`
`GET /` · `POST /` · `PUT /{app_id}` · `DELETE /{app_id}` — status in
`applied|interview|offer|rejected|joined`.

## Storage — `/api/storage`
| Method | Path | Description |
|---|---|---|
| GET | `/files` | The user's stored files with short-lived signed URLs |
| DELETE | `/files?path=…` | Delete a file (path scoped to the user) |

## API Keys — `/api/keys` (Bearer)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List keys (prefix only) |
| POST | `/` | Create — returns the **full key once** |
| DELETE | `/{key_id}` | Revoke |

## Webhooks — `/api/webhooks` (Bearer)
| Method | Path | Description |
|---|---|---|
| GET | `/events` | Available event names |
| GET | `/` | List subscriptions |
| POST | `/` | Create (`url, events`) — returns **secret once** |
| PATCH | `/{id}` | Toggle active / change events |
| DELETE | `/{id}` | Delete |
| GET | `/{id}/deliveries` | Recent delivery attempts |
| POST | `/{id}/test` | Send a test delivery |

See [WEBHOOKS.md](./WEBHOOKS.md).

## Billing — `/api/billing`
| Method | Path | Description |
|---|---|---|
| POST | `/create-checkout` | Stripe checkout session (Bearer) |
| POST | `/webhook` | Stripe webhook receiver |
| GET | `/subscription` | Current tier |
| GET | `/payments` | Payment history |

## Admin — `/api/admin` (admin role required)
| Method | Path | Description |
|---|---|---|
| GET | `/stats` | Platform counts |
| GET | `/analytics` | Totals + AI token usage/cost, per-feature, top users |
| GET | `/users` | All users |
| GET | `/audit-logs?limit=&action=` | Audit trail |
| PATCH | `/users/{id}/role` | Change role |
| PATCH | `/users/{id}/active` | Enable/disable |
| DELETE | `/users/{id}` | Delete user |

## Public API v1 — `/api/v1` (X-API-Key)
| Method | Path | Description |
|---|---|---|
| GET | `/me` | The key owner's profile |
| GET | `/resumes` | `{data: [...]}` list |
| GET | `/resumes/{id}` | `{data: {...}}` |

### Example
```bash
curl https://<backend>/api/v1/resumes -H "X-API-Key: rsk_live_xxx"
```
