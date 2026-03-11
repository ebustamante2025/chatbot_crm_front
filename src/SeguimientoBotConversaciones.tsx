import { useState, useEffect, useCallback } from 'react'
import { obtenerConversacionesBot, obtenerConversacion } from './services/api'
import type { ConversacionBot, ConversacionConMensajes } from './services/api'
import './App.css'

function formatearFecha(fecha: string): string {
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function formatearFechaLarga(fecha: string): string {
  return new Date(fecha).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Etiqueta de estado para una conversación bot (En línea / Inactivo / Cerrada) */
function labelEstadoBot(c: ConversacionBot, tick: number): { label: string; className: string } {
  if (c.estado === 'CERRADA') return { label: 'Cerrada', className: 'crm-conversacion-estado--cerrada' }
  const segs = c.segundos_sin_actividad + tick
  if (segs < 600) return { label: 'En línea', className: 'crm-conversacion-estado--active' }
  return { label: 'Inactivo', className: 'crm-conversacion-estado--queue' }
}

export default function SeguimientoBotConversaciones() {
  const [conversaciones, setConversaciones] = useState<ConversacionBot[]>([])
  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<ConversacionConMensajes | null>(null)
  const [cargando, setCargando] = useState(true)
  const [periodo, setPeriodo] = useState<'24h' | 'todo'>('24h')
  const [tick, setTick] = useState(0)

  const cargarLista = useCallback(async () => {
    setCargando(true)
    try {
      const data = await obtenerConversacionesBot(periodo)
      setConversaciones(data.conversaciones)
    } catch (e) {
      console.error('Error cargando conversaciones bot:', e)
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    cargarLista()
  }, [cargarLista])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const cargarConversacion = useCallback(async (id: number) => {
    try {
      const conv = await obtenerConversacion(id)
      setConversacionSeleccionada(conv)
    } catch (e) {
      console.error('Error cargando conversación:', e)
    }
  }, [])

  return (
    <div className="crm-main crm-historial crm-seguimiento-bot">
      <aside className="crm-sidebar">
        <div className="crm-sidebar-header">
          <h2>Seguimiento Bot</h2>
          <button className="crm-btn-refresh" onClick={cargarLista} title="Actualizar">
            ↻
          </button>
        </div>
        <div className="crm-seguimiento-bot-periodo">
          <button
            type="button"
            className={periodo === '24h' ? 'crm-btn-periodo crm-btn-periodo--active' : 'crm-btn-periodo'}
            onClick={() => setPeriodo('24h')}
          >
            24 h
          </button>
          <button
            type="button"
            className={periodo === 'todo' ? 'crm-btn-periodo crm-btn-periodo--active' : 'crm-btn-periodo'}
            onClick={() => setPeriodo('todo')}
          >
            Todo
          </button>
        </div>
        <p className="crm-sidebar-hint">
          Conversaciones con el bot. Selecciona una para ver el historial de mensajes (solo lectura).
        </p>
        <div className="crm-conversaciones-lista">
          {cargando ? (
            <p className="crm-loading">Cargando...</p>
          ) : conversaciones.length === 0 ? (
            <p className="crm-empty">No hay conversaciones del bot en este periodo</p>
          ) : (
            conversaciones.map((c) => {
              const { label, className } = labelEstadoBot(c, tick)
              return (
                <button
                  key={c.id_conversacion}
                  className={`crm-conversacion-item ${
                    conversacionSeleccionada?.id_conversacion === c.id_conversacion ? 'crm-conversacion-item--active' : ''
                  }`}
                  onClick={() => cargarConversacion(c.id_conversacion)}
                >
                  {c.empresa_nit ? (
                    <span className="crm-conversacion-nit">NIT: {c.empresa_nit}</span>
                  ) : null}
                  <span className="crm-conversacion-empresa crm-conversacion-empresa--truncar" title={c.nombre_empresa || ''}>
                    {c.nombre_empresa || 'Empresa'}
                  </span>
                  <span className="crm-conversacion-nombre">{c.contacto_nombre || 'Sin nombre'}</span>
                  <span className="crm-conversacion-llegada" title="Fecha y hora">
                    {formatearFechaLarga(c.ultima_actividad_en || c.creada_en)}
                  </span>
                  <span className="crm-conversacion-estado">
                    <span className={className}>{label}</span>
                    {' · '}
                    🤖 {c.total_mensajes_bot} / 👤 {c.total_mensajes_contacto}
                  </span>
                  {c.contacto_documento && (
                    <span className="crm-conversacion-contacto">Doc: {c.contacto_documento}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className="crm-chat">
        {conversacionSeleccionada ? (
          <>
            <div className="crm-chat-header crm-chat-header--readonly">
              <div>
                <h3>{conversacionSeleccionada.contacto_nombre || 'Contacto'}</h3>
                {conversacionSeleccionada.empresa_nit ? (
                  <span className="crm-chat-meta crm-chat-meta-nit">NIT: {conversacionSeleccionada.empresa_nit}</span>
                ) : null}
                <span className="crm-chat-meta crm-chat-meta-empresa">
                  Empresa: {conversacionSeleccionada.empresa_nombre || '—'}
                </span>
                <span className="crm-chat-meta">
                  {conversacionSeleccionada.contacto_email && `${conversacionSeleccionada.contacto_email} · `}
                  {conversacionSeleccionada.contacto_telefono && `${conversacionSeleccionada.contacto_telefono} · `}
                  Seguimiento bot — solo lectura
                  {(conversacionSeleccionada.ultima_actividad_en || conversacionSeleccionada.creada_en) && (
                    <> — Fecha: {formatearFechaLarga(conversacionSeleccionada.ultima_actividad_en || conversacionSeleccionada.creada_en!)}</>
                  )}
                </span>
              </div>
              <span className="crm-chat-badge-readonly">Solo lectura</span>
            </div>

            <div className="crm-chat-mensajes crm-chat-mensajes--readonly">
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
            </div>

            <div className="crm-chat-input crm-chat-input--disabled">
              <span className="crm-chat-input-hint">
                Vista de seguimiento — no se pueden enviar mensajes desde aquí.
              </span>
            </div>
          </>
        ) : (
          <div className="crm-chat-empty">
            <p>Selecciona una conversación del bot para ver los mensajes</p>
          </div>
        )}
      </section>
    </div>
  )
}
