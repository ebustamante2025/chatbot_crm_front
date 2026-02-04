import { useState, useEffect, useCallback, useRef } from 'react'
import {
  clearAuth,
  getStoredUser,
  getMe,
  listarConversaciones,
  obtenerConversacion,
  enviarMensaje,
  asignarConversacion,
  cerrarConversacion,
} from './services/api'
import { useSocket } from './useSocket'
import type { RolCRM } from './types'
import type { ConversacionConMensajes } from './services/api'
import Login from './Login'
import './App.css'

const ROLES: { id: RolCRM; label: string }[] = [
  { id: 'asesor', label: 'Asesor' },
  { id: 'administrador', label: 'Administrador' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'ventas', label: 'Ventas' },
]

/** Solo tres estados: EN_COLA, ASIGNADA, CERRADA */
function labelEstado(estado: string): string {
  if (estado === 'EN_COLA') return 'En cola'
  if (estado === 'ASIGNADA') return 'Asignada'
  if (estado === 'CERRADA') return 'Cerrada'
  return estado
}

function App() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null)
  const socket = useSocket()
  const [usuarioAgente, setUsuarioAgente] = useState<{ id_usuario: number; username: string } | null>(getStoredUser())
  const [rolActivo, setRolActivo] = useState<RolCRM>('asesor')
  const [conversaciones, setConversaciones] = useState<ConversacionConMensajes[]>([])
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<ConversacionConMensajes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorAsignar, setErrorAsignar] = useState<string | null>(null)
  const [contactoEscribiendo, setContactoEscribiendo] = useState(false)
  const [mostrarAdminPregFrecuen, setMostrarAdminPregFrecuen] = useState(false)
  const chatMensajesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('crm_token') : null
    if (!token) {
      setAutenticado(false)
      return
    }
    getMe()
      .then(({ usuario }) => {
        setUsuarioAgente({ id_usuario: usuario.id_usuario, username: usuario.username })
        setAutenticado(true)
      })
      .catch(() => {
        clearAuth()
        setUsuarioAgente(null)
        setAutenticado(false)
      })
  }, [])

  const cargarConversaciones = useCallback(async () => {
    setCargando(true)
    try {
      const { conversaciones: lista } = await listarConversaciones()
      setConversaciones(lista)
    } catch (e) {
      console.error('Error cargando conversaciones:', e)
    } finally {
      setCargando(false)
    }
  }, [])

  const cargarConversacion = useCallback(async (id: number) => {
    setErrorAsignar(null)
    try {
      const conv = await obtenerConversacion(id)
      setConversacionSeleccionada(conv)
    } catch (e) {
      console.error('Error cargando conversación:', e)
    }
  }, [])

  useEffect(() => {
    cargarConversaciones()
  }, [cargarConversaciones])

  // WebSocket: unirse a sala de conversación al seleccionar una
  useEffect(() => {
    if (!socket || !conversacionSeleccionada) return
    const id = conversacionSeleccionada.id_conversacion
    socket.emit('join_conversation', id)
    return () => {
      socket.emit('leave_conversation', id)
    }
  }, [socket, conversacionSeleccionada?.id_conversacion])

  // WebSocket: escuchar nuevos mensajes en tiempo real
  useEffect(() => {
    if (!socket) return
    const onNewMessage = (mensaje: { id_mensaje: number; conversacion_id: number; tipo_emisor: string; contenido: string; creado_en: string; contacto_nombre?: string; agente_username?: string }) => {
      setConversacionSeleccionada((prev) => {
        if (!prev || prev.id_conversacion !== mensaje.conversacion_id) return prev
        return { ...prev, mensajes: [...(prev.mensajes || []), mensaje] }
      })
    }
    socket.on('new_message', onNewMessage)
    return () => {
      socket.off('new_message', onNewMessage)
    }
  }, [socket])

  // WebSocket: escuchar nuevas conversaciones
  useEffect(() => {
    if (!socket) return
    const onNewConversation = () => {
      cargarConversaciones()
    }
    socket.on('new_conversation', onNewConversation)
    return () => {
      socket.off('new_conversation', onNewConversation)
    }
  }, [socket, cargarConversaciones])

  // WebSocket: indicador "contacto está escribiendo"
  useEffect(() => {
    if (!socket) return
    const onTyping = (data: { quien?: string }) => {
      if (data?.quien === 'contacto') setContactoEscribiendo(true)
    }
    socket.on('user_typing', onTyping)
    socket.on('user_typing_stop', () => setContactoEscribiendo(false))
    return () => {
      socket.off('user_typing', onTyping)
      socket.off('user_typing_stop')
    }
  }, [socket])

  // Emitir "está escribiendo" al widget cuando el agente escribe (debounce)
  useEffect(() => {
    if (!socket || !conversacionSeleccionada || !nuevoMensaje.trim()) return
    const t = setTimeout(() => {
      socket.emit('typing', {
        conversacionId: conversacionSeleccionada.id_conversacion,
        quien: 'agente',
        username: usuarioAgente?.username,
      })
    }, 400)
    return () => clearTimeout(t)
  }, [socket, conversacionSeleccionada?.id_conversacion, nuevoMensaje])

  useEffect(() => {
    if (!socket || !conversacionSeleccionada || nuevoMensaje.trim()) return
    const t = setTimeout(() => socket.emit('typing_stop', { conversacionId: conversacionSeleccionada.id_conversacion }), 600)
    return () => clearTimeout(t)
  }, [socket, conversacionSeleccionada?.id_conversacion, nuevoMensaje])

  const handleAsignar = async () => {
    if (!conversacionSeleccionada) return
    if (!usuarioAgente) {
      setErrorAsignar('No hay sesión de agente.')
      return
    }
    setErrorAsignar(null)
    try {
      await asignarConversacion(conversacionSeleccionada.id_conversacion, usuarioAgente.id_usuario)
      await cargarConversacion(conversacionSeleccionada.id_conversacion)
      cargarConversaciones()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al asignar'
      setErrorAsignar(msg)
      if (msg.includes('autorizado') || msg.includes('Token')) {
        clearAuth()
        setAutenticado(false)
      }
      // Si otro asesor tomó la conversación (409), actualizar lista y conversación actual
      if (msg.includes('tomada por otro asesor')) {
        cargarConversaciones()
        cargarConversacion(conversacionSeleccionada.id_conversacion)
      }
    }
  }

  const handleLogout = () => {
    clearAuth()
    setUsuarioAgente(null)
    setAutenticado(false)
  }

  const handleCerrar = async () => {
    if (!conversacionSeleccionada) return
    try {
      await cerrarConversacion(conversacionSeleccionada.id_conversacion)
      setConversacionSeleccionada(null)
      cargarConversaciones()
    } catch (e) {
      console.error('Error cerrando:', e)
    }
  }

  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoMensaje.trim() || !conversacionSeleccionada || enviando) return
    if (!usuarioAgente) return

    const contenido = nuevoMensaje.trim()
    setNuevoMensaje('')
    socket?.emit('typing_stop', { conversacionId: conversacionSeleccionada.id_conversacion })

    const tempId = `temp-${Date.now()}`
    const ahora = new Date().toISOString()
    const tempMensaje = {
      id_mensaje: tempId,
      tipo_emisor: 'AGENTE',
      contenido,
      creado_en: ahora,
      agente_username: usuarioAgente.username,
    }
    setConversacionSeleccionada((prev) =>
      prev ? { ...prev, mensajes: [...(prev.mensajes || []), tempMensaje] } : prev
    )
    setEnviando(true)
    try {
      await enviarMensaje({
        empresa_id: conversacionSeleccionada.empresa_id,
        conversacion_id: conversacionSeleccionada.id_conversacion,
        tipo_emisor: 'AGENTE',
        usuario_id: usuarioAgente.id_usuario,
        contenido,
      })
      // El mensaje ya está en la lista; el servidor emite new_message y reemplazamos el temp por el real
    } catch (e) {
      console.error('Error enviando mensaje:', e)
      setConversacionSeleccionada((prev) =>
        prev ? { ...prev, mensajes: (prev.mensajes || []).filter((m) => (m as { id_mensaje?: unknown }).id_mensaje !== tempId) } : prev
      )
    } finally {
      setEnviando(false)
    }
  }

  const formatearFecha = (fecha: string) => {
    const d = new Date(fecha)
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  }

  // Scroll automático del chat al final cuando llegan nuevos mensajes
  useEffect(() => {
    const el = chatMensajesRef.current
    if (!el || !conversacionSeleccionada) return
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight
    }
    scrollToBottom()
    const raf = requestAnimationFrame(scrollToBottom)
    const t = setTimeout(scrollToBottom, 80)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [conversacionSeleccionada?.mensajes?.length, contactoEscribiendo, conversacionSeleccionada?.id_conversacion])

  if (autenticado === null) {
    return (
      <div className="crm-app crm-loading-page">
        <p>Cargando...</p>
      </div>
    )
  }

  if (!autenticado) {
    return (
      <Login
        onSuccess={() => {
          setUsuarioAgente(getStoredUser())
          setAutenticado(true)
        }}
      />
    )
  }

  return (
    <div className="crm-app">
      <header className="crm-header">
        <h1>CRM ChatBot</h1>
        <nav className="crm-tabs">
          {ROLES.map((r) => (
            <button
              key={r.id}
              className={`crm-tab ${rolActivo === r.id ? 'crm-tab--active' : ''}`}
              onClick={() => setRolActivo(r.id)}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            className={`crm-tab crm-tab-admin-preg ${mostrarAdminPregFrecuen ? 'crm-tab--active' : ''}`}
            onClick={() => setMostrarAdminPregFrecuen(!mostrarAdminPregFrecuen)}
            title="Administración de Preguntas Frecuentes"
          >
            Admin Preg. Frec.
          </button>
        </nav>
        <div className="crm-header-user">
          <span>{usuarioAgente?.username}</span>
          <button type="button" className="crm-btn crm-btn--logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="crm-main">
        {mostrarAdminPregFrecuen ? (
          <section className="crm-admin-pregfrecuen">
            <div className="crm-admin-pregfrecuen-header">
              <h2>Administración de Preguntas Frecuentes</h2>
              <p className="crm-admin-pregfrecuen-hint">
                Gestiona las preguntas frecuentes que se muestran en el widget del chatbot.
              </p>
            </div>
            <div className="crm-admin-pregfrecuen-content">
              <p className="crm-admin-pregfrecuen-placeholder">
                Aquí podrás agregar, editar y eliminar preguntas frecuentes. (Próximamente)
              </p>
            </div>
          </section>
        ) : (
          <>
        <aside className="crm-sidebar">
          <div className="crm-sidebar-header">
            <h2>Conversaciones</h2>
            <button className="crm-btn-refresh" onClick={cargarConversaciones} title="Actualizar">
              ↻
            </button>
          </div>
          <p className="crm-sidebar-hint">
            Mensajes de empresas y contactos en turno. Selecciona una y toma la conversación para chatear.
          </p>
          <div className="crm-conversaciones-lista">
            {cargando ? (
              <p className="crm-loading">Cargando...</p>
            ) : conversaciones.length === 0 ? (
              <p className="crm-empty">No hay conversaciones</p>
            ) : (
              conversaciones.map((c) => (
                <button
                  key={c.id_conversacion}
                  className={`crm-conversacion-item ${
                    conversacionSeleccionada?.id_conversacion === c.id_conversacion ? 'crm-conversacion-item--active' : ''
                  }`}
                  onClick={() => cargarConversacion(c.id_conversacion)}
                >
                  <span className="crm-conversacion-empresa">
                    {c.empresa_nombre || 'Empresa'} {c.empresa_nit ? `(NIT: ${c.empresa_nit})` : ''}
                  </span>
                  <span className="crm-conversacion-nombre">{c.contacto_nombre || 'Sin nombre'}</span>
                  {(c.contacto_email || c.contacto_telefono) && (
                    <span className="crm-conversacion-contacto">
                      {[c.contacto_email, c.contacto_telefono].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <span className="crm-conversacion-estado">{c.estado === 'EN_COLA' ? 'En cola' : c.estado}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="crm-chat">
          {conversacionSeleccionada ? (
            <>
              <div className="crm-chat-header">
                <div>
                  <h3>{conversacionSeleccionada.contacto_nombre || 'Contacto'}</h3>
                  <span className="crm-chat-meta crm-chat-meta-empresa">
                    Empresa: {conversacionSeleccionada.empresa_nombre || '—'} {conversacionSeleccionada.empresa_nit ? `(NIT: ${conversacionSeleccionada.empresa_nit})` : ''}
                  </span>
                  <span className="crm-chat-meta">
                    {conversacionSeleccionada.contacto_email && `${conversacionSeleccionada.contacto_email} · `}
                    {conversacionSeleccionada.contacto_telefono && `${conversacionSeleccionada.contacto_telefono} · `}
                    {conversacionSeleccionada.estado === 'EN_COLA' ? 'En cola — toma la conversación para chatear' : labelEstado(conversacionSeleccionada.estado)}
                  </span>
                </div>
                <div className="crm-chat-actions">
                  {errorAsignar && <span className="crm-chat-error">{errorAsignar}</span>}
                  {conversacionSeleccionada.estado === 'EN_COLA' && (
                    <button className="crm-btn crm-btn--primary" onClick={handleAsignar} disabled={!usuarioAgente}>
                      Tomar conversación{usuarioAgente ? ` (${usuarioAgente.username})` : ''}
                    </button>
                  )}
                  {conversacionSeleccionada.estado === 'ASIGNADA' && (
                    <button className="crm-btn crm-btn--secondary" onClick={handleCerrar}>
                      Cerrar
                    </button>
                  )}
                </div>
              </div>

              <div className="crm-chat-mensajes" ref={chatMensajesRef}>
                {(conversacionSeleccionada.mensajes || []).map((m) => (
                  <div
                    key={typeof m.id_mensaje !== 'undefined' ? String(m.id_mensaje) : `msg-${m.creado_en}`}
                    className={`crm-mensaje crm-mensaje--${m.tipo_emisor.toLowerCase()}`}
                  >
                    <div className="crm-mensaje-burbuja">
                      <span className="crm-mensaje-contenido">{m.contenido}</span>
                      <span className="crm-mensaje-hora">{formatearFecha(m.creado_en)}</span>
                    </div>
                  </div>
                ))}
                {contactoEscribiendo && (
                  <div className="crm-mensaje crm-mensaje--contacto crm-mensaje-typing">
                    <div className="crm-mensaje-burbuja">
                      <span className="crm-mensaje-contenido">Contacto está escribiendo...</span>
                    </div>
                  </div>
                )}
              </div>

              <form className="crm-chat-input" onSubmit={handleEnviarMensaje}>
                <input
                  type="text"
                  placeholder="Escribe un mensaje..."
                  value={nuevoMensaje}
                  onChange={(e) => setNuevoMensaje(e.target.value)}
                  disabled={enviando || conversacionSeleccionada.estado === 'EN_COLA'}
                />
                <button type="submit" className="crm-btn crm-btn--send" disabled={enviando || !nuevoMensaje.trim()}>
                  Enviar
                </button>
              </form>
            </>
          ) : (
            <div className="crm-chat-empty">
              <p>Selecciona una conversación para chatear con el agente</p>
            </div>
          )}
        </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
