import { useEffect, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

/**
 * URL del backend para WebSocket. En desarrollo, si el proxy falla con ws://,
 * define VITE_WS_URL=http://localhost:3004 (puerto del backend) en .env
 */
const getSocketUrl = (): string => {
  const env = import.meta.env.VITE_WS_URL
  if (env && typeof env === 'string') return env.trim()
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
