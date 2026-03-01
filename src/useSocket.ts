import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

/**
 * URL del backend para WebSocket. Debe ser la misma que usa la API para que
 * widget y CRM estén en la misma sala y funcione la vista previa en vivo.
 * Prioridad: VITE_WS_URL > base de VITE_API_URL > origin (solo si hay proxy).
 */
const getSocketUrl = (): string => {
  const ws = import.meta.env.VITE_WS_URL
  if (ws && typeof ws === 'string') return ws.trim().replace(/\/$/, '')
  const api = import.meta.env.VITE_API_URL
  if (api && typeof api === 'string') {
    const base = api.trim().replace(/\/api\/?$/, '')
    if (base) return base
  }
  return window.location.origin
}

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    const url = getSocketUrl()
    const s = io(url, { path: '/socket.io', transports: ['polling', 'websocket'] })
    s.on('connect', () => {
      s.emit('join_crm')
    })
    setSocket(s)
    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [])

  return socket
}
