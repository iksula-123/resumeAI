import { createClient } from '@supabase/supabase-js'

// Public values — safe to expose to the browser (the anon key is RLS-gated).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * Browser-side Supabase client, used ONLY for OAuth (Google / GitHub) sign-in.
 *
 *  - persistSession:     keep the Supabase session in localStorage
 *  - autoRefreshToken:   silently refresh the JWT before it expires
 *  - detectSessionInUrl: auto-handle the `?code=...` returned to /auth/callback
 *  - flowType 'pkce':    the secure OAuth flow for SPAs (no client secret needed)
 *
 * Email/password auth still goes through our FastAPI backend; this client is the
 * piece that talks directly to Supabase for the OAuth redirect dance.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// createClient throws "supabaseUrl is required" if the URL is empty. Since this
// module is imported app-wide (via the auth store), fall back to a harmless
// placeholder when unconfigured so pages still render — OAuth simply won't work
// until NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set in frontend/.env.local.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)
