# Webhooks

Subscribe a URL to platform events. Deliveries are **HMAC-SHA256 signed**, retried
up to **3×** with backoff, and every attempt is logged. Manage them in
**Settings → Webhooks** or via the [API](./API.md#webhooks--apiwebhooks-bearer).

## Events
| Event | Fires when |
|---|---|
| `resume.created` | A resume is created |
| `resume.updated` | A resume is saved |
| `resume.deleted` | A resume is deleted |
| `resume.upgraded` | An AI-upgraded resume is saved |
| `resume.exported` | A resume is exported (PDF/DOCX) |
| `ats.completed` | An ATS scan finishes |
| `coverletter.generated` | A cover letter is created |
| `subscription.updated` | Plan changes |
| `subscription.cancelled` | Plan downgraded to free |
| `payment.success` | A payment succeeds |
| `payment.failed` | A payment fails |
| `webhook.test` | You click "Test" |

## Delivery request
`POST` to your URL with:

```
Content-Type: application/json
X-ResumeAI-Event: resume.created
X-ResumeAI-Signature: sha256=<hex hmac>
```

Body:
```json
{
  "event": "resume.created",
  "created_at": "2026-01-01T12:00:00+00:00",
  "data": { "id": "…", "title": "Senior Engineer Resume", "ats_score": 82 }
}
```

A response of **2xx** = success. Anything else (or a timeout) is retried up to 3
times; the final outcome is recorded in `webhook_deliveries`.

## Verifying the signature
The signature is `HMAC_SHA256(secret, raw_request_body)`, hex-encoded, prefixed
with `sha256=`. Compare against the **raw** body bytes (not a re-serialized copy).

```python
import hmac, hashlib

def verify(secret: str, raw_body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
```

```javascript
import crypto from "crypto";

function verify(secret, rawBody, header) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}
```

## Notes
- The signing **secret is shown once** at creation — store it securely.
- Delivery is **best-effort and asynchronous**: it never blocks or fails the action
  that triggered it.
- Use **Test** (Settings → Webhooks) to send a `webhook.test` event and confirm your
  endpoint + signature handling before going live.
- Inspect recent attempts via `GET /api/webhooks/{id}/deliveries`.
