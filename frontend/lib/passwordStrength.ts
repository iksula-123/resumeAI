// Simple, local password-strength heuristic for the Reset Password page's
// visual indicator. Not a security control — Supabase's own GoTrue enforces
// the real minimum server-side; this is purely a UX hint, never a gate that
// blocks a legitimate password Supabase itself would accept.

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  color: string
}

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length < 8) return { score: 0, label: 'Too short', color: '#c0392b' }

  let points = 0
  if (pw.length >= 12) points++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++
  if (/[0-9]/.test(pw)) points++
  if (/[^A-Za-z0-9]/.test(pw)) points++

  if (points >= 4) return { score: 4, label: 'Strong', color: '#1E7A46' }
  if (points === 3) return { score: 3, label: 'Good', color: '#2E7D8A' }
  if (points === 2) return { score: 2, label: 'Fair', color: '#F5A623' }
  return { score: 1, label: 'Weak', color: '#EE6C2B' }
}
