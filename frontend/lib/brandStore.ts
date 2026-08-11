import { create } from 'zustand'
import { api } from './api'

interface PlatformSettings {
  brand_name: string
  support_email: string | null
  maintenance_mode: boolean
  announcement: string | null
}

interface BrandStore extends PlatformSettings {
  loaded: boolean
  load: () => Promise<void>
}

/**
 * The mentorship module's own branding (admin-editable via Settings →
 * /admin/mentorship/settings), fetched once and shared by every sidebar/
 * header instead of each one hardcoding "Mentorle". Falls back to
 * "Mentorle" if the fetch hasn't completed yet or fails (logged out,
 * offline) — never shows a blank brand name.
 */
export const useBrandStore = create<BrandStore>((set, get) => ({
  brand_name: 'Mentorle',
  support_email: null,
  maintenance_mode: false,
  announcement: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const settings = await api.get<PlatformSettings>('/api/mentorship/settings')
      set({ ...settings, loaded: true })
    } catch {
      // Not logged in yet, or offline — keep the "Mentorle" default and
      // let the next mount (post-login) try again.
    }
  },
}))
