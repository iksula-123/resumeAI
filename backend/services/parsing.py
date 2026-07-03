"""Extract plain text from an uploaded resume (PDF / DOCX / TXT)."""
import io
import re


def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    text = ""
    try:
        if name.endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
        elif name.endswith(".docx"):
            from docx import Document
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    parts.append(" ".join(c.text for c in row.cells))
            text = "\n".join(parts)
        else:
            text = data.decode("utf-8", "ignore")
    except Exception:
        # last-ditch: try utf-8 decode
        try:
            text = data.decode("utf-8", "ignore")
        except Exception:
            text = ""
    # normalize whitespace
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def quick_contact(text: str) -> dict:
    """Regex fallback to pull obvious contact fields if the AI parse fails."""
    email = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    phone = re.search(r"(\+?\d[\d\s().-]{7,}\d)", text)
    first_line = next((l.strip() for l in text.splitlines() if l.strip()), "")
    return {
        "fullName": first_line[:60] if len(first_line) < 60 else "",
        "email": email.group(0) if email else "",
        "phone": phone.group(0).strip() if phone else "",
        "jobTitle": "", "location": "", "linkedin": "", "github": "", "website": "",
    }
