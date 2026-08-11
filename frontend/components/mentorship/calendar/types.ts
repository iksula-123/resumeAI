/** Shared shape both calendar widgets render — callers map their own
 * session/task/event rows into this before handing them to the widget. */
export interface CalendarItem {
  id: string
  title: string
  subtitle?: string
  time?: string
  status?: string
}

export const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-good-500',
  completed: 'bg-royal-500',
  cancelled: 'bg-red-400',
  no_show: 'bg-amber-500',
  rescheduled: 'bg-teal-500',
}
