import { useState, useEffect, useCallback } from 'react'
import type { FormEvent } from 'react'
import {
  listarTemas,
  crearTema,
  actualizarTema,
  eliminarTema as eliminarTemaApi,
  listarPreguntas,
  crearPregunta,
  actualizarPregunta,
  eliminarPregunta as eliminarPreguntaApi,
} from './services/api'
import type { TemaPreguntas, PreguntaFrecuente } from './services/api'
import './AdminPreguntasFrecuentes.css'

type TabActiva = 'temas' | 'preguntas'

export default function AdminPreguntasFrecuentes() {
  // Estado general
  const [tabActiva, setTabActiva] = useState<TabActiva>('temas')
  const [temas, setTemas] = useState<TemaPreguntas[]>([])
  const [preguntas, setPreguntas] = useState<PreguntaFrecuente[]>([])
  const [cargandoTemas, setCargandoTemas] = useState(false)
  const [cargandoPreguntas, setCargandoPreguntas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Estado tab preguntas
  const [temaSeleccionadoId, setTemaSeleccionadoId] = useState<number | null>(null)

  // Modales
  const [modalTema, setModalTema] = useState(false)
  const [modalPregunta, setModalPregunta] = useState(false)
  const [editandoTema, setEditandoTema] = useState<TemaPreguntas | null>(null)
  const [editandoPregunta, setEditandoPregunta] = useState<PreguntaFrecuente | null>(null)

  // Form tema
  const [formTema, setFormTema] = useState({ nombre: '', descripcion: '', orden: 1, estado: true })
  // Form pregunta
  const [formPregunta, setFormPregunta] = useState({ tema_id: 0, pregunta: '', respuesta: '', orden: 1, estado: true })

  const [guardando, setGuardando] = useState(false)

  // ===== Cargar temas =====
  const cargarTemas = useCallback(async () => {
    setCargandoTemas(true)
    setError(null)
    try {
      const { temas: lista } = await listarTemas()
      setTemas(lista)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar temas')
    } finally {
      setCargandoTemas(false)
    }
  }, [])

  useEffect(() => {
    cargarTemas()
  }, [cargarTemas])

  // ===== Cargar preguntas por tema =====
  const cargarPreguntas = useCallback(async (temaId: number) => {
    setCargandoPreguntas(true)
    setError(null)
    try {
      const { preguntas: lista } = await listarPreguntas(temaId)
      setPreguntas(lista)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar preguntas')
    } finally {
      setCargandoPreguntas(false)
    }
  }, [])

  useEffect(() => {
    if (temaSeleccionadoId) {
      cargarPreguntas(temaSeleccionadoId)
    } else {
      setPreguntas([])
    }
  }, [temaSeleccionadoId, cargarPreguntas])

  // ===== Cambiar tab =====
  const cambiarTab = (tab: TabActiva) => {
    setTabActiva(tab)
    setError(null)
  }

  // ===== TEMAS: Abrir modal =====
  const abrirModalTema = (tema?: TemaPreguntas) => {
    if (tema) {
      setEditandoTema(tema)
      setFormTema({
        nombre: tema.nombre,
        descripcion: tema.descripcion || '',
        orden: tema.orden,
        estado: tema.estado,
      })
    } else {
      setEditandoTema(null)
      setFormTema({ nombre: '', descripcion: '', orden: temas.length + 1, estado: true })
    }
    setModalTema(true)
  }

  const cerrarModalTema = () => {
    setModalTema(false)
    setEditandoTema(null)
  }

  // ===== TEMAS: Guardar =====
  const handleGuardarTema = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      if (editandoTema) {
        await actualizarTema(editandoTema.id, formTema)
      } else {
        await crearTema(formTema)
      }
      cerrarModalTema()
      await cargarTemas()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar tema')
    } finally {
      setGuardando(false)
    }
  }

  // ===== TEMAS: Eliminar =====
  const handleEliminarTema = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este tema? Se eliminarán todas sus preguntas.')) return
    setError(null)
    try {
      await eliminarTemaApi(id)
      if (temaSeleccionadoId === id) {
        setTemaSeleccionadoId(null)
        setPreguntas([])
      }
      await cargarTemas()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar tema')
    }
  }

  // ===== PREGUNTAS: Abrir modal =====
  const abrirModalPregunta = (pregunta?: PreguntaFrecuente) => {
    if (pregunta) {
      setEditandoPregunta(pregunta)
      setFormPregunta({
        tema_id: pregunta.tema_id,
        pregunta: pregunta.pregunta,
        respuesta: pregunta.respuesta,
        orden: pregunta.orden,
        estado: pregunta.estado,
      })
    } else {
      setEditandoPregunta(null)
      setFormPregunta({
        tema_id: temaSeleccionadoId || 0,
        pregunta: '',
        respuesta: '',
        orden: preguntas.length + 1,
        estado: true,
      })
    }
    setModalPregunta(true)
  }

  const cerrarModalPregunta = () => {
    setModalPregunta(false)
    setEditandoPregunta(null)
  }

  // ===== PREGUNTAS: Guardar =====
  const handleGuardarPregunta = async (e: FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      if (editandoPregunta) {
        await actualizarPregunta(editandoPregunta.id, formPregunta)
      } else {
        await crearPregunta(formPregunta)
      }
      cerrarModalPregunta()
      if (temaSeleccionadoId) await cargarPreguntas(temaSeleccionadoId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar pregunta')
    } finally {
      setGuardando(false)
    }
  }

  // ===== PREGUNTAS: Eliminar =====
  const handleEliminarPregunta = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta pregunta?')) return
    setError(null)
    try {
      await eliminarPreguntaApi(id)
      if (temaSeleccionadoId) await cargarPreguntas(temaSeleccionadoId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar pregunta')
    }
  }

  // Nombre del tema seleccionado
  const temaSeleccionadoNombre = temas.find((t) => t.id === temaSeleccionadoId)?.nombre || ''

  return (
    <section className="crm-admin-pregfrecuen">
      {/* Header */}
      <div className="crm-admin-pregfrecuen-header">
        <h2>Administración de Preguntas Frecuentes</h2>
        <p className="crm-admin-pregfrecuen-hint">
          Gestiona los temas y preguntas frecuentes que se muestran en el portal de preguntas frecuntes.
        </p>
      </div>

      {/* Error global */}
      {error && (
        <div className="crm-faq-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="crm-faq-tabs">
        <button
          className={`crm-faq-tab ${tabActiva === 'temas' ? 'crm-faq-tab--active' : ''}`}
          onClick={() => cambiarTab('temas')}
        >
          Servicios ({temas.length})
        </button>
        <button
          className={`crm-faq-tab ${tabActiva === 'preguntas' ? 'crm-faq-tab--active' : ''}`}
          onClick={() => cambiarTab('preguntas')}
        >
          Preguntas
        </button>
      </div>

      {/* Contenido */}
      <div className="crm-faq-content">
        {/* =================== TAB TEMAS =================== */}
        {tabActiva === 'temas' && (
          <div className="crm-faq-panel">
            <div className="crm-faq-panel-header">
              <h3>Gestión de Temas</h3>
              <button className="crm-btn crm-btn--primary" onClick={() => abrirModalTema()}>
                + Nuevo Tema
              </button>
            </div>

            {cargandoTemas ? (
              <p className="crm-faq-loading">Cargando temas...</p>
            ) : temas.length === 0 ? (
              <p className="crm-faq-empty">No hay temas registrados. Crea uno para comenzar.</p>
            ) : (
              <div className="crm-faq-lista">
                {temas.map((tema) => (
                  <div key={tema.id} className="crm-faq-item">
                    <div className="crm-faq-item-info">
                      <div className="crm-faq-item-titulo">
                        <span className="crm-faq-item-nombre">{tema.nombre}</span>
                        <span className="crm-faq-badge crm-faq-badge--blue">Orden: {tema.orden}</span>
                        {!tema.estado && <span className="crm-faq-badge crm-faq-badge--red">Inactivo</span>}
                      </div>
                      {tema.descripcion && <p className="crm-faq-item-desc">{tema.descripcion}</p>}
                    </div>
                    <div className="crm-faq-item-acciones">
                      <button className="crm-faq-btn-icon" onClick={() => abrirModalTema(tema)} title="Editar">
                        ✎
                      </button>
                      <button className="crm-faq-btn-icon crm-faq-btn-icon--danger" onClick={() => handleEliminarTema(tema.id)} title="Eliminar">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================== TAB PREGUNTAS =================== */}
        {tabActiva === 'preguntas' && (
          <div className="crm-faq-panel">
            <div className="crm-faq-select-tema">
              <label>Seleccionar Tema</label>
              <select
                value={temaSeleccionadoId ?? ''}
                onChange={(e) => setTemaSeleccionadoId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">-- Selecciona un tema --</option>
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            {temaSeleccionadoId && (
              <>
                <div className="crm-faq-panel-header">
                  <h3>Preguntas de: <span className="crm-faq-tema-nombre">{temaSeleccionadoNombre}</span></h3>
                  <button className="crm-btn crm-btn--primary" onClick={() => abrirModalPregunta()}>
                    + Nueva Pregunta
                  </button>
                </div>

                {cargandoPreguntas ? (
                  <p className="crm-faq-loading">Cargando preguntas...</p>
                ) : preguntas.length === 0 ? (
                  <p className="crm-faq-empty">No hay preguntas para este tema. Crea una para comenzar.</p>
                ) : (
                  <div className="crm-faq-lista">
                    {preguntas.map((p) => (
                      <div key={p.id} className="crm-faq-item crm-faq-item--pregunta">
                        <div className="crm-faq-item-info">
                          <div className="crm-faq-item-titulo">
                            <span className="crm-faq-badge crm-faq-badge--blue">#{p.orden}</span>
                            {!p.estado && <span className="crm-faq-badge crm-faq-badge--red">Inactivo</span>}
                          </div>
                          <h4 className="crm-faq-pregunta-texto">{p.pregunta}</h4>
                          <p className="crm-faq-respuesta-preview">{p.respuesta}</p>
                        </div>
                        <div className="crm-faq-item-acciones">
                          <button className="crm-faq-btn-icon" onClick={() => abrirModalPregunta(p)} title="Editar">
                            ✎
                          </button>
                          <button className="crm-faq-btn-icon crm-faq-btn-icon--danger" onClick={() => handleEliminarPregunta(p.id)} title="Eliminar">
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* =================== MODAL TEMA =================== */}
      {modalTema && (
        <div className="crm-faq-modal-overlay" onClick={cerrarModalTema}>
          <div className="crm-faq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-faq-modal-header">
              <h3>{editandoTema ? 'Editar Tema' : 'Nuevo Tema'}</h3>
              <button type="button" className="crm-faq-modal-close" onClick={cerrarModalTema}>✕</button>
            </div>
            <form onSubmit={handleGuardarTema} className="crm-faq-modal-body">
              <div className="crm-faq-field">
                <label>Nombre del Tema *</label>
                <input
                  type="text"
                  required
                  value={formTema.nombre}
                  onChange={(e) => setFormTema({ ...formTema, nombre: e.target.value })}
                  placeholder="Ej: Ingresa Tema"
                />
              </div>
              <div className="crm-faq-field">
                <label>Descripción</label>
                <textarea
                  rows={6}
                  value={formTema.descripcion}
                  onChange={(e) => setFormTema({ ...formTema, descripcion: e.target.value })}
                  placeholder="Breve descripción del tema"
                />
              </div>
              <div className="crm-faq-field-row">
                <div className="crm-faq-field">
                  <label>Orden</label>
                  <input
                    type="number"
                    min={1}
                    value={formTema.orden}
                    onChange={(e) => setFormTema({ ...formTema, orden: Number(e.target.value) })}
                  />
                </div>
                <div className="crm-faq-field">
                  <label>Estado</label>
                  <select
                    value={formTema.estado ? 'true' : 'false'}
                    onChange={(e) => setFormTema({ ...formTema, estado: e.target.value === 'true' })}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="crm-faq-modal-footer">
                <button type="button" className="crm-btn crm-btn--secondary" onClick={cerrarModalTema}>
                  Cancelar
                </button>
                <button type="submit" className="crm-btn crm-btn--primary" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================== MODAL PREGUNTA =================== */}
      {modalPregunta && (
        <div className="crm-faq-modal-overlay" onClick={cerrarModalPregunta}>
          <div className="crm-faq-modal crm-faq-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-faq-modal-header">
              <h3>{editandoPregunta ? 'Editar Pregunta' : 'Nueva Pregunta'}</h3>
              <button type="button" className="crm-faq-modal-close" onClick={cerrarModalPregunta}>✕</button>
            </div>
            <form onSubmit={handleGuardarPregunta} className="crm-faq-modal-body">
              <div className="crm-faq-field">
                <label>Tema *</label>
                <select
                  required
                  value={formPregunta.tema_id || ''}
                  onChange={(e) => setFormPregunta({ ...formPregunta, tema_id: Number(e.target.value) })}
                >
                  <option value="">-- Selecciona un tema --</option>
                  {temas.map((t) => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="crm-faq-field">
                <label>Pregunta *</label>
                <input
                  type="text"
                  required
                  value={formPregunta.pregunta}
                  onChange={(e) => setFormPregunta({ ...formPregunta, pregunta: e.target.value })}
                  placeholder="¿Qué es un accidente de trabajo?"
                />
              </div>
              <div className="crm-faq-field">
                <label>Respuesta *</label>
                <textarea
                  required
                  rows={8}
                  value={formPregunta.respuesta}
                  onChange={(e) => setFormPregunta({ ...formPregunta, respuesta: e.target.value })}
                  placeholder="Escribe la respuesta completa aquí..."
                />
              </div>
              <div className="crm-faq-field-row">
                <div className="crm-faq-field">
                  <label>Orden</label>
                  <input
                    type="number"
                    min={1}
                    value={formPregunta.orden}
                    onChange={(e) => setFormPregunta({ ...formPregunta, orden: Number(e.target.value) })}
                  />
                </div>
                <div className="crm-faq-field">
                  <label>Estado</label>
                  <select
                    value={formPregunta.estado ? 'true' : 'false'}
                    onChange={(e) => setFormPregunta({ ...formPregunta, estado: e.target.value === 'true' })}
                  >
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="crm-faq-modal-footer">
                <button type="button" className="crm-btn crm-btn--secondary" onClick={cerrarModalPregunta}>
                  Cancelar
                </button>
                <button type="submit" className="crm-btn crm-btn--primary" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
