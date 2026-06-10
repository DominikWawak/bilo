import { invoke } from '@tauri-apps/api/core'

/** Open a URL in the system default browser via the Tauri backend. */
export const openUrl = (url: string): void => {
  invoke('open_url', { url }).catch((e) => {
    console.warn('open_url failed, falling back to window.open:', e)
    window.open(url, '_blank')
  })
}
