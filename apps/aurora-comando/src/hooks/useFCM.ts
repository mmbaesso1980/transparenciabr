import { useCallback, useState } from 'react'

export function useFCM() {
  const [token, setToken] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return null
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result !== 'granted') return null
    try {
      const { getMessaging, getToken } = await import('firebase/messaging')
      const app = (await import('../firebase/config')).default
      const messaging = getMessaging(app)
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
      if (!vapidKey) {
        console.warn('VITE_FIREBASE_VAPID_KEY ausente — push FCM desabilitado.')
        return null
      }
      const t = await getToken(messaging, { vapidKey })
      setToken(t)
      return t
    } catch (err) {
      console.error('FCM init falhou:', err)
      return null
    }
  }, [])

  return { token, permission, requestPermission }
}
