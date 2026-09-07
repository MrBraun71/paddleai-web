export const APP_VERSION: string = __APP_VERSION__
export const BUILD_DATE: string = __BUILD_DATE__

export async function hardReset() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    localStorage.clear()
    sessionStorage.clear()
  } catch (e) {
    console.error('Hard reset error', e)
  }
  window.location.reload()
}