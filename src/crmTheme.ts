export const CRM_THEME_STORAGE_KEY = 'crm_theme'

export type CrmTheme = 'light' | 'dark'

export function getInitialTheme(): CrmTheme {
  try {
    const v = localStorage.getItem(CRM_THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* ignore */
  }
  return 'dark'
}

/** Solo actualiza el DOM (sin escribir localStorage). */
export function setThemeOnDocument(theme: CrmTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

export function persistTheme(theme: CrmTheme): void {
  try {
    localStorage.setItem(CRM_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function initCrmTheme(): CrmTheme {
  const theme = getInitialTheme()
  setThemeOnDocument(theme)
  return theme
}

export function readAppliedTheme(): CrmTheme {
  const a = document.documentElement.getAttribute('data-theme')
  return a === 'light' || a === 'dark' ? a : 'dark'
}

/** Alterna tema y persiste en localStorage. */
export function toggleAndPersistTheme(): CrmTheme {
  const next = readAppliedTheme() === 'dark' ? 'light' : 'dark'
  setThemeOnDocument(next)
  persistTheme(next)
  return next
}
