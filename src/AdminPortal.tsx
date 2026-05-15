import { useState, useEffect, useCallback, useRef } from 'react'
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
  obtenerPoliticaWidgetInactividad,
  guardarPoliticaWidgetInactividad,
  obtenerHorarioAgenteConfig,
  guardarHorarioAgenteConfig,
  listarHorarioAgenteExcepciones,
  guardarHorarioAgenteExcepcion,
  eliminarHorarioAgenteExcepcion,
  obtenerHorarioAgenteEstadoActual,
  obtenerDashboardStats,
  obtenerActividadReciente,
  obtenerConversacionesActivas,
  obtenerConversacionesBot,
  obtenerHistorialTransferencias,
  obtenerMenusWidAdmin,
  actualizarMenuWid,
} from './services/api'
import type {
  UsuarioSoporte,
  Empresa,
  DashboardStats,
  ActividadReciente,
  ConversacionActiva,
  ConversacionBot,
  Transferencia,
  MenuWid,
  WidgetHorarioAgenteConfig,
  WidgetHorarioExcepcion,
} from './services/api'
import './AdminPortal.css'

type SeccionAdmin =
  | 'dashboard'
  | 'dashboard-bot'
  | 'transferencias'
  | 'usuarios'
  | 'empresas'
  | 'widget_horario_agente'
  | 'widget_inactividad'
  | 'menus_widget'

/** Primer nombre + primer apellido. Ej: "Eduardo Antonio Bustamante García" → "Eduardo Bustamante" */
const OPCIONES_FILAS = [5, 10, 20, 50, 100]
const POR_PAGINA_DEFAULT = 10

function Paginacion({
  pagina, total, filasPorPagina, totalRegistros, onChange, onCambiarFilas,
}: {
  pagina: number
  total: number
  filasPorPagina: number
  totalRegistros: number
  onChange: (p: number) => void
  onCambiarFilas: (n: number) => void
}) {
  const rango: (number | '...')[] = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= pagina - 1 && i <= pagina + 1)) {
      rango.push(i)
    } else if (rango[rango.length - 1] !== '...') {
      rango.push('...')
    }
  }
  return (
    <div className="crm-paginacion-footer">
      <div className="crm-paginacion-left">
        <span className="crm-paginacion-info">{totalRegistros} registro{totalRegistros !== 1 ? 's' : ''}</span>
        <label className="crm-paginacion-filas-label">
          Filas:
          <select
            className="crm-paginacion-filas-select"
            value={filasPorPagina}
            onChange={(e) => onCambiarFilas(Number(e.target.value))}
          >
            {OPCIONES_FILAS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      {total > 1 && (
        <div className="crm-paginacion">
          <button className="crm-paginacion-btn" onClick={() => onChange(pagina - 1)} disabled={pagina === 1}>‹</button>
          {rango.map((item, idx) =>
            item === '...'
              ? <span key={`ellipsis-${idx}`} className="crm-paginacion-ellipsis">…</span>
              : <button key={item} className={`crm-paginacion-btn${pagina === item ? ' crm-paginacion-btn--activa' : ''}`} onClick={() => onChange(item)}>{item}</button>
          )}
          <button className="crm-paginacion-btn" onClick={() => onChange(pagina + 1)} disabled={pagina === total}>›</button>
        </div>
      )}
    </div>
  )
}

function nombreCorto(nombreCompleto?: string | null | undefined, fallback?: string | null): string {
  if (!nombreCompleto?.trim()) return fallback || '—'
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length <= 2) return nombreCompleto.trim()
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`
  return `${partes[0]} ${partes[2]}`
}

const ROLES_DISPONIBLES = ['ADMIN', 'ASESOR', 'SUPERVISOR', 'VENTAS', 'AGENTE']

/** Opciones para parametrizar vistas por usuario. Si está vacío, se usa el comportamiento por rol. */
export const OPCIONES_VISTAS: { id: string; label: string; grupo: 'tab' | 'admin' }[] = [
  { id: 'asesor', label: 'Tab Asesor', grupo: 'tab' },
  { id: 'administrador', label: 'Tab Administrador', grupo: 'tab' },
  { id: 'historial', label: 'Tab Historial', grupo: 'tab' },
  { id: 'seguimiento_bot', label: 'Tab Seguimiento Bot', grupo: 'tab' },
  { id: 'admin_faq', label: 'Tab Admin Preg. Frec.', grupo: 'tab' },
  { id: 'dashboard', label: 'Panel Admin — Dashboard', grupo: 'admin' },
  { id: 'dashboard-bot', label: 'Panel Admin — Dashboard Bot', grupo: 'admin' },
  { id: 'transferencias', label: 'Panel Admin — Transferencias', grupo: 'admin' },
  { id: 'usuarios', label: 'Panel Admin — Usuarios', grupo: 'admin' },
  { id: 'empresas', label: 'Panel Admin — Empresas', grupo: 'admin' },
  { id: 'widget_horario_agente', label: 'Panel Admin — Horario agente', grupo: 'admin' },
  { id: 'widget_inactividad', label: 'Panel Admin — Widget inactividad', grupo: 'admin' },
  { id: 'menus_widget', label: 'Panel Admin — Menús Widget', grupo: 'admin' },
]

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
  const [tick, setTick] = useState(0)
  const [paginaConv, setPaginaConv] = useState(1)
  const [filasConv, setFilasConv] = useState(POR_PAGINA_DEFAULT)

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
          <div className="crm-admin-conv-bar crm-admin-conv-bar--queue">
            <span className="crm-admin-conv-bar-label">En cola</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--queue"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.en_cola / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.en_cola}</span>
          </div>
          <div className="crm-admin-conv-bar crm-admin-conv-bar--assigned">
            <span className="crm-admin-conv-bar-label">Asignadas</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--assigned"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.asignadas / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.asignadas}</span>
          </div>
          <div className="crm-admin-conv-bar crm-admin-conv-bar--active">
            <span className="crm-admin-conv-bar-label">Activas</span>
            <div className="crm-admin-conv-bar-track">
              <div
                className="crm-admin-conv-bar-fill crm-admin-conv-bar-fill--active"
                style={{ width: stats.conversaciones.total ? `${(stats.conversaciones.activas / stats.conversaciones.total) * 100}%` : '0%' }}
              />
            </div>
            <span className="crm-admin-conv-bar-value">{stats.conversaciones.activas}</span>
          </div>
          <div className="crm-admin-conv-bar crm-admin-conv-bar--closed">
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
        ) : (() => {
          const actividadFiltrada = actividad.filter((a) => !activas.some((ac) => ac.id_conversacion === a.id_conversacion))
          const totalFilas = activas.length + actividadFiltrada.length
          const totalPags = Math.ceil(totalFilas / filasConv)
          const inicio = (paginaConv - 1) * filasConv
          const fin = inicio + filasConv
          const activasMostrar = activas.slice(Math.max(0, inicio), Math.min(activas.length, fin))
          const offsetAct = Math.max(0, inicio - activas.length)
          const actividadMostrar = actividadFiltrada.slice(offsetAct, offsetAct + Math.max(0, fin - Math.max(inicio, activas.length)))
          return (
            <>
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
                    {activasMostrar.map((c) => {
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
                    {actividadMostrar.map((a) => (
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
                        <td>
                          {a.estado === 'CERRADA' && a.segundos_duracion != null ? (
                            <span className="crm-admin-timer crm-admin-timer--closed" title="Duración total de la conversación">
                              {formatTiempo(a.segundos_duracion)}
                            </span>
                          ) : (
                            <span className="crm-admin-cell-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Paginacion pagina={paginaConv} total={totalPags} filasPorPagina={filasConv} totalRegistros={totalFilas} onChange={setPaginaConv} onCambiarFilas={(n) => { setFilasConv(n); setPaginaConv(1) }} />
            </>
          )
        })()}
      </div>
    </div>
  )
}

// =============================
// Dashboard Bot (Isa)
// =============================
function BotConversacionesTabla({ conversaciones, tick }: { conversaciones: ConversacionBot[]; tick: number }) {
  const [paginaBot, setPaginaBot] = useState(1)
  const [filasBot, setFilasBot] = useState(POR_PAGINA_DEFAULT)
  const totalPagsBot = Math.ceil(conversaciones.length / filasBot)
  const convPag = conversaciones.slice((paginaBot - 1) * filasBot, paginaBot * filasBot)
  const enLinea = convPag.filter((c) => c.estado !== 'CERRADA' && (c.segundos_sin_actividad + tick) < 600)
  const inactivas = convPag.filter((c) => c.estado !== 'CERRADA' && (c.segundos_sin_actividad + tick) >= 600)
  const cerradas = convPag.filter((c) => c.estado === 'CERRADA')

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
              <td>
                <span className="crm-admin-timer crm-admin-timer--closed" title="Duración total">
                  {formatTiempo(c.segundos_desde_inicio)}
                </span>
              </td>
              <td className="crm-admin-cell-muted">—</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Paginacion pagina={paginaBot} total={totalPagsBot} filasPorPagina={filasBot} totalRegistros={conversaciones.length} onChange={setPaginaBot} onCambiarFilas={(n) => { setFilasBot(n); setPaginaBot(1) }} />
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
  /** Errores de validación/API solo del modal Nuevo Usuario (se muestran dentro del modal, no detrás del overlay). */
  const [errorNuevoModal, setErrorNuevoModal] = useState<string | null>(null)
  const [paginaUsuarios, setPaginaUsuarios] = useState(1)
  const [filasUsuarios, setFilasUsuarios] = useState(POR_PAGINA_DEFAULT)

  // Form state para editar
  const [formEdit, setFormEdit] = useState({ username: '', nombre_completo: '', rol: '', estado: true, vistas_permitidas: [] as string[] })
  // Form state para nuevo
  const [formNuevo, setFormNuevo] = useState({ username: '', nombre_completo: '', password: '', rol: 'ASESOR' })
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
      estado: u.estado,
      vistas_permitidas: Array.isArray(u.vistas_permitidas) ? [...u.vistas_permitidas] : [],
    })
    setModalUsuario(u)
  }

  const guardarEditar = async () => {
    if (!modalUsuario) return
    try {
      await actualizarUsuario(modalUsuario.id_usuario, {
        ...formEdit,
        vistas_permitidas: formEdit.vistas_permitidas.length > 0 ? formEdit.vistas_permitidas : null,
      })
      setModalUsuario(null)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  const nuevoUsuarioErrorEnPassword = (msg: string | null) =>
    Boolean(
      msg &&
        /contraseña|12 caract|obligatorios|username|password/i.test(msg)
    )

  const crearUsuario = async () => {
    setError(null)
    if (!formNuevo.username.trim() || !formNuevo.password.trim()) {
      setErrorNuevoModal('Username y contraseña son obligatorios')
      return
    }
    if (formNuevo.password.length < 12) {
      setErrorNuevoModal('La contraseña debe tener al menos 12 caracteres')
      return
    }
    try {
      await register({
        username: formNuevo.username.trim(),
        password: formNuevo.password,
        rol: formNuevo.rol,
        nombre_completo: formNuevo.nombre_completo.trim() || undefined,
      })
      setErrorNuevoModal(null)
      setModalNuevo(false)
      setFormNuevo({ username: '', nombre_completo: '', password: '', rol: 'ASESOR' })
      cargar()
    } catch (e) {
      setErrorNuevoModal(e instanceof Error ? e.message : 'Error al crear usuario')
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
      {/* Con modal Nuevo usuario abierto, ocultar la barra roja global (evita que se vea atenuada detrás del overlay). */}
      {error && !modalNuevo && (
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
          <button
            className="crm-btn crm-btn--primary"
            onClick={() => {
              setError(null)
              setErrorNuevoModal(null)
              setModalNuevo(true)
            }}
          >
            + Nuevo Usuario
          </button>
        </div>
      </div>

      {cargando ? (
        <p className="crm-admin-loading">Cargando usuarios...</p>
      ) : usuarios.length === 0 ? (
        <p className="crm-admin-empty">No hay usuarios registrados</p>
      ) : (() => {
        const totalPagsUsr = Math.ceil(usuarios.length / filasUsuarios)
        const usuariosPag = usuarios.slice((paginaUsuarios - 1) * filasUsuarios, paginaUsuarios * filasUsuarios)
        return (
        <div className="crm-admin-table-wrap">
          <table className="crm-admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Nombre Completo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosPag.map((u) => (
                <tr key={u.id_usuario} className={!u.estado ? 'crm-admin-row--inactive' : ''}>
                  <td>{u.id_usuario}</td>
                  <td className="crm-admin-cell-bold">{u.username}</td>
                  <td>{u.nombre_completo || '—'}</td>
                  <td>
                    <span className={`crm-admin-badge crm-admin-badge--role-${u.rol.toLowerCase()}`}>{u.rol}</span>
                  </td>
                  <td>
                    <span className={`crm-admin-badge ${u.estado ? 'crm-admin-badge--active' : 'crm-admin-badge--inactive'}`}>
                      {u.estado ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
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
          <Paginacion pagina={paginaUsuarios} total={totalPagsUsr} filasPorPagina={filasUsuarios} totalRegistros={usuarios.length} onChange={setPaginaUsuarios} onCambiarFilas={(n) => { setFilasUsuarios(n); setPaginaUsuarios(1) }} />
        </div>
        )
      })()}

      {/* Modal Editar Usuario */}
      {modalUsuario && (
        <div className="crm-admin-modal-overlay" onMouseDown={() => setModalUsuario(null)}>
          <div className="crm-admin-modal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
              <div className="crm-admin-field">
                <label>Estado</label>
                <select value={String(formEdit.estado)} onChange={(e) => setFormEdit({ ...formEdit, estado: e.target.value === 'true' })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
              <div className="crm-admin-field">
                <label>Vistas permitidas (opcional)</label>
                <p className="crm-admin-field-hint">Si deja vacío, se usan los accesos según el rol. Marque solo las vistas que este usuario puede ver.</p>
                <div className="crm-admin-vistas-grid">
                  {OPCIONES_VISTAS.map((opt) => (
                    <label key={opt.id} className="crm-admin-vista-check">
                      <input
                        type="checkbox"
                        checked={formEdit.vistas_permitidas.includes(opt.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...formEdit.vistas_permitidas, opt.id]
                            : formEdit.vistas_permitidas.filter((v) => v !== opt.id)
                          setFormEdit({ ...formEdit, vistas_permitidas: next })
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
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
        <div
          className="crm-admin-modal-overlay"
          onMouseDown={() => {
            setErrorNuevoModal(null)
            setModalNuevo(false)
          }}
        >
          <div className="crm-admin-modal" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal-header">
              <h3>Nuevo Usuario</h3>
              <button
                className="crm-admin-modal-close"
                onClick={() => {
                  setErrorNuevoModal(null)
                  setModalNuevo(false)
                }}
              >
                ✕
              </button>
            </div>
            <div className="crm-admin-modal-body">
              {errorNuevoModal && !nuevoUsuarioErrorEnPassword(errorNuevoModal) && (
                <div className="crm-admin-modal-alert" role="alert">
                  {errorNuevoModal}
                </div>
              )}
              <div className="crm-admin-field">
                <label>Username * (para login)</label>
                <input
                  value={formNuevo.username}
                  onChange={(e) => {
                    setErrorNuevoModal(null)
                    setFormNuevo({ ...formNuevo, username: e.target.value })
                  }}
                  placeholder="Usuario para iniciar sesión"
                />
              </div>
              <div className="crm-admin-field">
                <label>Nombre Completo</label>
                <input value={formNuevo.nombre_completo} onChange={(e) => setFormNuevo({ ...formNuevo, nombre_completo: e.target.value })} placeholder="Nombre y apellidos" />
              </div>
              <div className="crm-admin-field">
                <label>Contraseña * (mín. 12 caracteres)</label>
                <input
                  type="password"
                  value={formNuevo.password}
                  onChange={(e) => {
                    setErrorNuevoModal(null)
                    setFormNuevo({ ...formNuevo, password: e.target.value })
                  }}
                  placeholder="Mínimo 12 caracteres"
                  className={
                    errorNuevoModal?.toLowerCase().includes('contraseña') ||
                    errorNuevoModal?.toLowerCase().includes('obligatorios')
                      ? 'crm-admin-input--error'
                      : undefined
                  }
                  aria-invalid={Boolean(
                    errorNuevoModal?.toLowerCase().includes('contraseña') ||
                      errorNuevoModal?.toLowerCase().includes('obligatorios')
                  )}
                />
                {formNuevo.password.length > 0 && formNuevo.password.length < 12 && (
                  <span className="crm-admin-field-hint crm-admin-field-hint--warn">
                    {formNuevo.password.length}/12 caracteres mínimo
                  </span>
                )}
                {errorNuevoModal && nuevoUsuarioErrorEnPassword(errorNuevoModal) && (
                  <div className="crm-admin-modal-alert crm-admin-modal-alert--inline" role="alert">
                    {errorNuevoModal}
                  </div>
                )}
              </div>
              <div className="crm-admin-field">
                <label>Rol</label>
                <select value={formNuevo.rol} onChange={(e) => setFormNuevo({ ...formNuevo, rol: e.target.value })}>
                  {ROLES_DISPONIBLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="crm-admin-modal-footer">
                <button
                  className="crm-btn crm-btn--secondary"
                  onClick={() => {
                    setErrorNuevoModal(null)
                    setModalNuevo(false)
                  }}
                >
                  Cancelar
                </button>
                <button className="crm-btn crm-btn--primary" onClick={crearUsuario}>
                  Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar Contraseña Temporal */}
      {modalPassword && (
        <div className="crm-admin-modal-overlay" onMouseDown={() => setModalPassword(null)}>
          <div className="crm-admin-modal crm-admin-modal--sm" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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

function sliceTimeHHMM(t: string | null | undefined): string {
  if (!t) return '08:00'
  return String(t).slice(0, 5)
}

const HORARIO_AGENTE_DIA_KEYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const

const HORARIO_AGENTE_DIA_NOMBRE: Record<(typeof HORARIO_AGENTE_DIA_KEYS)[number], string> = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miércoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sábado',
  domingo: 'domingo',
}

/** HH:mm (24 h) → p. ej. 8:00 AM / 5:30 PM (texto para usuarios finales). */
function horaHHMMaAMPM(hhmm: string): string {
  const s = hhmm.trim().slice(0, 5)
  const [hs, ms] = s.split(':')
  const hRaw = Number.parseInt(hs ?? '0', 10)
  const m = (ms ?? '00').slice(0, 2)
  if (!Number.isFinite(hRaw) || hRaw < 0 || hRaw > 23) return `${s} h`
  if (hRaw === 0) return `12:${m} AM`
  if (hRaw < 12) return `${hRaw}:${m} AM`
  if (hRaw === 12) return `12:${m} PM`
  return `${hRaw - 12}:${m} PM`
}

function formatearDiasAtencionHorarioAgente(
  c: Pick<WidgetHorarioAgenteConfig, (typeof HORARIO_AGENTE_DIA_KEYS)[number]>,
): string {
  const activos = HORARIO_AGENTE_DIA_KEYS.map((k, i) => (c[k] ? i : -1)).filter((i) => i >= 0)
  if (activos.length === 0) return 'ningún día (revise la configuración)'
  if (activos.length === 7) return 'todos los días'
  const sorted = [...new Set(activos)].sort((a, b) => a - b)
  if (sorted.length === 1) {
    const k = HORARIO_AGENTE_DIA_KEYS[sorted[0]!]!
    return `los ${HORARIO_AGENTE_DIA_NOMBRE[k]}`
  }
  let i = 1
  while (i < sorted.length && sorted[i] === sorted[i - 1]! + 1) i += 1
  if (i === sorted.length) {
    const k0 = HORARIO_AGENTE_DIA_KEYS[sorted[0]!]!
    const k1 = HORARIO_AGENTE_DIA_KEYS[sorted[sorted.length - 1]!]!
    return `${HORARIO_AGENTE_DIA_NOMBRE[k0]} a ${HORARIO_AGENTE_DIA_NOMBRE[k1]}`
  }
  const labels = sorted.map((idx) => HORARIO_AGENTE_DIA_NOMBRE[HORARIO_AGENTE_DIA_KEYS[idx]!]!)
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`
  const last = labels.pop()!
  return `${labels.join(', ')} y ${last}`
}

/** Texto sugerido para tooltip fuera de horario (alineado al horario general del formulario). */
function construirTooltipFueraHorarioAgente(
  c: Pick<WidgetHorarioAgenteConfig, (typeof HORARIO_AGENTE_DIA_KEYS)[number]>,
  horaInicio: string,
  horaFin: string,
): string {
  const diasTxt = formatearDiasAtencionHorarioAgente(c)
  const hiAm = horaHHMMaAMPM(horaInicio)
  const hfAm = horaHHMMaAMPM(horaFin)
  return `Nos encontramos fuera de horario laboral. Nuestro horario de atención es de ${diasTxt} de ${hiAm} a ${hfAm}.`
}

function WidgetHorarioAgenteSection() {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [config, setConfig] = useState<WidgetHorarioAgenteConfig | null>(null)
  const [horaInicio, setHoraInicio] = useState('08:00')
  const [horaFin, setHoraFin] = useState('17:30')
  const [excepciones, setExcepciones] = useState<WidgetHorarioExcepcion[]>([])
  const [estado, setEstado] = useState<{
    disponible: boolean
    codigo: string
    razon: string
    proximo_resumen: string | null
    es_festivo: boolean
    nombre_festivo: string | null
  } | null>(null)
  const [excFecha, setExcFecha] = useState('')
  const [excTipo, setExcTipo] = useState<'cerrado' | 'horario_especial'>('cerrado')
  const [excHi, setExcHi] = useState('09:00')
  const [excHf, setExcHf] = useState('13:00')
  const [excNota, setExcNota] = useState('')
  /** Último texto generado a partir de días + horas (para saber si el admin sigue el auto o lo personalizó). */
  const prevAutoTooltipRef = useRef('')

  const cargarTodo = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [c, e, es] = await Promise.all([
        obtenerHorarioAgenteConfig(),
        listarHorarioAgenteExcepciones(),
        obtenerHorarioAgenteEstadoActual(),
      ])
      setConfig(c.config)
      const hi0 = sliceTimeHHMM(c.config.hora_inicio)
      const hf0 = sliceTimeHHMM(c.config.hora_fin)
      setHoraInicio(hi0)
      setHoraFin(hf0)
      prevAutoTooltipRef.current = construirTooltipFueraHorarioAgente(c.config, hi0, hf0)
      setExcepciones(e.excepciones)
      setEstado(es)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargarTodo()
    const iv = setInterval(() => {
      obtenerHorarioAgenteEstadoActual()
        .then(setEstado)
        .catch(() => {})
    }, 30000)
    return () => clearInterval(iv)
  }, [cargarTodo])

  useEffect(() => {
    if (!config || cargando) return
    const auto = construirTooltipFueraHorarioAgente(config, horaInicio, horaFin)
    const cur = (config.tooltip_fuera_horario ?? '').trim()
    const prev = prevAutoTooltipRef.current.trim()
    if (cur === prev || cur === '') {
      if (cur !== auto.trim()) {
        setConfig((co) => (co ? { ...co, tooltip_fuera_horario: auto } : null))
      }
    }
    prevAutoTooltipRef.current = auto
  }, [
    cargando,
    config?.lunes,
    config?.martes,
    config?.miercoles,
    config?.jueves,
    config?.viernes,
    config?.sabado,
    config?.domingo,
    horaInicio,
    horaFin,
  ])

  const rellenarTooltipDesdeHorario = () => {
    if (!config) return
    const auto = construirTooltipFueraHorarioAgente(config, horaInicio, horaFin)
    prevAutoTooltipRef.current = auto
    setConfig({ ...config, tooltip_fuera_horario: auto })
  }

  const guardarCfg = async () => {
    if (!config) return
    setGuardando(true)
    setError(null)
    setOkMsg(null)
    try {
      const { config: nc } = await guardarHorarioAgenteConfig({
        lunes: config.lunes,
        martes: config.martes,
        miercoles: config.miercoles,
        jueves: config.jueves,
        viernes: config.viernes,
        sabado: config.sabado,
        domingo: config.domingo,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tooltip_fuera_horario: config.tooltip_fuera_horario ?? '',
        mensaje_fuera_horario: config.mensaje_fuera_horario ?? '',
      })
      setConfig(nc)
      prevAutoTooltipRef.current = construirTooltipFueraHorarioAgente(
        nc,
        sliceTimeHHMM(nc.hora_inicio),
        sliceTimeHHMM(nc.hora_fin),
      )
      setOkMsg('Configuración guardada.')
      setEstado(await obtenerHorarioAgenteEstadoActual())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const agregarExcepcion = async () => {
    if (!excFecha.trim()) {
      setError('Indique la fecha (YYYY-MM-DD)')
      return
    }
    setGuardando(true)
    setError(null)
    setOkMsg(null)
    try {
      const { excepciones: lista } = await guardarHorarioAgenteExcepcion({
        fecha: excFecha.trim().slice(0, 10),
        tipo: excTipo,
        hora_inicio: excTipo === 'horario_especial' ? excHi : null,
        hora_fin: excTipo === 'horario_especial' ? excHf : null,
        nota: excNota.trim() || null,
        activo: true,
      })
      setExcepciones(lista)
      setOkMsg('Novedad guardada.')
      setExcFecha('')
      setExcNota('')
      setEstado(await obtenerHorarioAgenteEstadoActual())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  const borrarExc = async (id: number) => {
    if (!confirm('¿Eliminar esta novedad?')) return
    setGuardando(true)
    try {
      const { excepciones: lista } = await eliminarHorarioAgenteExcepcion(id)
      setExcepciones(lista)
      setEstado(await obtenerHorarioAgenteEstadoActual())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setGuardando(false)
    }
  }

  const toggleDia = (dia: keyof Pick<WidgetHorarioAgenteConfig, 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'>) => {
    setConfig((c) => (c ? { ...c, [dia]: !c[dia] } : c))
  }

  if (cargando || !config) {
    return (
      <div className="crm-admin-horario-page">
        <div className="crm-admin-horario-panel">
          <p className="crm-loading" style={{ margin: 0 }}>Cargando horario del widget…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="crm-admin-horario-page">
      <header>
        <h2 className="crm-admin-horario-page__title">Horario — chatear con agente (Colombia)</h2>
        <p className="crm-admin-horario-page__intro">
          Prioridad: <strong>novedades por fecha</strong> → <strong>festivos Colombia</strong> (Nager) →{' '}
          <strong>horario general</strong>. Zona horaria: <code>{config.zona_horaria}</code>.
        </p>
      </header>

      {error && <div className="crm-admin-error">{error}</div>}
      {okMsg && <div className="crm-admin-info-box">{okMsg}</div>}

      {estado && (
        <div
          className={`crm-admin-horario-status ${estado.disponible ? 'crm-admin-horario-status--ok' : 'crm-admin-horario-status--off'}`}
          role="status"
        >
          <span className="crm-admin-horario-status__dot" aria-hidden />
          <div className="crm-admin-horario-status__body">
            <div className="crm-admin-horario-status__label">Estado en este momento</div>
            <p className="crm-admin-horario-status__title">
              {estado.disponible ? 'Atención con agente disponible' : 'Sin atención con agente'}
            </p>
            <p className="crm-admin-horario-status__razon">{estado.razon}</p>
            {estado.proximo_resumen && (
              <p className="crm-admin-horario-status__proximo">{estado.proximo_resumen}</p>
            )}
          </div>
        </div>
      )}

      <div className="crm-admin-horario-grid">
        <section className="crm-admin-horario-panel" aria-labelledby="horario-general-title">
          <div className="crm-admin-horario-panel__head">
            <h3 id="horario-general-title" className="crm-admin-horario-panel__title">
              Horario general
            </h3>
          </div>

          <div>
            <span className="crm-admin-field-hint" style={{ display: 'block', marginBottom: '0.45rem' }}>
              Días con atención
            </span>
            <div className="crm-admin-horario-dias" role="group" aria-label="Días hábiles">
              {(
                [
                  ['lunes', 'Lun'],
                  ['martes', 'Mar'],
                  ['miercoles', 'Mié'],
                  ['jueves', 'Jue'],
                  ['viernes', 'Vie'],
                  ['sabado', 'Sáb'],
                  ['domingo', 'Dom'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className={`crm-admin-horario-dia${config[k] ? ' crm-admin-horario-dia--on' : ''}`}>
                  <input type="checkbox" checked={Boolean(config[k])} onChange={() => toggleDia(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="crm-admin-horario-times">
            <div className="crm-admin-field">
              <label htmlFor="horario-hi">Hora inicio</label>
              <input id="horario-hi" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            </div>
            <div className="crm-admin-field">
              <label htmlFor="horario-hf">Hora fin</label>
              <input id="horario-hf" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </div>
          </div>

          <div className="crm-admin-field">
            <label htmlFor="horario-tooltip">Tooltip (botón deshabilitado en el widget)</label>
            <p className="crm-admin-field-hint" style={{ margin: '0.35rem 0 0.45rem' }}>
              Se genera a partir de los días y las horas de arriba. Si no lo edita a mano, el texto se
              actualizará solo al cambiar el horario. Si lo personaliza y luego quiere volver al texto
              automático, use «Rellenar desde horario».
            </p>
            <textarea
              id="horario-tooltip"
              rows={2}
              value={config.tooltip_fuera_horario ?? ''}
              onChange={(e) => setConfig({ ...config, tooltip_fuera_horario: e.target.value })}
            />
            <div style={{ marginTop: '0.5rem' }}>
              <button type="button" className="crm-btn crm-btn--secondary" onClick={rellenarTooltipDesdeHorario}>
                Rellenar desde horario
              </button>
            </div>
          </div>
          <div className="crm-admin-field">
            <label htmlFor="horario-msg">Mensaje al usuario (fuera de horario o festivo)</label>
            <textarea
              id="horario-msg"
              rows={5}
              value={config.mensaje_fuera_horario ?? ''}
              onChange={(e) => setConfig({ ...config, mensaje_fuera_horario: e.target.value })}
            />
          </div>

          <div className="crm-admin-horario-panel__footer">
            <button type="button" className="crm-btn crm-btn--primary" onClick={guardarCfg} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar horario general'}
            </button>
          </div>
        </section>

        <section className="crm-admin-horario-panel" aria-labelledby="horario-novedades-title">
          <div className="crm-admin-horario-panel__head">
            <h3 id="horario-novedades-title" className="crm-admin-horario-panel__title">
              Novedades y excepciones
            </h3>
          </div>
          <p className="crm-admin-field-hint" style={{ margin: '-0.25rem 0 0' }}>
            Cierre puntual, inventario o franja distinta un día concreto (tiene prioridad sobre festivos y horario general).
          </p>

          <div className="crm-admin-horario-exc-grid">
            <div className="crm-admin-field">
              <label htmlFor="exc-fecha">Fecha</label>
              <input id="exc-fecha" type="date" value={excFecha} onChange={(e) => setExcFecha(e.target.value)} />
            </div>
            <div className="crm-admin-field">
              <label htmlFor="exc-tipo">Tipo</label>
              <select
                id="exc-tipo"
                value={excTipo}
                onChange={(e) => setExcTipo(e.target.value as 'cerrado' | 'horario_especial')}
              >
                <option value="cerrado">Cerrado (sin servicio)</option>
                <option value="horario_especial">Horario especial</option>
              </select>
            </div>
          </div>

          {excTipo === 'horario_especial' && (
            <div className="crm-admin-horario-times">
              <div className="crm-admin-field">
                <label htmlFor="exc-hi">Desde</label>
                <input id="exc-hi" type="time" value={excHi} onChange={(e) => setExcHi(e.target.value)} />
              </div>
              <div className="crm-admin-field">
                <label htmlFor="exc-hf">Hasta</label>
                <input id="exc-hf" type="time" value={excHf} onChange={(e) => setExcHf(e.target.value)} />
              </div>
            </div>
          )}

          <div className="crm-admin-field">
            <label htmlFor="exc-nota">Nota (opcional)</label>
            <input
              id="exc-nota"
              type="text"
              value={excNota}
              onChange={(e) => setExcNota(e.target.value)}
              placeholder="Ej. Cierre por inventario"
            />
          </div>

          <div className="crm-admin-horario-exc-actions">
            <button type="button" className="crm-btn crm-btn--secondary" onClick={agregarExcepcion} disabled={guardando}>
              Añadir o actualizar novedad
            </button>
          </div>

          {excepciones.length === 0 ? (
            <div className="crm-admin-horario-empty">
              <span className="crm-admin-horario-empty__icon" aria-hidden>
                📅
              </span>
              <p className="crm-admin-horario-empty__text">No hay novedades registradas. Añada una fecha para cerrar el servicio o aplicar un horario distinto.</p>
            </div>
          ) : (
            <div className="crm-admin-horario-table-wrap">
              <table className="crm-admin-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Horario</th>
                    <th>Nota</th>
                    <th style={{ width: '1%' }} />
                  </tr>
                </thead>
                <tbody>
                  {excepciones.map((x) => (
                    <tr key={x.id}>
                      <td>{x.fecha}</td>
                      <td>{x.tipo === 'cerrado' ? 'Cerrado' : 'Horario especial'}</td>
                      <td>{x.tipo === 'horario_especial' ? `${sliceTimeHHMM(x.hora_inicio)} – ${sliceTimeHHMM(x.hora_fin)}` : '—'}</td>
                      <td>{x.nota || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="crm-btn crm-btn--small"
                          onClick={() => borrarExc(x.id)}
                          disabled={guardando}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// =============================
// Widget — inactividad del contacto (solo rol ADMIN en API)
// =============================
function WidgetInactividadSection() {
  const [cargandoPolitica, setCargandoPolitica] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    inactividad_total_minutos: 15,
    numero_avisos_inactividad: 2,
    mensaje_aviso_1: '',
    mensaje_aviso_2: '',
    mensaje_cierre: '',
    activo: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCargandoPolitica(true)
      setError(null)
      setOkMsg(null)
      try {
        const { politica } = await obtenerPoliticaWidgetInactividad()
        if (cancelled) return
        setForm({
          inactividad_total_minutos: politica.inactividad_total_minutos,
          numero_avisos_inactividad:
            typeof politica.numero_avisos_inactividad === 'number' ? politica.numero_avisos_inactividad : 2,
          mensaje_aviso_1: politica.mensaje_aviso_1,
          mensaje_aviso_2: politica.mensaje_aviso_2,
          mensaje_cierre: politica.mensaje_cierre,
          activo: politica.activo,
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar política')
      } finally {
        if (!cancelled) setCargandoPolitica(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    setOkMsg(null)
    try {
      await guardarPoliticaWidgetInactividad(form)
      setOkMsg('Cambios guardados correctamente.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="crm-admin-section">
      {error && (
        <div className="crm-admin-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>✕</button>
        </div>
      )}
      {okMsg && (
        <div className="crm-admin-info-box" style={{ marginBottom: '1rem', color: 'var(--crm-text)' }}>
          {okMsg}
        </div>
      )}

      <div className="crm-admin-section-header">
        <h3>Widget — inactividad del contacto</h3>
        <p className="crm-admin-pregfrecuen-hint" style={{ marginTop: '0.5rem', maxWidth: '52rem' }}>
          Regla <strong>única para todas las empresas</strong>: tiempo total en <strong>minutos</strong> sin que el{' '}
          <strong>contacto</strong> escriba. Indique <strong>cuántos avisos</strong> enviar antes del cierre; el tiempo se
          reparte en <strong>intervalos iguales</strong> (avisos en los hitos intermedios y cierre al final). Con{' '}
          <strong>0 avisos</strong>, solo se aplica el cierre al vencer el plazo. Si hay más de dos avisos, el 1.er usa el
          primer texto y del 2.º en adelante el segundo texto.
        </p>
      </div>

      {cargandoPolitica ? (
        <p className="crm-admin-loading" style={{ marginTop: '1rem' }}>Cargando política...</p>
      ) : (
        <>
            <div className="crm-admin-form-grid" style={{ marginTop: '1.25rem', maxWidth: '40rem' }}>
              <div className="crm-admin-field">
                <label htmlFor="widget-inact-min">Minutos totales hasta cierre</label>
                <input
                  id="widget-inact-min"
                  type="number"
                  min={1}
                  max={1440}
                  value={form.inactividad_total_minutos}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inactividad_total_minutos: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
              </div>
              <div className="crm-admin-field">
                <label htmlFor="widget-inact-n-avisos">Avisos antes del cierre</label>
                <input
                  id="widget-inact-n-avisos"
                  type="number"
                  min={0}
                  max={30}
                  value={form.numero_avisos_inactividad}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const n = Number.isFinite(raw) ? Math.floor(raw) : 0
                    setForm((f) => ({
                      ...f,
                      numero_avisos_inactividad: Math.min(30, Math.max(0, n)),
                    }))
                  }}
                />
                <span className="crm-admin-pregfrecuen-hint" style={{ display: 'block', marginTop: '0.35rem' }}>
                  Número de recordatorios (no incluye el mensaje de cierre). Entre 0 y 30.
                </span>
              </div>
              <div className="crm-admin-field">
                <label>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                  />
                  {' '}Política activa
                </label>
              </div>
              {form.numero_avisos_inactividad >= 1 && (
                <div className="crm-admin-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="widget-inact-m1">Mensaje — 1.er aviso</label>
                  <textarea
                    id="widget-inact-m1"
                    rows={3}
                    value={form.mensaje_aviso_1}
                    onChange={(e) => setForm((f) => ({ ...f, mensaje_aviso_1: e.target.value }))}
                  />
                </div>
              )}
              {form.numero_avisos_inactividad >= 2 && (
                <div className="crm-admin-field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="widget-inact-m2">
                    Mensaje — 2.o aviso{form.numero_avisos_inactividad > 2 ? ` (y siguientes hasta el ${form.numero_avisos_inactividad}.o)` : ''}
                  </label>
                  <textarea
                    id="widget-inact-m2"
                    rows={3}
                    value={form.mensaje_aviso_2}
                    onChange={(e) => setForm((f) => ({ ...f, mensaje_aviso_2: e.target.value }))}
                  />
                </div>
              )}
              <div className="crm-admin-field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="widget-inact-m3">Mensaje — cierre por inactividad</label>
                <textarea
                  id="widget-inact-m3"
                  rows={3}
                  value={form.mensaje_cierre}
                  onChange={(e) => setForm((f) => ({ ...f, mensaje_cierre: e.target.value }))}
                />
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <button type="button" className="crm-btn crm-btn--primary" onClick={guardar} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
        </>
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
  const [paginaEmpresas, setPaginaEmpresas] = useState(1)
  const [filasEmpresas, setFilasEmpresas] = useState(POR_PAGINA_DEFAULT)


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
      ) : (() => {
        const totalPagsEmp = Math.ceil(empresas.length / filasEmpresas)
        const empresasPag = empresas.slice((paginaEmpresas - 1) * filasEmpresas, paginaEmpresas * filasEmpresas)
        return (
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
              {empresasPag.map((emp) => (
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
                    <button className="crm-admin-btn-icon" onClick={() => abrirEditar(emp)} title="Editar empresa">✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Paginacion pagina={paginaEmpresas} total={totalPagsEmp} filasPorPagina={filasEmpresas} totalRegistros={empresas.length} onChange={setPaginaEmpresas} onCambiarFilas={(n) => { setFilasEmpresas(n); setPaginaEmpresas(1) }} />
        </div>
        )
      })()}

      {/* Modal Editar Empresa */}
      {modalEmpresa && (
        <div className="crm-admin-modal-overlay" onMouseDown={() => setModalEmpresa(null)}>
          <div className="crm-admin-modal crm-admin-modal--sm" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
  const [paginaTrans, setPaginaTrans] = useState(1)
  const [filasTrans, setFilasTrans] = useState(POR_PAGINA_DEFAULT)

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
        ) : (() => {
          const totalPagsTrans = Math.ceil(transferencias.length / filasTrans)
          const transPag = transferencias.slice((paginaTrans - 1) * filasTrans, paginaTrans * filasTrans)
          return (
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
                {transPag.map((t) => (
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
            <Paginacion pagina={paginaTrans} total={totalPagsTrans} filasPorPagina={filasTrans} totalRegistros={total} onChange={setPaginaTrans} onCambiarFilas={(n) => { setFilasTrans(n); setPaginaTrans(1) }} />
          </div>
          )
        })()}
      </div>
    </div>
  )
}

// =============================
// Menús del Widget
// =============================
function MenusWidgetSection() {
  const [menus, setMenus] = useState<MenuWid[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardandoMenu, setGuardandoMenu] = useState<number | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  useEffect(() => {
    obtenerMenusWidAdmin()
      .then(({ menus: lista }) => setMenus(lista))
      .catch(() => setError('Error al cargar menús'))
      .finally(() => setCargando(false))
  }, [])

  const toggleMenu = async (menu: MenuWid) => {
    setGuardandoMenu(menu.id)
    setOkMsg(null)
    try {
      const { menu: actualizado } = await actualizarMenuWid(menu.id, { activo: !menu.activo })
      setMenus((prev) => prev.map((m) => m.id === actualizado.id ? actualizado : m))
      setOkMsg(`"${actualizado.nombre}" ${actualizado.activo ? 'activado ✓' : 'ocultado'}`)
    } catch {
      setError('Error al actualizar menú')
    } finally {
      setGuardandoMenu(null)
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
        <h3>Menús del Widget</h3>
      </div>

      <p style={{ fontSize: '0.875rem', color: 'var(--crm-text-muted)', marginBottom: '1rem' }}>
        Activa o desactiva cada opción del menú. Los cambios aplican para todos los usuarios del widget.
      </p>

      {okMsg && (
        <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(74,222,128,0.35)', borderRadius: '0.4rem', color: '#16a34a', fontSize: '0.85rem' }}>
          {okMsg}
        </div>
      )}

      {cargando ? (
        <p className="crm-admin-loading">Cargando menús...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: '480px' }}>
          {menus.map((menu) => (
            <label
              key={menu.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.8rem 1rem',
                borderRadius: '0.5rem',
                background: 'var(--crm-surface-hover)',
                border: `1px solid ${menu.activo ? 'var(--crm-blue-500)' : 'var(--crm-border)'}`,
                cursor: guardandoMenu === menu.id ? 'wait' : 'pointer',
                opacity: guardandoMenu === menu.id ? 0.6 : 1,
                transition: 'border-color 0.2s',
              }}
            >
              <input
                type="checkbox"
                checked={menu.activo}
                disabled={guardandoMenu === menu.id}
                onChange={() => toggleMenu(menu)}
                style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: 'var(--crm-blue-500)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{menu.nombre}</div>
                {menu.descripcion && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--crm-text-muted)' }}>{menu.descripcion}</div>
                )}
              </div>
              <span style={{
                fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '0.3rem', fontWeight: 600,
                background: menu.activo ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.15)',
                color: menu.activo ? 'var(--crm-blue-500)' : 'var(--crm-text-muted)',
              }}>
                {menu.activo ? 'Visible' : 'Oculto'}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================
// Portal Admin Principal
// =============================
const SECCIONES_ADMIN: { id: SeccionAdmin; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'dashboard-bot', label: 'Dashboard Bot', icon: '🤖' },
  { id: 'transferencias', label: 'Transferencias', icon: '🔄' },
  { id: 'usuarios', label: 'Usuarios', icon: '👥' },
  { id: 'empresas', label: 'Empresas', icon: '🏢' },
  { id: 'widget_horario_agente', label: 'Horario agente', icon: '🕐' },
  { id: 'widget_inactividad', label: 'Widget inactividad', icon: '⏱️' },
  { id: 'menus_widget', label: 'Menús Widget', icon: '☰' },
]

export default function AdminPortal({
  socket,
  vistasPermitidas,
  rolUsuario,
}: {
  socket: Socket | null
  vistasPermitidas?: string[] | null
  rolUsuario?: string | null
}) {
  const seccionesDisponibles = SECCIONES_ADMIN.filter(
    (item) =>
      (item.id !== 'widget_inactividad' &&
        item.id !== 'menus_widget' &&
        item.id !== 'widget_horario_agente') ||
      rolUsuario === 'ADMIN',
  )
  // Si hay vistas parametrizadas, filtrar solo secciones permitidas; si no, mostrar todas
  const navItems =
    Array.isArray(vistasPermitidas) && vistasPermitidas.length > 0
      ? seccionesDisponibles.filter((item) => vistasPermitidas.includes(item.id))
      : seccionesDisponibles

  const seccionPorDefecto = navItems[0]?.id ?? 'dashboard'
  const [seccion, setSeccion] = useState<SeccionAdmin>(navItems.some((n) => n.id === 'dashboard') ? 'dashboard' : seccionPorDefecto)

  useEffect(() => {
    if (!navItems.some((n) => n.id === seccion)) setSeccion(seccionPorDefecto)
  }, [navItems, seccionPorDefecto, seccion])

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
        {seccion === 'widget_horario_agente' && <WidgetHorarioAgenteSection />}
        {seccion === 'widget_inactividad' && <WidgetInactividadSection />}
        {seccion === 'menus_widget' && <MenusWidgetSection />}
      </div>
    </div>
  )
}
