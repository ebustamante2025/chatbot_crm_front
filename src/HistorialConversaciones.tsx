import { useState, useEffect, useCallback } from 'react'
import { listarHistorialCerradas, obtenerHistorialContacto } from './services/api'
import type { HistorialCerradaItem, HistorialContactoResponse } from './services/api'
import './App.css'

function nombreCorto(nombreCompleto?: string | null, fallback?: string): string {
  if (!nombreCompleto?.trim()) return fallback || '—'
  const partes = nombreCompleto.trim().split(/\s+/)
  if (partes.length <= 2) return nombreCompleto.trim()
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`
  return `${partes[0]} ${partes[2]}`
}

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

export default function HistorialConversaciones() {
  const [conversaciones, setConversaciones] = useState<HistorialCerradaItem[]>([])
  const [selectedContacto, setSelectedContacto] = useState<{ empresaId: number; contactoId: number } | null>(null)
  const [historialData, setHistorialData] = useState<HistorialContactoResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const cargarLista = useCallback(async () => {
    setCargando(true)
    try {
      const { conversaciones: lista } = await listarHistorialCerradas()
      setConversaciones(lista)
    } catch (e) {
      console.error('Error cargando historial:', e)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarLista()
  }, [cargarLista])

  const seleccionarContacto = useCallback(async (empresaId: number, contactoId: number) => {
    setSelectedContacto({ empresaId, contactoId })
    setCargandoHistorial(true)
    setHistorialData(null)
    try {
      const data = await obtenerHistorialContacto(empresaId, contactoId)
      setHistorialData(data)
    } catch (e) {
      console.error('Error cargando historial del contacto:', e)
    } finally {
      setCargandoHistorial(false)
    }
  }, [])

  return (
    <div className="crm-main crm-historial">
      <aside className="crm-sidebar">
        <div className="crm-sidebar-header">
          <h2>Historial (cerradas)</h2>
          <button className="crm-btn-refresh" onClick={cargarLista} title="Actualizar">
            ↻
          </button>
        </div>
        <p className="crm-sidebar-hint">
          Una entrada por contacto. Selecciona una para ver el historial completo de todas sus conversaciones cerradas (solo lectura).
        </p>
        <div className="crm-conversaciones-lista">
          {cargando ? (
            <p className="crm-loading">Cargando...</p>
          ) : conversaciones.length === 0 ? (
            <p className="crm-empty">No hay conversaciones cerradas</p>
          ) : (
            conversaciones.map((c) => {
              const isActive =
                selectedContacto?.empresaId === c.empresa_id && selectedContacto?.contactoId === c.contacto_id
              return (
                <button
                  key={`${c.empresa_id}-${c.contacto_id}`}
                  className={`crm-conversacion-item ${isActive ? 'crm-conversacion-item--active' : ''}`}
                  onClick={() => seleccionarContacto(c.empresa_id, c.contacto_id)}
                >
                  {c.empresa_nit ? (
                    <span className="crm-conversacion-nit">NIT: {c.empresa_nit}</span>
                  ) : null}
                  <span className="crm-conversacion-empresa crm-conversacion-empresa--truncar" title={c.empresa_nombre || ''}>
                    {c.empresa_nombre || 'Empresa'}
                  </span>
                  <span className="crm-conversacion-nombre">{c.contacto_nombre || 'Sin nombre'}</span>
                  <span className="crm-conversacion-llegada" title="Última conversación cerrada">
                    {(c.cerrada_en || c.ultima_actividad_en || c.creada_en)
                      ? formatearFechaLarga(c.cerrada_en || c.ultima_actividad_en || c.creada_en!)
                      : '—'}
                  </span>
                  <span className="crm-conversacion-estado">
                    <span className="crm-conversacion-estado--cerrada">Cerrada</span> — {nombreCorto(c.agente_nombre_completo, c.agente_username ?? undefined)}
                  </span>
                  {(c.contacto_email || c.contacto_telefono) && (
                    <span className="crm-conversacion-contacto">
                      {[c.contacto_email, c.contacto_telefono].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className="crm-chat">
        {historialData ? (
          <>
            <div className="crm-chat-header crm-chat-header--readonly">
              <div>
                <h3>{historialData.contacto_nombre || 'Contacto'}</h3>
                <span className="crm-chat-meta crm-chat-meta-empresa">
                  Empresa: {historialData.empresa_nombre || '—'}{' '}
                  {historialData.empresa_nit ? `(NIT: ${historialData.empresa_nit})` : ''}
                </span>
                <span className="crm-chat-meta">
                  {historialData.contacto_email && `${historialData.contacto_email} · `}
                  {historialData.contacto_telefono && `${historialData.contacto_telefono} · `}
                  <span className="crm-conversacion-estado--cerrada">Historial completo (solo lectura)</span>
                </span>
              </div>
              <span className="crm-chat-badge-readonly">Solo lectura</span>
            </div>

            <div className="crm-chat-mensajes crm-chat-mensajes--readonly">
              {cargandoHistorial ? (
                <p className="crm-loading">Cargando historial...</p>
              ) : !historialData.mensajes || historialData.mensajes.length === 0 ? (
                <p className="crm-empty">No hay mensajes en el historial de este contacto.</p>
              ) : (
                historialData.mensajes.map((m) => (
                  <div
                    key={typeof m.id_mensaje !== 'undefined' ? String(m.id_mensaje) : `msg-${m.creado_en}`}
                    className={`crm-mensaje crm-mensaje--${(m.tipo_emisor || '').toLowerCase()}`}
                  >
                    <div className="crm-mensaje-burbuja">
                      <span className="crm-mensaje-contenido">{m.contenido}</span>
                      <span className="crm-mensaje-hora">{formatearFecha(m.creado_en)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="crm-chat-input crm-chat-input--disabled">
              <span className="crm-chat-input-hint">Conversación cerrada — no se pueden enviar mensajes.</span>
            </div>
          </>
        ) : (
          <div className="crm-chat-empty">
            <p>Selecciona un contacto del historial para ver todas sus conversaciones cerradas</p>
          </div>
        )}
      </section>
    </div>
  )
}
