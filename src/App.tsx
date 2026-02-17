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
  transferirConversacion,
  listarUsuarios,
  setOnSessionReplaced,
} from './services/api'
import type { UsuarioSoporte } from './services/api'
import { useSocket } from './useSocket'
import type { RolCRM } from './types'
import type { ConversacionConMensajes } from './services/api'
import Login from './Login'
import AdminPreguntasFrecuentes from './AdminPreguntasFrecuentes'
import AdminPortal from './AdminPortal'
import './App.css'

const TODOS_LOS_TABS: { id: RolCRM; label: string }[] = [
  { id: 'asesor', label: 'Asesor' },
  { id: 'administrador', label: 'Administrador' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'admin_faq', label: 'Admin Preg. Frec.' },
]

// Tabs visibles según el rol del usuario en BD
const TABS_POR_ROL: Record<string, RolCRM[]> = {
  ADMIN:      ['asesor', 'administrador', 'supervisor', 'ventas', 'admin_faq'],
  SUPERVISOR: ['asesor', 'supervisor', 'ventas', 'admin_faq'],
  VENTAS:     ['asesor', 'ventas'],
  ASESOR:     ['asesor'],
  AGENTE:     ['asesor'],
}

/** Estados: EN_COLA, ASIGNADA, ACTIVA, CERRADA */
function labelEstado(estado: string): string {
  if (estado === 'EN_COLA') return 'En cola'
  if (estado === 'ASIGNADA') return 'Asignada'
  if (estado === 'ACTIVA') return 'Activa'
  if (estado === 'CERRADA') return 'Cerrada'
  return estado
}

/** Extrae primer nombre + primer apellido de un nombre completo.
 *  Ej: "Eduardo Antonio Bustamante García" → "Eduardo Bustamante"
 *  Si solo tiene un nombre, lo devuelve tal cual.
 *  Si no hay nombre_completo, usa el fallback (username). */
function nombreCorto(nombreCompleto?: string | null, fallback?: string): string {
  if (!nombreCompleto?.trim()) return fallback || '—'
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length <= 2) return nombreCompleto.trim()
  // Primer nombre + primer apellido (posición ceil(length/2))
  // Heurística: si hay 3 partes → [nombre, apellido1, apellido2], si hay 4 → [nombre1, nombre2, apellido1, apellido2]
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`
  return `${partes[0]} ${partes[2]}`
}

function App() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null)
  const socket = useSocket()
  const [usuarioAgente, setUsuarioAgente] = useState<{ id_usuario: number; username: string; nombre_completo?: string | null; rol?: string } | null>(getStoredUser())
  const [rolActivo, setRolActivo] = useState<RolCRM>('asesor')
  const [conversaciones, setConversaciones] = useState<ConversacionConMensajes[]>([])
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<ConversacionConMensajes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [nuevoMensaje, setNuevoMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorAsignar, setErrorAsignar] = useState<string | null>(null)
  const [contactoEscribiendo, setContactoEscribiendo] = useState<string | false>(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [modalCerrarCaso, setModalCerrarCaso] = useState(false)
  const [cerrarCasoMotivo, setCerrarCasoMotivo] = useState('')
  const [cerrarCasoNotas, setCerrarCasoNotas] = useState('')
  const [cerrandoCaso, setCerrandoCaso] = useState(false)
  const [modalTransferir, setModalTransferir] = useState(false)
  const [usuariosDisponibles, setUsuariosDisponibles] = useState<UsuarioSoporte[]>([])
  const [transferirUsuarioId, setTransferirUsuarioId] = useState<number | ''>('')
  const [transferirMotivo, setTransferirMotivo] = useState('')
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [transferirError, setTransferirError] = useState<string | null>(null)
  const [sesionReemplazada, setSesionReemplazada] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const chatMensajesRef = useRef<HTMLDivElement>(null)

  // Registrar callback para cuando la sesión es reemplazada por otro login
  useEffect(() => {
    setOnSessionReplaced(() => {
      setSesionReemplazada(true)
      clearAuth()
      setAutenticado(false)
      setUsuarioAgente(null)
      setConversacionSeleccionada(null)
      setConversaciones([])
    })
  }, [])

  useEffect(() => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('crm_token') : null
    if (!token) {
      setAutenticado(false)
      return
    }
    getMe()
      .then(({ usuario }) => {
        setUsuarioAgente({ id_usuario: usuario.id_usuario, username: usuario.username, nombre_completo: usuario.nombre_completo, rol: usuario.rol })
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
    if (autenticado) cargarConversaciones()
  }, [autenticado, cargarConversaciones])

  // WebSocket: registrar al agente en su sala personal para notificaciones directas
  useEffect(() => {
    if (!socket || !usuarioAgente) return
    socket.emit('register_agent', usuarioAgente.id_usuario)
  }, [socket, usuarioAgente?.id_usuario])

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
    const onNewMessage = (mensaje: { id_mensaje: number; conversacion_id: number; tipo_emisor: string; contenido: string; creado_en: string; contacto_nombre?: string; agente_username?: string; agente_nombre_completo?: string | null }) => {
      setConversacionSeleccionada((prev) => {
        if (!prev || prev.id_conversacion !== mensaje.conversacion_id) return prev
        const mensajesActuales = prev.mensajes || []
        // Si ya existe un mensaje temporal del agente con el mismo contenido, reemplazarlo
        const idxTemp = mensajesActuales.findIndex(
          (m) => typeof m.id_mensaje === 'string' && (m.id_mensaje as string).startsWith('temp-') && m.contenido === mensaje.contenido
        )
        if (idxTemp !== -1) {
          const nuevos = [...mensajesActuales]
          nuevos[idxTemp] = mensaje
          return { ...prev, mensajes: nuevos }
        }
        // Si el mensaje ya existe por id (evitar duplicados), ignorar
        if (mensajesActuales.some((m) => m.id_mensaje === mensaje.id_mensaje)) {
          return prev
        }
        return { ...prev, mensajes: [...mensajesActuales, mensaje] }
      })
    }
    socket.on('new_message', onNewMessage)
    return () => {
      socket.off('new_message', onNewMessage)
    }
  }, [socket])

  // WebSocket: escuchar nuevas conversaciones y actualizaciones de estado
  useEffect(() => {
    if (!socket) return
    const onNewConversation = () => {
      cargarConversaciones()
    }
    const onConversationUpdated = (data: { id_conversacion: number; estado: string; transferida?: boolean; agente_destino_id?: number; agente_origen_id?: number }) => {
      // Actualizar estado en la lista local
      setConversaciones((prev) =>
        prev.map((c) =>
          c.id_conversacion === data.id_conversacion
            ? { ...c, estado: data.estado }
            : c
        )
      )
      // Actualizar la conversación seleccionada si es la misma
      setConversacionSeleccionada((prev) =>
        prev && prev.id_conversacion === data.id_conversacion
          ? { ...prev, estado: data.estado }
          : prev
      )
      // Si fue transferida, recargar la lista completa para que la conversación
      // aparezca/desaparezca del agente correspondiente
      if (data.transferida) {
        cargarConversaciones()
      }
    }
    // Cuando este agente recibe una conversación transferida o nueva asignación
    const onConversationAssigned = () => {
      cargarConversaciones()
    }
    // Cuando hay actividad nueva en una conversación de este agente
    const onNewActivity = (data: { id_conversacion: number }) => {
      cargarConversaciones()
    }
    // Actividad global en el CRM (cualquier mensaje nuevo en cualquier conversación)
    // Debounce para evitar recargas excesivas cuando llegan muchos mensajes seguidos
    let crmActivityTimer: ReturnType<typeof setTimeout> | null = null
    const onCrmActivity = () => {
      if (crmActivityTimer) clearTimeout(crmActivityTimer)
      crmActivityTimer = setTimeout(() => {
        cargarConversaciones()
      }, 500)
    }
    socket.on('new_conversation', onNewConversation)
    socket.on('conversation_updated', onConversationUpdated)
    socket.on('conversation_assigned', onConversationAssigned)
    socket.on('conversation_new_activity', onNewActivity)
    socket.on('crm_activity', onCrmActivity)
    return () => {
      if (crmActivityTimer) clearTimeout(crmActivityTimer)
      socket.off('new_conversation', onNewConversation)
      socket.off('conversation_updated', onConversationUpdated)
      socket.off('conversation_assigned', onConversationAssigned)
      socket.off('conversation_new_activity', onNewActivity)
      socket.off('crm_activity', onCrmActivity)
    }
  }, [socket, cargarConversaciones])

  // WebSocket: indicador "contacto está escribiendo" + vista previa del texto
  useEffect(() => {
    if (!socket) return
    const onTyping = (data: { quien?: string; texto?: string }) => {
      if (data?.quien === 'contacto') {
        setContactoEscribiendo(data.texto || 'escribiendo...')
      }
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

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    if (!menuAbierto) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuAbierto(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuAbierto])

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

  const handleCerrarCaso = async () => {
    if (!conversacionSeleccionada) return
    setCerrandoCaso(true)
    try {
      // 1. Enviar datos del caso a la API externa
      try {
        await fetch('https://agentehgi.hginet.com.co/webhook/prueba-api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cerrarCaso',
            conversacion_id: conversacionSeleccionada.id_conversacion,
            contacto: conversacionSeleccionada.contacto_nombre || '',
            empresa: conversacionSeleccionada.empresa_nombre || '',
            agente: nombreCorto(usuarioAgente?.nombre_completo, usuarioAgente?.username),
            motivo: cerrarCasoMotivo.trim() || '',
            notas: cerrarCasoNotas.trim() || '',
            fecha_cierre: new Date().toISOString(),
          }),
        })
      } catch (err) {
        console.warn('Error al enviar caso a API externa:', err)
      }

      // 2. Cerrar la conversación en el backend
      await cerrarConversacion(conversacionSeleccionada.id_conversacion, {
        motivo: cerrarCasoMotivo.trim() || undefined,
        notas: cerrarCasoNotas.trim() || undefined,
      })
      setModalCerrarCaso(false)
      setCerrarCasoMotivo('')
      setCerrarCasoNotas('')
      setConversacionSeleccionada(null)
      cargarConversaciones()
    } catch (e) {
      console.error('Error cerrando caso:', e)
    } finally {
      setCerrandoCaso(false)
    }
  }

  const abrirModalTransferir = async () => {
    setModalTransferir(true)
    setTransferirUsuarioId('')
    setTransferirMotivo('')
    setTransferirError(null)
    try {
      const { usuarios } = await listarUsuarios()
      // Filtrar: solo activos y excluir al agente actual
      const disponibles = usuarios.filter(
        (u) => u.estado && u.id_usuario !== usuarioAgente?.id_usuario
      )
      setUsuariosDisponibles(disponibles)
    } catch (e) {
      console.error('Error cargando usuarios:', e)
      setUsuariosDisponibles([])
    }
  }

  const handleTransferir = async () => {
    if (!conversacionSeleccionada || !transferirUsuarioId) return
    setTransfiriendo(true)
    setTransferirError(null)
    try {
      await transferirConversacion(
        conversacionSeleccionada.id_conversacion,
        Number(transferirUsuarioId),
        transferirMotivo.trim() || undefined
      )
      setModalTransferir(false)
      setTransferirUsuarioId('')
      setTransferirMotivo('')
      setConversacionSeleccionada(null)
      cargarConversaciones()
    } catch (e: any) {
      setTransferirError(e.message || 'Error al transferir')
    } finally {
      setTransfiriendo(false)
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
      agente_nombre_completo: usuarioAgente.nombre_completo || null,
    }
    setConversacionSeleccionada((prev) =>
      prev ? { ...prev, mensajes: [...(prev.mensajes || []), tempMensaje] } : prev
    )
    setEnviando(true)
    try {
      const resp = await enviarMensaje({
        empresa_id: conversacionSeleccionada.empresa_id,
        conversacion_id: conversacionSeleccionada.id_conversacion,
        tipo_emisor: 'AGENTE',
        usuario_id: usuarioAgente.id_usuario,
        contenido,
      })

      // Reemplazar el mensaje temporal con el real del servidor
      const mensajeReal = (resp as { mensaje?: { id_mensaje: number; creado_en: string } }).mensaje
      if (mensajeReal) {
        setConversacionSeleccionada((prev) => {
          if (!prev) return prev
          const mensajes = (prev.mensajes || []).map((m) =>
            (m as { id_mensaje?: unknown }).id_mensaje === tempId
              ? { ...m, id_mensaje: mensajeReal.id_mensaje, creado_en: mensajeReal.creado_en }
              : m
          )
          return { ...prev, mensajes }
        })
      }

      // Si estaba ASIGNADA, el backend la pasa a ACTIVA: reflejar en UI
      setConversacionSeleccionada((prev) => {
        if (prev && prev.estado === 'ASIGNADA') {
          return { ...prev, estado: 'ACTIVA' }
        }
        return prev
      })
      setConversaciones((prev) =>
        prev.map((c) =>
          c.id_conversacion === conversacionSeleccionada.id_conversacion && c.estado === 'ASIGNADA'
            ? { ...c, estado: 'ACTIVA' }
            : c
        )
      )
    } catch (e) {
      console.error('Error enviando mensaje:', e)
      // No eliminar el mensaje temporal para que el usuario lo vea.
      // Marcarlo visualmente como fallido (contenido conservado)
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
      <>
        {sesionReemplazada && (
          <div className="crm-session-alert">
            ⚠️ Se ha iniciado sesión en otro dispositivo. Solo se permite una sesión activa por usuario.
          </div>
        )}
        <Login
          onSuccess={() => {
            setSesionReemplazada(false)
            setUsuarioAgente(getStoredUser())
            setAutenticado(true)
          }}
        />
      </>
    )
  }

  return (
    <div className="crm-app">
      <header className="crm-header">
        <div className="crm-header-brand">
          <img src="/logo-hgi-white.png" alt="HGI" className="crm-header-logo" />
          <h1>CRM ChatBot</h1>
        </div>
        <nav className="crm-tabs">
          {TODOS_LOS_TABS
            .filter((t) => {
              const rolUsuario = usuarioAgente?.rol || 'ASESOR'
              const permitidos = TABS_POR_ROL[rolUsuario] || TABS_POR_ROL['ASESOR']
              return permitidos.includes(t.id)
            })
            .map((r) => (
              <button
                key={r.id}
                className={`crm-tab ${rolActivo === r.id ? 'crm-tab--active' : ''}`}
                onClick={() => setRolActivo(r.id)}
              >
                {r.label}
              </button>
            ))}
        </nav>
        <div className="crm-header-user">
          <span>{nombreCorto(usuarioAgente?.nombre_completo, usuarioAgente?.username)}</span>
          <button type="button" className="crm-btn crm-btn--logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="crm-main">
        {rolActivo === 'admin_faq' ? (
          <AdminPreguntasFrecuentes />
        ) : rolActivo === 'administrador' ? (
          <AdminPortal socket={socket} />
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
                  <span className="crm-conversacion-estado">
                    {c.estado === 'EN_COLA' ? 'En cola'
                      : c.estado === 'ASIGNADA' ? `Asignada — ${nombreCorto((c as any).agente_nombre_completo, c.agente_username)}`
                      : c.estado === 'ACTIVA' ? `Activa — ${nombreCorto((c as any).agente_nombre_completo, c.agente_username)}`
                      : c.estado === 'CERRADA' ? 'Cerrada'
                      : c.estado}
                  </span>
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
                      Tomar conversación{usuarioAgente ? ` (${nombreCorto(usuarioAgente.nombre_completo, usuarioAgente.username)})` : ''}
                    </button>
                  )}
                  {(conversacionSeleccionada.estado === 'ASIGNADA' || conversacionSeleccionada.estado === 'ACTIVA') && (
                    <div className="crm-chat-menu-wrap" ref={menuRef}>
                      <button
                        className="crm-chat-menu-btn"
                        onClick={() => setMenuAbierto(!menuAbierto)}
                        title="Opciones"
                      >
                        ⋮
                      </button>
                      {menuAbierto && (
                        <div className="crm-chat-menu-dropdown">
                          <button
                            className="crm-chat-menu-item"
                            onClick={() => {
                              setMenuAbierto(false)
                              handleCerrar()
                            }}
                          >
                            Cerrar conversación
                          </button>
                          <button
                            className="crm-chat-menu-item crm-chat-menu-item--transfer"
                            onClick={() => {
                              setMenuAbierto(false)
                              abrirModalTransferir()
                            }}
                          >
                            Transferir chat
                          </button>
                          <button
                            className="crm-chat-menu-item crm-chat-menu-item--danger"
                            onClick={() => {
                              setMenuAbierto(false)
                              setModalCerrarCaso(true)
                            }}
                          >
                            Cerrar caso
                          </button>
                        </div>
                      )}
                    </div>
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
                      <span className="crm-mensaje-peek">{contactoEscribiendo}</span>
                      <span className="crm-mensaje-peek-label">✍️ escribiendo...</span>
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
                  disabled={enviando || conversacionSeleccionada.estado === 'EN_COLA' || conversacionSeleccionada.estado === 'CERRADA'}
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

      {/* Modal Cerrar Caso */}
      {modalCerrarCaso && (
        <div className="crm-modal-overlay" onClick={() => !cerrandoCaso && setModalCerrarCaso(false)}>
          <div className="crm-modal crm-modal-cerrar-caso" onClick={(e) => e.stopPropagation()}>
            <h3>Cerrar caso</h3>
            <p className="crm-modal-subtitulo">
              {conversacionSeleccionada
                ? `Conversación #${conversacionSeleccionada.id_conversacion} — ${conversacionSeleccionada.contacto_nombre || 'Sin contacto'}`
                : 'Conversación'}
            </p>
            <div className="crm-modal-campo">
              <label>Motivo de cierre</label>
              <select
                value={cerrarCasoMotivo}
                onChange={(e) => setCerrarCasoMotivo(e.target.value)}
                disabled={cerrandoCaso}
              >
                <option value="">Seleccione un motivo...</option>
                <option value="Resuelto">Resuelto</option>
                <option value="Sin respuesta del cliente">Sin respuesta del cliente</option>
                <option value="Duplicado">Duplicado</option>
                <option value="Escalado">Escalado</option>
                <option value="No aplica">No aplica</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="crm-modal-campo">
              <label>Notas adicionales</label>
              <textarea
                value={cerrarCasoNotas}
                onChange={(e) => setCerrarCasoNotas(e.target.value)}
                placeholder="Describa brevemente la resolución o motivo de cierre..."
                rows={4}
                disabled={cerrandoCaso}
              />
            </div>
            <div className="crm-modal-acciones">
              <button
                className="crm-btn crm-btn--secondary"
                onClick={() => {
                  setModalCerrarCaso(false)
                  setCerrarCasoMotivo('')
                  setCerrarCasoNotas('')
                }}
                disabled={cerrandoCaso}
              >
                Cancelar
              </button>
              <button
                className="crm-btn crm-btn--danger"
                onClick={handleCerrarCaso}
                disabled={cerrandoCaso || !cerrarCasoMotivo}
              >
                {cerrandoCaso ? 'Cerrando...' : 'Cerrar caso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transferir Chat */}
      {modalTransferir && (
        <div className="crm-modal-overlay" onClick={() => !transfiriendo && setModalTransferir(false)}>
          <div className="crm-modal crm-modal-transferir" onClick={(e) => e.stopPropagation()}>
            <h3>Transferir conversación</h3>
            <p className="crm-modal-subtitulo">
              {conversacionSeleccionada
                ? `Conversación #${conversacionSeleccionada.id_conversacion} — ${conversacionSeleccionada.contacto_nombre || 'Sin contacto'}`
                : 'Conversación'}
            </p>
            {transferirError && (
              <div className="crm-modal-error">{transferirError}</div>
            )}
            <div className="crm-modal-campo">
              <label>Transferir a</label>
              <select
                value={transferirUsuarioId}
                onChange={(e) => setTransferirUsuarioId(e.target.value ? Number(e.target.value) : '')}
                disabled={transfiriendo}
              >
                <option value="">Seleccione un agente...</option>
                {usuariosDisponibles.map((u) => (
                  <option key={u.id_usuario} value={u.id_usuario}>
                    {u.nombre_completo || u.username} — {u.rol}
                  </option>
                ))}
              </select>
            </div>
            <div className="crm-modal-campo">
              <label>Motivo (opcional)</label>
              <textarea
                value={transferirMotivo}
                onChange={(e) => setTransferirMotivo(e.target.value)}
                placeholder="Indique el motivo de la transferencia..."
                rows={3}
                disabled={transfiriendo}
              />
            </div>
            <div className="crm-modal-acciones">
              <button
                className="crm-btn crm-btn--secondary"
                onClick={() => {
                  setModalTransferir(false)
                  setTransferirUsuarioId('')
                  setTransferirMotivo('')
                  setTransferirError(null)
                }}
                disabled={transfiriendo}
              >
                Cancelar
              </button>
              <button
                className="crm-btn crm-btn--transfer"
                onClick={handleTransferir}
                disabled={transfiriendo || !transferirUsuarioId}
              >
                {transfiriendo ? 'Transfiriendo...' : 'Transferir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
