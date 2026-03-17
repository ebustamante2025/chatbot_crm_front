import { useState, useEffect, useCallback, useRef } from 'react'
import {
  clearAuth,
  getStoredUser,
  getMe,
  listarConversaciones,
  obtenerConversacion,
  enviarMensaje,
  editarMensajeContacto,
  eliminarMensajeContacto,
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
import HistorialConversaciones from './HistorialConversaciones'
import SeguimientoBotConversaciones from './SeguimientoBotConversaciones'
import './App.css'

const TODOS_LOS_TABS: { id: RolCRM; label: string }[] = [
  { id: 'asesor', label: 'Asesor' },
  { id: 'administrador', label: 'Administrador' },
  { id: 'historial', label: 'Historial' },
  { id: 'seguimiento_bot', label: 'Seguimiento Bot' },
  { id: 'admin_faq', label: 'Admin Preg. Frec.' },
]

// Tabs visibles según el rol del usuario en BD
const TABS_POR_ROL: Record<string, RolCRM[]> = {
  ADMIN:      ['asesor', 'administrador', 'historial', 'seguimiento_bot', 'admin_faq'],
  SUPERVISOR: ['asesor', 'historial', 'seguimiento_bot', 'admin_faq'],
  VENTAS:     ['asesor'],
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
  const [usuarioAgente, setUsuarioAgente] = useState<{ id_usuario: number; username: string; nombre_completo?: string | null; rol?: string; vistas_permitidas?: string[] | null } | null>(getStoredUser())
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
  const [mensajeEditandoId, setMensajeEditandoId] = useState<number | null>(null)
  const [mensajeEditandoTexto, setMensajeEditandoTexto] = useState('')
  const [mensajeEditandoPreview, setMensajeEditandoPreview] = useState<{ contenido: string; creado_en: string } | null>(null)
  const [editandoMensaje, setEditandoMensaje] = useState(false)
  const [contextMenuMensaje, setContextMenuMensaje] = useState<{ idMensaje: number; contenido: string; creado_en: string; top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const conversacionSeleccionadaIdRef = useRef<number | null>(null)
  const chatMensajesRef = useRef<HTMLDivElement>(null)

  const MENSAJE_EDITABLE_MINUTOS = 3
  const isMensajeEditable = (creadoEn: string) => {
    const creado = new Date(creadoEn).getTime()
    return creado > Date.now() - MENSAJE_EDITABLE_MINUTOS * 60 * 1000
  }

  /** id_mensaje puede venir como number o string del servidor; devolver número para menú y API */
  const idMensajeNumerico = (id: number | string | undefined): number | null => {
    if (id === undefined || id === null) return null
    const s = String(id)
    if (s.startsWith('temp')) return null
    const n = Number(id)
    return Number.isNaN(n) ? null : n
  }

  // Cerrar menú al hacer clic fuera o Escape (backdrop cierra al hacer clic)
  useEffect(() => {
    if (!contextMenuMensaje) return
    const cerrar = () => setContextMenuMensaje(null)
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [contextMenuMensaje])

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
        setUsuarioAgente({ id_usuario: usuario.id_usuario, username: usuario.username, nombre_completo: usuario.nombre_completo, rol: usuario.rol, vistas_permitidas: usuario.vistas_permitidas ?? undefined })
        setAutenticado(true)
      })
      .catch(() => {
        clearAuth()
        setUsuarioAgente(null)
        setAutenticado(false)
      })
  }, [])

  // Si el usuario tiene vistas parametrizadas y el tab activo no está permitido, cambiar al primer tab permitido
  useEffect(() => {
    const vistas = usuarioAgente?.vistas_permitidas
    if (!Array.isArray(vistas) || vistas.length === 0) return
    const tabIds = TODOS_LOS_TABS.map((t) => t.id)
    const permitidos = vistas.filter((v): v is RolCRM => tabIds.includes(v as RolCRM))
    if (permitidos.length > 0 && !permitidos.includes(rolActivo)) {
      setRolActivo(permitidos[0])
    }
  }, [usuarioAgente?.vistas_permitidas, rolActivo])

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

  // WebSocket: unirse a sala de conversación al seleccionar una (cliente y agente en la misma sala)
  useEffect(() => {
    if (!socket || !conversacionSeleccionada) return
    setContactoEscribiendo(false) // Limpiar vista previa al cambiar de conversación
    const id = conversacionSeleccionada.id_conversacion
    const join = () => {
      socket.emit('join_conversation', id)
      socket.emit('agent_join_conversation', id) // asegura que el agente reciba new_message
    }
    join()
    socket.on('connect', join) // re-unirse al reconectar
    return () => {
      socket.off('connect', join)
      socket.emit('leave_conversation', id)
    }
  }, [socket, conversacionSeleccionada?.id_conversacion])

  // Mantener ref actualizada para que los listeners de socket sepan qué conversación está abierta
  useEffect(() => {
    conversacionSeleccionadaIdRef.current = conversacionSeleccionada?.id_conversacion ?? null
  }, [conversacionSeleccionada?.id_conversacion])

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
    const onMessageUpdated = (mensaje: { id_mensaje: number; conversacion_id: number; contenido: string; creado_en: string; tipo_emisor: string; [k: string]: unknown }) => {
      setConversacionSeleccionada((prev) => {
        if (!prev || prev.id_conversacion !== mensaje.conversacion_id) return prev
        const mensajes = (prev.mensajes || []).map((m) =>
          m.id_mensaje === mensaje.id_mensaje ? { ...m, contenido: mensaje.contenido, creado_en: mensaje.creado_en } : m
        )
        return { ...prev, mensajes }
      })
    }
    const onMessageDeleted = (data: { id_mensaje: number; conversacion_id: number }) => {
      const idNum = Number(data.id_mensaje)
      if (!Number.isFinite(idNum)) return
      setConversacionSeleccionada((prev) => {
        if (!prev || Number(prev.id_conversacion) !== Number(data.conversacion_id)) return prev
        const mensajes = (prev.mensajes || []).filter((m) => Number(m.id_mensaje) !== idNum)
        return { ...prev, mensajes }
      })
      setContextMenuMensaje(null)
    }
    socket.on('new_message', onNewMessage)
    socket.on('message_updated', onMessageUpdated)
    socket.on('message_deleted', onMessageDeleted)
    return () => {
      socket.off('new_message', onNewMessage)
      socket.off('message_updated', onMessageUpdated)
      socket.off('message_deleted', onMessageDeleted)
    }
  }, [socket])

  // WebSocket: escuchar nuevas conversaciones y actualizaciones de estado
  useEffect(() => {
    if (!socket) return
    const onNewConversation = () => {
      cargarConversaciones()
    }
    const onConversationUpdated = (data: { id_conversacion: number; estado: string; transferida?: boolean; agente_destino_id?: number; agente_origen_id?: number }) => {
      // Si se cerró, quitar de la lista y deseleccionar
      if (data.estado === 'CERRADA') {
        setConversaciones((prev) => prev.filter((c) => c.id_conversacion !== data.id_conversacion))
        setConversacionSeleccionada((prev) =>
          prev?.id_conversacion === data.id_conversacion ? null : prev
        )
        return
      }
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
    const onNewActivity = (_data: { id_conversacion: number }) => {
      cargarConversaciones()
    }
    // Actividad global en el CRM: refrescar lista y, si el mensaje es de la conversación abierta, refrescar sus mensajes (por si new_message no llegó)
    let crmActivityTimer: ReturnType<typeof setTimeout> | null = null
    const onCrmActivity = (data: { id_conversacion?: number }) => {
      const idConv = data?.id_conversacion != null ? Number(data.id_conversacion) : null
      if (idConv !== null && conversacionSeleccionadaIdRef.current === idConv) {
        obtenerConversacion(idConv).then((actualizada) => {
          setConversacionSeleccionada(actualizada)
        }).catch(() => {})
      }
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

  // Emitir "está escribiendo" + texto al widget para que el contacto vea qué está escribiendo el agente
  useEffect(() => {
    if (!socket || !conversacionSeleccionada || !nuevoMensaje.trim()) return
    const t = setTimeout(() => {
      socket.emit('typing', {
        conversacionId: conversacionSeleccionada.id_conversacion,
        quien: 'agente',
        username: usuarioAgente?.username,
        texto: nuevoMensaje.trim(),
      })
    }, 400)
    return () => clearTimeout(t)
  }, [socket, conversacionSeleccionada?.id_conversacion, nuevoMensaje, usuarioAgente?.username])

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
      const { conversaciones: lista } = await listarConversaciones()
      setConversaciones(lista)
      // Seleccionar la primera de la cola (orden por primer mensaje) para seguir en turno
      if (lista?.length) {
        cargarConversacion(lista[0].id_conversacion)
      }
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
      const { conversaciones: lista } = await listarConversaciones()
      setConversaciones(lista)
      // Seleccionar la primera de la cola (orden por primer mensaje) para seguir en turno
      if (lista?.length) {
        cargarConversacion(lista[0].id_conversacion)
      }
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

      // Reemplazar el mensaje temporal con el real; si el backend envió presentación automática, mostrarla antes
      const data = resp as {
        mensaje?: { id_mensaje: number; creado_en: string; contenido?: string; [k: string]: unknown }
        mensajePresentacion?: { id_mensaje: number; creado_en: string; contenido: string; tipo_emisor: string; [k: string]: unknown }
      }
      const mensajeReal = data.mensaje
      const mensajePresentacion = data.mensajePresentacion
      if (mensajeReal) {
        setConversacionSeleccionada((prev) => {
          if (!prev) return prev
          const sinTemp = (prev.mensajes || []).filter((m) => (m as { id_mensaje?: unknown }).id_mensaje !== tempId)
          if (mensajePresentacion && typeof mensajeReal.contenido === 'string') {
            const intro = {
              id_mensaje: mensajePresentacion.id_mensaje,
              tipo_emisor: 'AGENTE',
              contenido: String(mensajePresentacion.contenido ?? ''),
              creado_en: mensajePresentacion.creado_en,
              agente_username: (mensajePresentacion as { agente_username?: string }).agente_username,
              agente_nombre_completo: (mensajePresentacion as { agente_nombre_completo?: string | null }).agente_nombre_completo ?? null,
            }
            const real = {
              id_mensaje: mensajeReal.id_mensaje,
              tipo_emisor: 'AGENTE',
              contenido: mensajeReal.contenido,
              creado_en: mensajeReal.creado_en,
              agente_username: (mensajeReal as { agente_username?: string }).agente_username,
              agente_nombre_completo: (mensajeReal as { agente_nombre_completo?: string | null }).agente_nombre_completo ?? null,
            }
            return { ...prev, mensajes: [...sinTemp, intro, real] }
          }
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
  const formatearFechaLlegada = (fecha: string) => {
    const d = new Date(fecha)
    return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const handleCancelarEdicionMensaje = () => {
    setMensajeEditandoId(null)
    setMensajeEditandoTexto('')
    setMensajeEditandoPreview(null)
  }
  const abrirModalEditar = (idMensaje: number, contenido: string, creadoEn?: string) => {
    setContextMenuMensaje(null)
    setMensajeEditandoId(idMensaje)
    setMensajeEditandoTexto(contenido)
    setMensajeEditandoPreview({ contenido, creado_en: creadoEn || '' })
  }
  const handleGuardarEdicionMensaje = async () => {
    if (mensajeEditandoId == null || !mensajeEditandoTexto.trim()) return
    setEditandoMensaje(true)
    try {
      await editarMensajeContacto(mensajeEditandoId, mensajeEditandoTexto.trim())
      setConversacionSeleccionada((prev) => {
        if (!prev) return prev
        const mensajes = (prev.mensajes || []).map((m) =>
          m.id_mensaje === mensajeEditandoId ? { ...m, contenido: mensajeEditandoTexto.trim() } : m
        )
        return { ...prev, mensajes }
      })
      setMensajeEditandoId(null)
      setMensajeEditandoTexto('')
      setMensajeEditandoPreview(null)
    } catch (e: any) {
      console.error('Error al editar mensaje:', e)
      alert(e?.message || 'No se pudo editar el mensaje')
    } finally {
      setEditandoMensaje(false)
    }
  }
  const handleEliminarMensaje = async (id: number) => {
    if (!window.confirm('¿Eliminar este mensaje?')) return
    try {
      await eliminarMensajeContacto(id)
      setContextMenuMensaje(null)
      setConversacionSeleccionada((prev) => {
        if (!prev) return prev
        const idNum = Number(id)
        const mensajes = (prev.mensajes || []).filter((m) => Number(m.id_mensaje) !== idNum)
        return { ...prev, mensajes }
      })
    } catch (e: any) {
      console.error('Error al eliminar mensaje:', e)
      alert(e?.message || 'No se pudo eliminar el mensaje')
    }
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
          {((): { id: RolCRM; label: string }[] => {
            const vistas = usuarioAgente?.vistas_permitidas
            // Si el usuario tiene vistas parametrizadas (array no vacío), usarlas para los tabs
            if (Array.isArray(vistas) && vistas.length > 0) {
              return TODOS_LOS_TABS.filter((t) => vistas.includes(t.id))
            }
            // Si no, usar lógica por rol
            const rolUsuario = usuarioAgente?.rol || 'ASESOR'
            const permitidos = TABS_POR_ROL[rolUsuario] || TABS_POR_ROL['ASESOR']
            return TODOS_LOS_TABS.filter((t) => permitidos.includes(t.id))
          })().map((r) => (
              <button
                key={r.id}
                className={`crm-tab ${rolActivo === r.id ? 'crm-tab--active' : ''}`}
                onClick={() => {
                  if (r.id === 'admin_faq') {
                    window.open('http://localhost:3008/', '_blank')
                    return
                  }
                  setRolActivo(r.id)
                }}
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
          <AdminPortal socket={socket} vistasPermitidas={usuarioAgente?.vistas_permitidas ?? undefined} />
        ) : rolActivo === 'historial' ? (
          <HistorialConversaciones />
        ) : rolActivo === 'seguimiento_bot' ? (
          <SeguimientoBotConversaciones />
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
                  {(c as any).canal === 'TELEGRAM' && (
                    <span className="crm-conversacion-canal crm-conversacion-canal--telegram" title="Canal Telegram">Telegram</span>
                  )}
                  {c.empresa_nit ? (
                    <span className="crm-conversacion-nit">NIT: {c.empresa_nit}</span>
                  ) : null}
                  <span className="crm-conversacion-empresa crm-conversacion-empresa--truncar" title={c.empresa_nombre || ''}>
                    {c.empresa_nombre || 'Empresa'}
                  </span>
                  <span className="crm-conversacion-nombre">{c.contacto_nombre || 'Sin nombre'}</span>
                  {(c.primer_mensaje_en || c.creada_en) && (
                    <span className="crm-conversacion-llegada" title="Fecha y hora">
                      {formatearFechaLlegada(c.primer_mensaje_en || c.creada_en!)}
                    </span>
                  )}
                  {(c.contacto_email || c.contacto_telefono) && (
                    <span className="crm-conversacion-contacto">
                      {[c.contacto_email, c.contacto_telefono].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  <span className="crm-conversacion-estado">
                    {c.estado === 'EN_COLA' ? (
                      <span className="crm-conversacion-estado--queue">En cola</span>
                    ) : c.estado === 'ASIGNADA' ? (
                      <> <span className="crm-conversacion-estado--assigned">Asignada</span> — {nombreCorto((c as any).agente_nombre_completo, c.agente_username)} </>
                    ) : c.estado === 'ACTIVA' ? (
                      <> <span className="crm-conversacion-estado--active">Activa</span> — {nombreCorto((c as any).agente_nombre_completo, c.agente_username)} </>
                    ) : c.estado === 'CERRADA' ? (
                      <span className="crm-conversacion-estado--cerrada">Cerrada</span>
                    ) : (
                      c.estado
                    )}
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
                  <h3>
                    {conversacionSeleccionada.contacto_nombre || 'Contacto'}
                    {(conversacionSeleccionada as any).canal === 'TELEGRAM' && (
                      <span className="crm-chat-canal crm-chat-canal--telegram" title="Conversación por Telegram"> · Telegram</span>
                    )}
                  </h3>
                  <span className="crm-chat-meta crm-chat-meta-empresa">
                    Empresa: {conversacionSeleccionada.empresa_nombre || '—'} {conversacionSeleccionada.empresa_nit ? `(NIT: ${conversacionSeleccionada.empresa_nit})` : ''}
                  </span>
                  <span className="crm-chat-meta">
                    {conversacionSeleccionada.contacto_email && `${conversacionSeleccionada.contacto_email} · `}
                    {conversacionSeleccionada.contacto_telefono && `${conversacionSeleccionada.contacto_telefono} · `}
                    {conversacionSeleccionada.estado === 'EN_COLA' ? (
                      <span className="crm-conversacion-estado--queue">En cola — toma la conversación para chatear</span>
                    ) : (
                      <>
                        <span className={
                          conversacionSeleccionada.estado === 'CERRADA' ? 'crm-conversacion-estado--cerrada' :
                          conversacionSeleccionada.estado === 'ASIGNADA' ? 'crm-conversacion-estado--assigned' :
                          conversacionSeleccionada.estado === 'ACTIVA' ? 'crm-conversacion-estado--active' : ''
                        }>{labelEstado(conversacionSeleccionada.estado)}</span>
                      </>
                    )}
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
                {(conversacionSeleccionada.mensajes || []).map((m) => {
                  const idNum = idMensajeNumerico((m as { id_mensaje?: number | string }).id_mensaje)
                  const tipo = String((m as { tipo_emisor?: string }).tipo_emisor || '').toUpperCase()
                  const esAgenteConMenu =
                    tipo === 'AGENTE' &&
                    idNum != null &&
                    Number((m as { usuario_id?: number }).usuario_id) === Number(usuarioAgente?.id_usuario)
                  const esConMenu = esAgenteConMenu
                  return (
                    <div
                      key={typeof m.id_mensaje !== 'undefined' ? String(m.id_mensaje) : `msg-${m.creado_en}`}
                      className={`crm-mensaje crm-mensaje--${tipo.toLowerCase()} ${esConMenu ? 'crm-mensaje--acciones' : ''}`}
                    >
                      <div
                        className="crm-mensaje-burbuja"
                        onClick={esConMenu ? (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setContextMenuMensaje({
                            idMensaje: idNum!,
                            contenido: m.contenido,
                            creado_en: m.creado_en,
                            top: rect.bottom + 4,
                            left: rect.left,
                          })
                        } : undefined}
                        role={esConMenu ? 'button' : undefined}
                        aria-label={esConMenu ? 'Opciones del mensaje' : undefined}
                        title={esConMenu ? 'Clic para editar o eliminar' : undefined}
                      >
                        <span className="crm-mensaje-contenido">{m.contenido}</span>
                        <span className="crm-mensaje-meta">
                          {esConMenu && <span className="crm-mensaje-flecha" aria-hidden>▼</span>}
                          <span className="crm-mensaje-hora">{formatearFecha(m.creado_en)}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
                {contactoEscribiendo && (
                  <div className="crm-mensaje crm-mensaje--contacto crm-mensaje-typing" title="Vista previa en vivo — lo que el contacto escribe antes de enviar">
                    <div className="crm-mensaje-burbuja crm-mensaje-burbuja--live-preview">
                      <span className="crm-mensaje-peek-label">Vista previa en vivo — escribiendo ahora:</span>
                      <span className="crm-mensaje-peek">{contactoEscribiendo}</span>
                      {contactoEscribiendo !== 'escribiendo...' && (
                        <span className="crm-mensaje-peek-cursor" aria-hidden>|</span>
                      )}
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

              {/* Menú contextual (igual que widget: clic en mensaje, menú oscuro con iconos) */}
              {contextMenuMensaje && (
                <>
                  <div className="crm-menu-mensaje-backdrop" onClick={() => setContextMenuMensaje(null)} aria-hidden="true" />
                  <div
                    ref={contextMenuRef}
                    className="crm-menu-mensaje"
                    role="menu"
                    aria-label="Opciones del mensaje"
                    style={{ top: contextMenuMensaje.top, left: contextMenuMensaje.left }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-menu-mensaje-item crm-menu-mensaje-item--editar"
                      onClick={() => abrirModalEditar(contextMenuMensaje.idMensaje, contextMenuMensaje.contenido, contextMenuMensaje.creado_en)}
                      disabled={!isMensajeEditable(contextMenuMensaje.creado_en)}
                      title="Editar mensaje"
                    >
                      <svg className="crm-menu-mensaje-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Editar
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="crm-menu-mensaje-item crm-menu-mensaje-item--eliminar"
                      onClick={() => {
                        setContextMenuMensaje(null)
                        handleEliminarMensaje(contextMenuMensaje.idMensaje)
                      }}
                      disabled={!isMensajeEditable(contextMenuMensaje.creado_en)}
                      title="Eliminar mensaje"
                    >
                      <svg className="crm-menu-mensaje-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Eliminar
                    </button>
                  </div>
                </>
              )}

              {/* Modal pequeño para editar mensaje (muestra: preview del mensaje + campo para el cambio) */}
              {mensajeEditandoId != null && (
                <div className="crm-modal-overlay" onClick={() => !editandoMensaje && handleCancelarEdicionMensaje()}>
                  <div className="crm-modal crm-modal-editar-mensaje" onClick={(e) => e.stopPropagation()}>
                    <div className="crm-modal-editar-header">
                      <h3>Edita el mensaje</h3>
                      <button type="button" className="crm-modal-editar-cerrar" onClick={handleCancelarEdicionMensaje} disabled={editandoMensaje} aria-label="Cerrar">
                        ×
                      </button>
                    </div>
                    <div className="crm-modal-editar-preview">
                      <div className="crm-mensaje-burbuja crm-mensaje-burbuja--preview">
                        <span className="crm-mensaje-contenido">{mensajeEditandoPreview?.contenido ?? mensajeEditandoTexto}</span>
                        <span className="crm-mensaje-hora">{mensajeEditandoPreview?.creado_en ? formatearFecha(mensajeEditandoPreview.creado_en) : ''}</span>
                      </div>
                    </div>
                    <label className="crm-modal-editar-label">Escribe un mensaje</label>
                    <textarea
                      value={mensajeEditandoTexto}
                      onChange={(e) => setMensajeEditandoTexto(e.target.value)}
                      rows={2}
                      disabled={editandoMensaje}
                      className="crm-mensaje-editar-input"
                      placeholder="Escribe un mensaje..."
                    />
                    <div className="crm-mensaje-editar-actions">
                      <button type="button" className="crm-btn crm-btn--small crm-btn--secondary" onClick={handleCancelarEdicionMensaje} disabled={editandoMensaje}>
                        Cancelar
                      </button>
                      <button type="button" className="crm-btn crm-btn--small crm-btn--confirm-edit" onClick={handleGuardarEdicionMensaje} disabled={editandoMensaje || !mensajeEditandoTexto.trim()} title="Guardar cambio">
                        <svg className="crm-btn-icon crm-btn-icon--guardar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Guardar
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
