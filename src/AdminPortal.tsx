import { useState, useEffect, useCallback } from 'react'
import type { Socket } from 'socket.io-client'
import {
  listarUsuarios,
  actualizarUsuario,
  cambiarPasswordUsuario,
  desactivarUsuario,
  eliminarUsuarioPermanente,
  register,
  listarEmpresas,
  actualizarEmpresa,
  obtenerDashboardStats,
  obtenerActividadReciente,
  obtenerConversacionesActivas,
  obtenerConversacionesBot,
  obtenerHistorialTransferencias,
} from './services/api'
import type {
  UsuarioSoporte,
  Empresa,
  DashboardStats,
  ActividadReciente,
  ConversacionActiva,
  ConversacionBot,
  Transferencia,
} from './services/api'
import './AdminPortal.css'

type SeccionAdmin = 'dashboard' | 'dashboard-bot' | 'transferencias' | 'usuarios' | 'empresas'

/** Primer nombre + primer apellido. Ej: "Eduardo Antonio Bustamante García" → "Eduardo Bustamante" */
function nombreCorto(nombreCompleto?: string | null | undefined, fallback?: string | null): string {
  if (!nombreCompleto?.trim()) return fallback || '—'
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length <= 2) return nombreCompleto.trim()
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`
  return `${partes[0]} ${partes[2]}`
}

const ROLES_DISPONIBLES = ['ADMIN', 'ASESOR', 'SUPERVISOR', 'VENTAS', 'AGENTE']
const TIPOS_DOCUMENTO = ['CC', 'CE', 'NIT', 'TI', 'PP']

// =============================
// Dashboard
// =============================
// Formatea segundos a "Xh Xm Xs"
function formatTiempo(segundos: number): string {
  if (segundos < 0) segundos = 0
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = segundos % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Color de alerta por tiempo: verde < 10m, amarillo < 30m, rojo >= 30m
function colorTiempo(segundos: number): string {
  if (segundos < 600) return 'green'
  if (segundos < 1800) return 'yellow'
  return 'red'
}

function DashboardSection() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [actividad, setActividad] = useState<ActividadReciente[]>([])
  const [activas, setActivas] = useState<ConversacionActiva[]>([])
  const [cargando, setCargando] = useState(true)
  const [tick, setTick] = useState(0) // para actualizar el contador cada segundo

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const [s, a, c] = await Promise.all([
          obtenerDashboardStats(),
          obtenerActividadReciente(),
          obtenerConversacionesActivas(),
        ])
        setStats(s)
        setActividad(a.actividad)
        setActivas(c.conversaciones)
      } catch (e) {
        console.error('Error cargando dashboard:', e)
      } finally {
        setCargando(false)
      }
    }
    cargar()
    // Recargar datos cada 30s
    const interval = setInterval(cargar, 30000)
    return () => clearInterval(interval)
  }, [])

  // Contador en vivo: incrementar cada segundo
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  if (cargando) return <p className="crm-admin-loading">Cargando estadísticas...</p>
  if (!stats) return <p className="crm-admin-loading">Error al cargar datos</p>

  const tarjetas = [
    { label: 'Usuarios', valor: stats.usuarios, icono: '👥', color: 'blue' },
    { label: 'Empresas', valor: stats.empresas, icono: '🏢', color: 'green' },
    { label: 'Contactos', valor: stats.contactos, icono: '📇', color: 'purple' },
    { label: 'Mensajes', valor: stats.mensajes, icono: '💬', color: 'orange' },
    { label: 'Agentes en línea', valor: stats.agentesEnLinea, icono: '🟢', color: 'green' },
    { label: 'Conv. hoy', valor: stats.conversacionesHoy, icono: '📊', color: 'blue' },
  ]

  return (
    <div className="crm-admin-dashboard">
      <div className="crm-admin-cards-grid">
        {tarjetas.map((t) => (
          <div key={t.label} className={`crm-admin-card crm-admin-card--${t.color}`}>
            <span className="crm-admin-card-icono">{t.icono}</span>
            <div className="crm-admin-card-info">
              <span className="crm-admin-card-valor">{t.valor}</span>
              <span className="crm-admin-card-label">{t.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="crm-admin-conv-resumen">
        <h4>Conversaciones</h4>
        <div className="crm-admin-conv-bars">
          <div className="crm-admin-conv-bar">
            <span className="crm-admin-conv-bar-label">En cola</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--queue"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.en_cola / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.en_cola}</span>
          </div>
          <div className="crm-admin-conv-bar">
            <span className="crm-admin-conv-bar-label">Asignadas</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--assigned"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.asignadas / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.asignadas}</span>
          </div>
          <div className="crm-admin-conv-bar">
            <span className="crm-admin-conv-bar-label">Activas</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--active"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.activas / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.activas}</span>
          </div>
          <div className="crm-admin-conv-bar">
            <span className="crm-admin-conv-bar-label">Cerradas</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--closed"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.cerradas / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.cerradas}</span>
          </div>
        </div>
        <p className="crm-admin-conv-total">Total: {stats.conversaciones.total}</p>
      </div>

      {/* Tabla unificada: conversaciones activas + actividad reciente */}
      <div className="crm-admin-activas">
        <h4>Conversaciones</h4>
        {activas.length === 0 && actividad.length === 0 ? (
          <p className="crm-admin-empty">No hay conversaciones registradas</p>
        ) : (
          <div className="crm-admin-table-wrap">
            <table className="crm-admin-table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Empresa</th>
                  <th>Agente</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {activas.map((c) => {
                  const segs = c.segundos_asignada + tick
                  return (
                    <tr key={`activa-${c.id_conversacion}`}>
                      <td className="crm-admin-cell-bold">{c.contacto_nombre || 'Sin nombre'}</td>
                      <td>{c.nombre_empresa || '—'}</td>
                      <td>{nombreCorto(c.agente_nombre_completo, c.agente_username)}</td>
                      <td>
                        <span className={`crm-admin-badge crm-admin-badge--${c.estado === 'ACTIVA' ? 'active' : 'assigned'}`}>
                          {c.estado === 'ACTIVA' ? 'Activa' : 'Asignada'}
                        </span>
                      </td>
                      <td className="crm-admin-cell-fecha">
                        {new Date(c.asignada_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className={`crm-admin-timer crm-admin-timer--${colorTiempo(segs)}`}>
                          {formatTiempo(segs)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {actividad
                  .filter((a) => !activas.some((ac) => ac.id_conversacion === a.id_conversacion))
                  .map((a) => (
                    <tr key={`reciente-${a.id_conversacion}`} className={a.estado === 'CERRADA' ? 'crm-admin-row--inactive' : ''}>
                      <td className="crm-admin-cell-bold">{a.contacto_nombre || 'Sin nombre'}</td>
                      <td>{a.nombre_empresa || '—'}</td>
                      <td>{nombreCorto(a.agente_nombre_completo, a.agente_username)}</td>
                      <td>
                        <span className={`crm-admin-badge crm-admin-badge--${a.estado === 'EN_COLA' ? 'queue' : a.estado === 'ASIGNADA' ? 'assigned' : a.estado === 'ACTIVA' ? 'active' : 'closed'}`}>
                          {a.estado === 'EN_COLA' ? 'En cola' : a.estado === 'ASIGNADA' ? 'Asignada' : a.estado === 'ACTIVA' ? 'Activa' : 'Cerrada'}
                        </span>
                      </td>
                      <td className="crm-admin-cell-fecha">
                        {new Date(a.creada_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="crm-admin-cell-muted">—</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================
// Dashboard Bot (Isa)
// =============================
function BotConversacionesTabla({ conversaciones, tick }: { conversaciones: ConversacionBot[]; tick: number }) {
  const enLinea = conversaciones.filter((c) => c.estado !== 'CERRADA' && (c.segundos_sin_actividad + tick) < 600)
  const inactivas = conversaciones.filter((c) => c.estado !== 'CERRADA' && (c.segundos_sin_actividad + tick) >= 600)
  const cerradas = conversaciones.filter((c) => c.estado === 'CERRADA')

  if (conversaciones.length === 0) {
    return <p className="crm-admin-empty">No hay conversaciones con el bot en este periodo</p>
  }

  return (
    <div className="crm-admin-table-wrap">
      <table className="crm-admin-table">
        <thead>
          <tr>
            <th>Contacto</th>
            <th>Empresa</th>
            <th>Estado</th>
            <th>Mensajes</th>
            <th>Inicio</th>
            <th>Tiempo total</th>
            <th>Última actividad</th>
          </tr>
        </thead>
        <tbody>
          {enLinea.map((c) => {
            const segsTotal = c.segundos_desde_inicio + tick
            const segsInactividad = c.segundos_sin_actividad + tick
            return (
              <tr key={`bot-${c.id_conversacion}`}>
                <td className="crm-admin-cell-bold">{c.contacto_nombre || 'Sin nombre'}</td>
                <td>{c.nombre_empresa || '—'}</td>
                <td><span className="crm-admin-badge crm-admin-badge--bot-online">En línea</span></td>
                <td>
                  <span className="crm-bot-msgs">
                    <span title={`Mensajes del contacto: ${c.total_mensajes_contacto}`}>👤 {c.total_mensajes_contacto}</span>
                    <span title={`Mensajes del bot: ${c.total_mensajes_bot}`}>🤖 {c.total_mensajes_bot}</span>
                  </span>
                </td>
                <td className="crm-admin-cell-fecha">
                  {new Date(c.creada_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td>
                  <span className={`crm-admin-timer crm-admin-timer--${colorTiempo(segsTotal)}`}>{formatTiempo(segsTotal)}</span>
                </td>
                <td><span className="crm-bot-last-activity">hace {formatTiempo(segsInactividad)}</span></td>
              </tr>
            )
          })}
          {inactivas.map((c) => {
            const segsTotal = c.segundos_desde_inicio + tick
            const segsInactividad = c.segundos_sin_actividad + tick
            return (
              <tr key={`bot-${c.id_conversacion}`} className="crm-admin-row--warning">
                <td className="crm-admin-cell-bold">{c.contacto_nombre || 'Sin nombre'}</td>
                <td>{c.nombre_empresa || '—'}</td>
                <td><span className="crm-admin-badge crm-admin-badge--bot-idle">Inactivo</span></td>
                <td>
                  <span className="crm-bot-msgs">
                    <span title={`Mensajes del contacto: ${c.total_mensajes_contacto}`}>👤 {c.total_mensajes_contacto}</span>
                    <span title={`Mensajes del bot: ${c.total_mensajes_bot}`}>🤖 {c.total_mensajes_bot}</span>
                  </span>
                </td>
                <td className="crm-admin-cell-fecha">
                  {new Date(c.creada_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td>
                  <span className={`crm-admin-timer crm-admin-timer--${colorTiempo(segsTotal)}`}>{formatTiempo(segsTotal)}</span>
                </td>
                <td><span className="crm-bot-last-activity crm-bot-last-activity--idle">hace {formatTiempo(segsInactividad)}</span></td>
              </tr>
            )
          })}
          {cerradas.map((c) => (
            <tr key={`bot-${c.id_conversacion}`} className="crm-admin-row--inactive">
              <td className="crm-admin-cell-bold">{c.contacto_nombre || 'Sin nombre'}</td>
              <td>{c.nombre_empresa || '—'}</td>
              <td><span className="crm-admin-badge crm-admin-badge--closed">Cerrada</span></td>
              <td>
                <span className="crm-bot-msgs">
                  <span title={`Mensajes del contacto: ${c.total_mensajes_contacto}`}>👤 {c.total_mensajes_contacto}</span>
                  <span title={`Mensajes del bot: ${c.total_mensajes_bot}`}>🤖 {c.total_mensajes_bot}</span>
                </span>
              </td>
              <td className="crm-admin-cell-fecha">
                {new Date(c.creada_en).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="crm-admin-cell-muted">{formatTiempo(c.segundos_desde_inicio)}</td>
              <td className="crm-admin-cell-muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DashboardBotSection({ socket }: { socket: Socket | null }) {
  const [periodo, setPeriodo] = useState<'24h' | 'todo'>('24h')
  const [conversaciones, setConversaciones] = useState<ConversacionBot[]>([])
  const [resumen, setResumen] = useState<{ total: number; en_linea: number; activas: number; cerradas: number; total_mensajes: number }>({
    total: 0, en_linea: 0, activas: 0, cerradas: 0, total_mensajes: 0
  })
  const [cargando, setCargando] = useState(true)
  const [tick, setTick] = useState(0)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const data = await obtenerConversacionesBot(periodo)
      setResumen(data.resumen)
      setConversaciones(data.conversaciones)
    } catch (e) {
      console.error('Error cargando dashboard bot:', e)
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    cargar()
    const interval = setInterval(cargar, 30000)
    return () => clearInterval(interval)
  }, [cargar])

  // Escuchar eventos WebSocket para actualizar en tiempo real
  useEffect(() => {
    if (!socket) return
    const onBotActivity = () => {
      cargar()
    }
    socket.on('bot_conversation_activity', onBotActivity)
    return () => {
      socket.off('bot_conversation_activity', onBotActivity)
    }
  }, [socket, cargar])

  // Timer en vivo
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const tarjetas = [
    { label: 'Total conversaciones', valor: resumen.total, icono: '🤖', color: 'purple' },
    { label: 'En línea ahora', valor: resumen.en_linea, icono: '🟢', color: 'green' },
    { label: 'Activas', valor: resumen.activas, icono: '🟡', color: 'orange' },
    { label: 'Cerradas', valor: resumen.cerradas, icono: '🔴', color: 'red' },
    { label: 'Total mensajes', valor: resumen.total_mensajes, icono: '💬', color: 'blue' },
  ]

  return (
    <div className="crm-admin-dashboard">
      {/* Selector de periodo */}
      <div className="crm-bot-periodo">
        <button
          className={`crm-bot-periodo-btn ${periodo === '24h' ? 'crm-bot-periodo-btn--active' : ''}`}
          onClick={() => setPeriodo('24h')}
        >
          Últimas 24 horas
        </button>
        <button
          className={`crm-bot-periodo-btn ${periodo === 'todo' ? 'crm-bot-periodo-btn--active' : ''}`}
          onClick={() => setPeriodo('todo')}
        >
          Todo el historial
        </button>
      </div>

      <div className="crm-admin-cards-grid">
        {tarjetas.map((t) => (
          <div key={t.label} className={`crm-admin-card crm-admin-card--${t.color}`}>
            <span className="crm-admin-card-icono">{t.icono}</span>
            <div className="crm-admin-card-info">
              <span className="crm-admin-card-valor">{t.valor}</span>
              <span className="crm-admin-card-label">{t.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="crm-admin-activas">
        <h4>
          Conversaciones con Bot Isa
          <span className="crm-bot-periodo-label">
            {periodo === '24h' ? '— Últimas 24 horas' : '— Todo el historial'}
          </span>
        </h4>
        {cargando ? (
          <p className="crm-admin-loading">Cargando...</p>
        ) : (
          <BotConversacionesTabla conversaciones={conversaciones} tick={tick} />
        )}
      </div>
    </div>
  )
}

// =============================
// Gestión de Usuarios
// =============================
function UsuariosSection() {
  const [usuarios, setUsuarios] = useState<UsuarioSoporte[]>([])
  const [cargando, setCargando] = useState(true)
  const [verTodos, setVerTodos] = useState(true)
  const [modalUsuario, setModalUsuario] = useState<UsuarioSoporte | null>(null)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalPassword, setModalPassword] = useState<UsuarioSoporte | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state para editar
  const [formEdit, setFormEdit] = useState({ username: '', nombre_completo: '', rol: '', nivel: 1, estado: true, tipo_documento: '', documento: '' })
  // Form state para nuevo
  const [formNuevo, setFormNuevo] = useState({ username: '', nombre_completo: '', password: '', rol: 'ASESOR', tipo_documento: '', documento: '' })
  // Form state para password
  const [formPassword, setFormPassword] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { usuarios: lista } = await listarUsuarios(verTodos)
      setUsuarios(lista)
    } catch {
      setError('Error al cargar usuarios')
    } finally {
      setCargando(false)
    }
  }, [verTodos])

  useEffect(() => { cargar() }, [cargar])

  const abrirEditar = (u: UsuarioSoporte) => {
    setFormEdit({
      username: u.username,
      nombre_completo: u.nombre_completo || '',
      rol: u.rol,
      nivel: u.nivel,
      estado: u.estado,
      tipo_documento: u.tipo_documento || '',
      documento: u.documento || '',
    })
    setModalUsuario(u)
  }

  const guardarEditar = async () => {
    if (!modalUsuario) return
    try {
      await actualizarUsuario(modalUsuario.id_usuario, formEdit)
      setModalUsuario(null)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  const crearUsuario = async () => {
    if (!formNuevo.username.trim() || !formNuevo.password.trim()) {
      setError('Username y contraseña son obligatorios')
      return
    }
    if (formNuevo.password.length < 12) {
      setError('La contraseña debe tener al menos 12 caracteres')
      return
    }
    try {
      await register({
        username: formNuevo.username.trim(),
        password: formNuevo.password,
        rol: formNuevo.rol,
        nombre_completo: formNuevo.nombre_completo.trim() || undefined,
        tipo_documento: formNuevo.tipo_documento || undefined,
        documento: formNuevo.documento || undefined,
      })
      setModalNuevo(false)
      setFormNuevo({ username: '', nombre_completo: '', password: '', rol: 'ASESOR', tipo_documento: '', documento: '' })
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear usuario')
    }
  }

  const guardarPassword = async () => {
    if (!modalPassword || !formPassword.trim()) return
    try {
      await cambiarPasswordUsuario(modalPassword.id_usuario, formPassword)
      setModalPassword(null)
      setFormPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar contraseña')
    }
  }

  const eliminarUsuario = async (u: UsuarioSoporte) => {
    if (!confirm(`¿Eliminar PERMANENTEMENTE a "${u.username}"?\n\nEsta acción no se puede deshacer.`)) return
    try {
      await eliminarUsuarioPermanente(u.id_usuario)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  const toggleEstado = async (u: UsuarioSoporte) => {
    if (u.estado) {
      if (!confirm(`¿Desactivar a ${u.username}?`)) return
      try {
        await desactivarUsuario(u.id_usuario)
        cargar()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    } else {
      try {
        await actualizarUsuario(u.id_usuario, { estado: true })
        cargar()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    }
  }

  return (
    <div className="crm-admin-section">
      {error && (
        <div className="crm-admin-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="crm-admin-section-header">
        <h3>Gestión de Usuarios</h3>
        <div className="crm-admin-section-actions">
          <label className="crm-admin-toggle-label">
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            Incluir inactivos
          </label>
          <button className="crm-btn crm-btn--primary" onClick={() => setModalNuevo(true)}>+ Nuevo Usuario</button>
        </div>
      </div>

      {cargando ? (
        <p className="crm-admin-loading">Cargando usuarios...</p>
      ) : usuarios.length === 0 ? (
        <p className="crm-admin-empty">No hay usuarios registrados</p>
      ) : (
        <div className="crm-admin-table-wrap">
          <table className="crm-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Nombre Completo</th>
                <th>Rol</th>
                <th>Nivel</th>
                <th>Estado</th>
                <th>Documento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id_usuario} className={!u.estado ? 'crm-admin-row--inactive' : ''}>
                  <td>{u.id_usuario}</td>
                  <td className="crm-admin-cell-bold">{u.username}</td>
                  <td>{u.nombre_completo || '—'}</td>
                  <td>
                    <span className={`crm-admin-badge crm-admin-badge--role-${u.rol.toLowerCase()}`}>{u.rol}</span>
                  </td>
                  <td>{u.nivel}</td>
                  <td>
                    <span className={`crm-admin-badge ${u.estado ? 'crm-admin-badge--active' : 'crm-admin-badge--inactive'}`}>
                      {u.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{u.tipo_documento && u.documento ? `${u.tipo_documento} ${u.documento}` : '—'}</td>
                  <td>
                    <div className="crm-admin-cell-actions">
                      <button className="crm-admin-btn-icon" onClick={() => abrirEditar(u)} title="Editar">✏️</button>
                      <button className="crm-admin-btn-icon" onClick={() => { setModalPassword(u); setFormPassword('') }} title="Asignar contraseña temporal">🔑</button>
                      <button
                        className={`crm-admin-btn-icon ${u.estado ? 'crm-admin-btn-icon--danger' : 'crm-admin-btn-icon--success'}`}
                        onClick={() => toggleEstado(u)}
                        title={u.estado ? 'Desactivar' : 'Activar'}
                      >
                        {u.estado ? '🚫' : '✅'}
                      </button>
                      <button className="crm-admin-btn-icon crm-admin-btn-icon--danger" onClick={() => eliminarUsuario(u)} title="Eliminar permanentemente">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Editar Usuario */}
      {modalUsuario && (
        <div className="crm-admin-modal-overlay" onClick={() => setModalUsuario(null)}>
          <div className="crm-admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal-header">
              <h3>Editar Usuario</h3>
              <button className="crm-admin-modal-close" onClick={() => setModalUsuario(null)}>✕</button>
            </div>
            <div className="crm-admin-modal-body">
              <div className="crm-admin-field">
                <label>Username (login)</label>
                <input value={formEdit.username} onChange={(e) => setFormEdit({ ...formEdit, username: e.target.value })} />
              </div>
              <div className="crm-admin-field">
                <label>Nombre Completo</label>
                <input value={formEdit.nombre_completo} onChange={(e) => setFormEdit({ ...formEdit, nombre_completo: e.target.value })} placeholder="Nombre y apellidos" />
              </div>
              <div className="crm-admin-field">
                <label>Rol</label>
                <select value={formEdit.rol} onChange={(e) => setFormEdit({ ...formEdit, rol: e.target.value })}>
                  {ROLES_DISPONIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="crm-admin-field-row">
                <div className="crm-admin-field">
                  <label>Nivel</label>
                  <input type="number" min={1} max={10} value={formEdit.nivel} onChange={(e) => setFormEdit({ ...formEdit, nivel: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="crm-admin-field">
                  <label>Estado</label>
                  <select value={String(formEdit.estado)} onChange={(e) => setFormEdit({ ...formEdit, estado: e.target.value === 'true' })}>
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="crm-admin-field-row">
                <div className="crm-admin-field">
                  <label>Tipo documento</label>
                  <select value={formEdit.tipo_documento} onChange={(e) => setFormEdit({ ...formEdit, tipo_documento: e.target.value })}>
                    <option value="">—</option>
                    {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="crm-admin-field">
                  <label>Documento</label>
                  <input value={formEdit.documento} onChange={(e) => setFormEdit({ ...formEdit, documento: e.target.value })} />
                </div>
              </div>
              <div className="crm-admin-modal-footer">
                <button className="crm-btn crm-btn--secondary" onClick={() => setModalUsuario(null)}>Cancelar</button>
                <button className="crm-btn crm-btn--primary" onClick={guardarEditar}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Usuario */}
      {modalNuevo && (
        <div className="crm-admin-modal-overlay" onClick={() => setModalNuevo(false)}>
          <div className="crm-admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal-header">
              <h3>Nuevo Usuario</h3>
              <button className="crm-admin-modal-close" onClick={() => setModalNuevo(false)}>✕</button>
            </div>
            <div className="crm-admin-modal-body">
              <div className="crm-admin-field">
                <label>Username * (para login)</label>
                <input value={formNuevo.username} onChange={(e) => setFormNuevo({ ...formNuevo, username: e.target.value })} placeholder="Usuario para iniciar sesión" />
              </div>
              <div className="crm-admin-field">
                <label>Nombre Completo</label>
                <input value={formNuevo.nombre_completo} onChange={(e) => setFormNuevo({ ...formNuevo, nombre_completo: e.target.value })} placeholder="Nombre y apellidos" />
              </div>
              <div className="crm-admin-field">
                <label>Contraseña * (mín. 12 caracteres)</label>
                <input type="password" value={formNuevo.password} onChange={(e) => setFormNuevo({ ...formNuevo, password: e.target.value })} placeholder="Mínimo 12 caracteres" />
              </div>
              <div className="crm-admin-field">
                <label>Rol</label>
                <select value={formNuevo.rol} onChange={(e) => setFormNuevo({ ...formNuevo, rol: e.target.value })}>
                  {ROLES_DISPONIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="crm-admin-field-row">
                <div className="crm-admin-field">
                  <label>Tipo documento</label>
                  <select value={formNuevo.tipo_documento} onChange={(e) => setFormNuevo({ ...formNuevo, tipo_documento: e.target.value })}>
                    <option value="">—</option>
                    {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="crm-admin-field">
                  <label>Documento</label>
                  <input value={formNuevo.documento} onChange={(e) => setFormNuevo({ ...formNuevo, documento: e.target.value })} />
                </div>
              </div>
              <div className="crm-admin-modal-footer">
                <button className="crm-btn crm-btn--secondary" onClick={() => setModalNuevo(false)}>Cancelar</button>
                <button className="crm-btn crm-btn--primary" onClick={crearUsuario}>Crear</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar Contraseña Temporal */}
      {modalPassword && (
        <div className="crm-admin-modal-overlay" onClick={() => setModalPassword(null)}>
          <div className="crm-admin-modal crm-admin-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal-header">
              <h3>Contraseña temporal para {modalPassword.username}</h3>
              <button className="crm-admin-modal-close" onClick={() => setModalPassword(null)}>✕</button>
            </div>
            <div className="crm-admin-modal-body">
              <div className="crm-admin-info-box">
                Al asignar una contraseña temporal, el usuario deberá cambiarla obligatoriamente cuando inicie sesión.
              </div>
              <div className="crm-admin-field">
                <label>Contraseña temporal</label>
                <input type="text" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Ingrese contraseña temporal" />
              </div>
              <div className="crm-admin-modal-footer">
                <button className="crm-btn crm-btn--secondary" onClick={() => setModalPassword(null)}>Cancelar</button>
                <button className="crm-btn crm-btn--primary" onClick={guardarPassword} disabled={formPassword.length < 4}>Asignar temporal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================
// Gestión de Empresas
// =============================
function EmpresasSection() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalEmpresa, setModalEmpresa] = useState<Empresa | null>(null)
  const [formEdit, setFormEdit] = useState({ nombre_empresa: '', estado: true })
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { empresas: lista } = await listarEmpresas()
      setEmpresas(lista)
    } catch {
      setError('Error al cargar empresas')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const abrirEditar = (emp: Empresa) => {
    setFormEdit({ nombre_empresa: emp.nombre_empresa, estado: emp.estado })
    setModalEmpresa(emp)
  }

  const guardarEditar = async () => {
    if (!modalEmpresa) return
    try {
      await actualizarEmpresa(modalEmpresa.id_empresa, formEdit)
      setModalEmpresa(null)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  return (
    <div className="crm-admin-section">
      {error && (
        <div className="crm-admin-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="crm-admin-section-header">
        <h3>Gestión de Empresas</h3>
      </div>

      {cargando ? (
        <p className="crm-admin-loading">Cargando empresas...</p>
      ) : empresas.length === 0 ? (
        <p className="crm-admin-empty">No hay empresas registradas</p>
      ) : (
        <div className="crm-admin-table-wrap">
          <table className="crm-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>NIT</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((emp) => (
                <tr key={emp.id_empresa} className={!emp.estado ? 'crm-admin-row--inactive' : ''}>
                  <td>{emp.id_empresa}</td>
                  <td className="crm-admin-cell-bold">{emp.nit}</td>
                  <td>{emp.nombre_empresa}</td>
                  <td>
                    <span className={`crm-admin-badge ${emp.estado ? 'crm-admin-badge--active' : 'crm-admin-badge--inactive'}`}>
                      {emp.estado ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>{new Date(emp.creado_en).toLocaleDateString('es-CO')}</td>
                  <td>
                    <button className="crm-admin-btn-icon" onClick={() => abrirEditar(emp)} title="Editar">✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Editar Empresa */}
      {modalEmpresa && (
        <div className="crm-admin-modal-overlay" onClick={() => setModalEmpresa(null)}>
          <div className="crm-admin-modal crm-admin-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal-header">
              <h3>Editar Empresa</h3>
              <button className="crm-admin-modal-close" onClick={() => setModalEmpresa(null)}>✕</button>
            </div>
            <div className="crm-admin-modal-body">
              <div className="crm-admin-field">
                <label>NIT</label>
                <input value={modalEmpresa.nit} disabled />
              </div>
              <div className="crm-admin-field">
                <label>Nombre</label>
                <input value={formEdit.nombre_empresa} onChange={(e) => setFormEdit({ ...formEdit, nombre_empresa: e.target.value })} />
              </div>
              <div className="crm-admin-field">
                <label>Estado</label>
                <select value={String(formEdit.estado)} onChange={(e) => setFormEdit({ ...formEdit, estado: e.target.value === 'true' })}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
              <div className="crm-admin-modal-footer">
                <button className="crm-btn crm-btn--secondary" onClick={() => setModalEmpresa(null)}>Cancelar</button>
                <button className="crm-btn crm-btn--primary" onClick={guardarEditar}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================
// Sección: Historial de Transferencias
// =============================
function TransferenciasSection() {
  const [periodo, setPeriodo] = useState<'24h' | '7d' | '30d' | 'todo'>('24h')
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const data = await obtenerHistorialTransferencias(periodo)
      setTransferencias(data.transferencias)
      setTotal(data.total)
    } catch (e) {
      console.error('Error cargando transferencias:', e)
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    setCargando(true)
    cargar()
    const interval = setInterval(cargar, 30000)
    return () => clearInterval(interval)
  }, [cargar])

  const periodos: { id: '24h' | '7d' | '30d' | 'todo'; label: string }[] = [
    { id: '24h', label: 'Últimas 24h' },
    { id: '7d', label: 'Últimos 7 días' },
    { id: '30d', label: 'Últimos 30 días' },
    { id: 'todo', label: 'Todo el historial' },
  ]

  const formatFecha = (fecha: string) =>
    new Date(fecha).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const badgeEstado = (estado: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      EN_COLA: { cls: 'queue', label: 'En cola' },
      ASIGNADA: { cls: 'assigned', label: 'Asignada' },
      ACTIVA: { cls: 'active', label: 'Activa' },
      CERRADA: { cls: 'closed', label: 'Cerrada' },
    }
    const m = map[estado] || { cls: 'closed', label: estado }
    return <span className={`crm-admin-badge crm-admin-badge--${m.cls}`}>{m.label}</span>
  }

  if (cargando) return <p className="crm-admin-loading">Cargando historial...</p>

  return (
    <div className="crm-admin-dashboard">
      <div className="crm-admin-cards-grid">
        <div className="crm-admin-card crm-admin-card--blue">
          <span className="crm-admin-card-icono">🔄</span>
          <div className="crm-admin-card-info">
            <span className="crm-admin-card-valor">{total}</span>
            <span className="crm-admin-card-label">Transferencias</span>
          </div>
        </div>
      </div>

      <div className="crm-transfer-periodo">
        {periodos.map((p) => (
          <button
            key={p.id}
            className={`crm-transfer-periodo-btn ${periodo === p.id ? 'crm-transfer-periodo-btn--active' : ''}`}
            onClick={() => setPeriodo(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="crm-admin-activas">
        <h4>
          Historial de transferencias
          <span className="crm-bot-periodo-label">
            {periodo === '24h' ? '— Últimas 24 horas'
              : periodo === '7d' ? '— Últimos 7 días'
              : periodo === '30d' ? '— Últimos 30 días'
              : '— Todo el historial'}
          </span>
        </h4>
        {transferencias.length === 0 ? (
          <p className="crm-admin-empty">No hay transferencias en este periodo</p>
        ) : (
          <div className="crm-admin-table-wrap">
            <table className="crm-admin-table">
              <thead>
                <tr>
                  <th>Conv.</th>
                  <th>Contacto</th>
                  <th>Empresa</th>
                  <th>De (Origen)</th>
                  <th>A (Destino)</th>
                  <th>Motivo</th>
                  <th>Estado actual</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {transferencias.map((t) => (
                  <tr key={t.id_asignacion}>
                    <td className="crm-admin-cell-bold">#{t.conversacion_id}</td>
                    <td>{t.contacto_nombre || '—'}</td>
                    <td>{t.nombre_empresa || '—'}</td>
                    <td>
                      <span className="crm-transfer-agent crm-transfer-agent--origen">
                        {nombreCorto(t.origen_nombre_completo, t.origen_username)}
                      </span>
                    </td>
                    <td>
                      <span className="crm-transfer-agent crm-transfer-agent--destino">
                        {nombreCorto(t.destino_nombre_completo, t.destino_username)}
                      </span>
                    </td>
                    <td className="crm-transfer-motivo">{t.razon || '—'}</td>
                    <td>{badgeEstado(t.estado_conversacion)}</td>
                    <td className="crm-admin-cell-fecha">{formatFecha(t.creado_en)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================
// Portal Admin Principal
// =============================
export default function AdminPortal({ socket }: { socket: Socket | null }) {
  const [seccion, setSeccion] = useState<SeccionAdmin>('dashboard')

  const navItems: { id: SeccionAdmin; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'dashboard-bot', label: 'Dashboard Bot', icon: '🤖' },
    { id: 'transferencias', label: 'Transferencias', icon: '🔄' },
    { id: 'usuarios', label: 'Usuarios', icon: '👥' },
    { id: 'empresas', label: 'Empresas', icon: '🏢' },
  ]

  return (
    <div className="crm-admin-portal">
      <nav className="crm-admin-nav">
        <div className="crm-admin-nav-title">Panel Admin</div>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`crm-admin-nav-item ${seccion === item.id ? 'crm-admin-nav-item--active' : ''}`}
            onClick={() => setSeccion(item.id)}
          >
            <span className="crm-admin-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="crm-admin-content">
        {seccion === 'dashboard' && <DashboardSection />}
        {seccion === 'dashboard-bot' && <DashboardBotSection socket={socket} />}
        {seccion === 'transferencias' && <TransferenciasSection />}
        {seccion === 'usuarios' && <UsuariosSection />}
        {seccion === 'empresas' && <EmpresasSection />}
      </div>
    </div>
  )
}
