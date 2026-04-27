const API_BASE = '/api'

const TOKEN_KEY = 'crm_token'
const USER_KEY = 'crm_user'
const APP_MODE_KEY = 'crm_app_mode'
const DATA_SOURCE_KEY = 'crm_data_source_mode'
const THEME_KEY = 'crm_theme_mode'
const LOCAL_DB_KEY = 'crm_local_db'
const LOCAL_TRANSFER_KEY = 'crm_local_transfers'
const ACTIVE_SOURCE_KEY = 'crm_active_source_mode'

export type DataSourceMode = 'server' | 'local'
export type ThemeMode = 'dark' | 'light'
export type AppMode = 'server-dark' | 'server-light' | 'local-dark' | 'local-light'

export interface StoredUser {
  id_usuario: number
  username: string
  nombre_completo?: string | null
  rol: string
  vistas_permitidas?: string[] | null
}

interface LocalUser extends StoredUser {
  password: string
  estado: boolean
  nivel: number
  tipo_documento: string | null
  documento: string | null
  creado_en: string
}

interface LocalEmpresa {
  id_empresa: number
  nit: string
  nombre_empresa: string
  estado: boolean
  creado_en: string
}

interface LocalMensaje {
  id_mensaje: number
  tipo_emisor: string
  contenido: string
  creado_en: string
  contacto_nombre?: string
  agente_username?: string
  agente_nombre_completo?: string | null
}

interface LocalConversacion {
  id_conversacion: number
  empresa_id: number
  contacto_id: number
  canal: string
  tema: string
  estado: string
  contacto_nombre: string
  contacto_email?: string
  contacto_telefono?: string
  contacto_documento?: string | null
  empresa_nit?: string
  empresa_nombre?: string
  agente_id?: number | null
  agente_username?: string
  agente_nombre_completo?: string | null
  ultima_actividad_en?: string
  cerrada_en?: string
  creada_en?: string
  primer_mensaje_en?: string | null
  mensajes: LocalMensaje[]
}

interface LocalTema {
  id: number
  nombre: string
  descripcion: string | null
  orden: number
  estado: boolean
  created_at: string
  updated_at: string
}

interface LocalPregunta {
  id: number
  tema_id: number
  pregunta: string
  respuesta: string
  orden: number
  estado: boolean
  tema_nombre?: string
  created_at: string
  updated_at: string
}

interface LocalTransferencia {
  id_asignacion: number
  conversacion_id: number
  accion: string
  razon: string | null
  creado_en: string
  destino_usuario_id: number
  destino_username: string | null
  destino_nombre_completo: string | null
  origen_usuario_id: number | null
  origen_username: string | null
  origen_nombre_completo: string | null
  contacto_nombre: string | null
  nombre_empresa: string | null
  estado_conversacion: string
}

interface LocalDb {
  users: LocalUser[]
  empresas: LocalEmpresa[]
  conversaciones: LocalConversacion[]
  temas: LocalTema[]
  preguntas: LocalPregunta[]
}

export function getStoredDataSourceMode(): DataSourceMode {
  if (typeof localStorage === 'undefined') return 'server'
  const active = localStorage.getItem(ACTIVE_SOURCE_KEY)
  if (active === 'server' || active === 'local') return active
  const raw = localStorage.getItem(DATA_SOURCE_KEY)
  if (raw === 'server' || raw === 'local') return raw
  const legacy = localStorage.getItem(APP_MODE_KEY)
  if (legacy === 'local-dark' || legacy === 'local-light') return 'local'
  return 'server'
}

export function setStoredDataSourceMode(mode: DataSourceMode): void {
  localStorage.setItem(DATA_SOURCE_KEY, mode)
  localStorage.setItem(ACTIVE_SOURCE_KEY, mode)
  localStorage.setItem(APP_MODE_KEY, `${mode}-${getStoredThemeMode()}` satisfies AppMode)
}

function setActiveDataSourceMode(mode: DataSourceMode): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ACTIVE_SOURCE_KEY, mode)
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'dark'
  const raw = localStorage.getItem(THEME_KEY)
  if (raw === 'dark' || raw === 'light') return raw
  const legacy = localStorage.getItem(APP_MODE_KEY)
  if (legacy === 'server-light' || legacy === 'local-light') return 'light'
  return 'dark'
}

export function setStoredThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode)
  localStorage.setItem(APP_MODE_KEY, `${getStoredDataSourceMode()}-${mode}` satisfies AppMode)
}

export function getAppMode(): AppMode {
  return `${getStoredDataSourceMode()}-${getStoredThemeMode()}` as AppMode
}

export function setAppMode(mode: AppMode): void {
  const [dataSource, theme] = mode.split('-') as [DataSourceMode, ThemeMode]
  setStoredDataSourceMode(dataSource)
  setStoredThemeMode(theme)
}

export function getDataSourceMode(mode: DataSourceMode | AppMode = getStoredDataSourceMode()): DataSourceMode {
  return mode.startsWith('local') ? 'local' : 'server'
}

export function getThemeMode(mode: ThemeMode | AppMode = getStoredThemeMode()): ThemeMode {
  return mode.endsWith('light') ? 'light' : 'dark'
}

export function isLocalMode(mode = getAppMode()): boolean {
  return getDataSourceMode(mode) === 'local'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function getStoredUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUser
  } catch {
    return null
  }
}

export function setStoredUser(usuario: StoredUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(usuario))
}

function authHeaders(): HeadersInit {
  const token = getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json; charset=utf-8',
  }
  if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`
  return headers
}

let onSessionReplaced: (() => void) | null = null

export function setOnSessionReplaced(callback: () => void): void {
  onSessionReplaced = callback
}

async function checkSessionReplaced(res: Response): Promise<void> {
  if (res.status === 401) {
    try {
      const clone = res.clone()
      const data = await clone.json()
      if (data.code === 'SESSION_REPLACED' && onSessionReplaced) onSessionReplaced()
    } catch {
      // noop
    }
  }
}

function shouldFallbackToLocal(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('failed to fetch') || message.includes('networkerror') || message.includes('load failed')
}

const nowIso = () => new Date().toISOString()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function toStoredUser(user: LocalUser): StoredUser {
  return {
    id_usuario: user.id_usuario,
    username: user.username,
    nombre_completo: user.nombre_completo,
    rol: user.rol,
    vistas_permitidas: user.vistas_permitidas ?? null,
  }
}

function toUsuarioSoporte(user: LocalUser) {
  return {
    ...user,
    nombre_completo: user.nombre_completo ?? null,
  }
}

function nextId<T>(items: T[], readValue: (item: T) => number): number {
  return items.reduce((max, item) => Math.max(max, Number(readValue(item) || 0)), 0) + 1
}

function sortConversaciones(items: LocalConversacion[]) {
  return [...items].sort((a, b) => {
    const aDate = new Date(a.primer_mensaje_en || a.creada_en || 0).getTime()
    const bDate = new Date(b.primer_mensaje_en || b.creada_en || 0).getTime()
    return bDate - aDate
  })
}

function buildLocalSeed(): LocalDb {
  const now = Date.now()
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString()

  const users: LocalUser[] = [
    {
      id_usuario: 1,
      username: 'admin.local',
      password: 'Admin12345678',
      nombre_completo: 'Laura Moreno',
      rol: 'ADMIN',
      vistas_permitidas: ['asesor', 'administrador', 'historial', 'seguimiento_bot', 'admin_faq', 'dashboard', 'dashboard-bot', 'transferencias', 'usuarios', 'empresas'],
      estado: true,
      nivel: 1,
      tipo_documento: 'CC',
      documento: '100000001',
      creado_en: iso(40000),
    },
    {
      id_usuario: 2,
      username: 'asesor.local',
      password: 'Asesor123456',
      nombre_completo: 'Daniel Rojas',
      rol: 'ASESOR',
      vistas_permitidas: ['asesor', 'historial', 'seguimiento_bot'],
      estado: true,
      nivel: 2,
      tipo_documento: 'CC',
      documento: '100000002',
      creado_en: iso(32000),
    },
    {
      id_usuario: 3,
      username: 'supervisor.local',
      password: 'Supervisor123',
      nombre_completo: 'Camila Torres',
      rol: 'SUPERVISOR',
      vistas_permitidas: ['asesor', 'historial', 'seguimiento_bot', 'admin_faq'],
      estado: true,
      nivel: 1,
      tipo_documento: 'CC',
      documento: '100000003',
      creado_en: iso(25000),
    },
  ]

  const empresas: LocalEmpresa[] = [
    { id_empresa: 1, nit: '900123456-1', nombre_empresa: 'Constructora Andina SAS', estado: true, creado_en: iso(50000) },
    { id_empresa: 2, nit: '901456789-2', nombre_empresa: 'Clinica Horizonte IPS', estado: true, creado_en: iso(42000) },
    { id_empresa: 3, nit: '800765432-9', nombre_empresa: 'Grupo Empresarial Pacifico', estado: true, creado_en: iso(38000) },
  ]

  const conversaciones: LocalConversacion[] = [
    {
      id_conversacion: 101,
      empresa_id: 1,
      contacto_id: 501,
      canal: 'WEB',
      tema: 'Licenciamiento',
      estado: 'EN_COLA',
      contacto_nombre: 'Marcela Velez',
      contacto_email: 'marcela.velez@constructoraandina.com',
      contacto_telefono: '3001234567',
      contacto_documento: '43781920',
      empresa_nit: empresas[0].nit,
      empresa_nombre: empresas[0].nombre_empresa,
      creada_en: iso(65),
      primer_mensaje_en: iso(64),
      ultima_actividad_en: iso(3),
      mensajes: [
        { id_mensaje: 1001, tipo_emisor: 'CONTACTO', contenido: 'Hola, necesito una cotizacion para 15 usuarios.', creado_en: iso(64), contacto_nombre: 'Marcela Velez' },
        { id_mensaje: 1002, tipo_emisor: 'BOT', contenido: 'Con gusto. Un asesor te respondera en breve.', creado_en: iso(63) },
      ],
    },
    {
      id_conversacion: 102,
      empresa_id: 2,
      contacto_id: 502,
      canal: 'TELEGRAM',
      tema: 'Soporte tecnico',
      estado: 'ACTIVA',
      contacto_nombre: 'Jorge Ramirez',
      contacto_email: 'jorge.ramirez@horizonteips.com',
      contacto_telefono: '3105557788',
      contacto_documento: '80999122',
      empresa_nit: empresas[1].nit,
      empresa_nombre: empresas[1].nombre_empresa,
      agente_id: 2,
      agente_username: users[1].username,
      agente_nombre_completo: users[1].nombre_completo,
      creada_en: iso(120),
      primer_mensaje_en: iso(118),
      ultima_actividad_en: iso(1),
      mensajes: [
        { id_mensaje: 1003, tipo_emisor: 'CONTACTO', contenido: 'El portal no me deja generar el reporte.', creado_en: iso(118), contacto_nombre: 'Jorge Ramirez' },
        { id_mensaje: 1004, tipo_emisor: 'AGENTE', contenido: 'Estoy revisando el caso, regalame un momento por favor.', creado_en: iso(115), agente_username: users[1].username, agente_nombre_completo: users[1].nombre_completo },
        { id_mensaje: 1005, tipo_emisor: 'CONTACTO', contenido: 'Claro, quedo atento.', creado_en: iso(2), contacto_nombre: 'Jorge Ramirez' },
      ],
    },
    {
      id_conversacion: 103,
      empresa_id: 3,
      contacto_id: 503,
      canal: 'BOT',
      tema: 'Consulta automatica',
      estado: 'ACTIVA',
      contacto_nombre: 'Paula Medina',
      contacto_email: 'paula.medina@grupopacifico.com',
      contacto_telefono: '3159988776',
      contacto_documento: '52344567',
      empresa_nit: empresas[2].nit,
      empresa_nombre: empresas[2].nombre_empresa,
      creada_en: iso(18),
      primer_mensaje_en: iso(18),
      ultima_actividad_en: iso(4),
      mensajes: [
        { id_mensaje: 1006, tipo_emisor: 'CONTACTO', contenido: 'Necesito saber el estado de mi implementacion.', creado_en: iso(18), contacto_nombre: 'Paula Medina' },
        { id_mensaje: 1007, tipo_emisor: 'BOT', contenido: 'Tu implementacion esta en validacion funcional.', creado_en: iso(17) },
        { id_mensaje: 1008, tipo_emisor: 'BOT', contenido: 'Si deseas, puedo pasarte con un asesor humano.', creado_en: iso(4) },
      ],
    },
    {
      id_conversacion: 104,
      empresa_id: 1,
      contacto_id: 504,
      canal: 'WEB',
      tema: 'Facturacion',
      estado: 'CERRADA',
      contacto_nombre: 'Andres Castano',
      contacto_email: 'andres.castano@constructoraandina.com',
      contacto_telefono: '3110002233',
      empresa_nit: empresas[0].nit,
      empresa_nombre: empresas[0].nombre_empresa,
      agente_id: 1,
      agente_username: users[0].username,
      agente_nombre_completo: users[0].nombre_completo,
      creada_en: iso(1440),
      primer_mensaje_en: iso(1435),
      ultima_actividad_en: iso(1420),
      cerrada_en: iso(1415),
      mensajes: [
        { id_mensaje: 1009, tipo_emisor: 'CONTACTO', contenido: 'No veo la factura del ultimo pago.', creado_en: iso(1435), contacto_nombre: 'Andres Castano' },
        { id_mensaje: 1010, tipo_emisor: 'AGENTE', contenido: 'Ya validamos y la acabamos de reenviar al correo registrado.', creado_en: iso(1428), agente_username: users[0].username, agente_nombre_completo: users[0].nombre_completo },
      ],
    },
  ]

  const temas: LocalTema[] = [
    { id: 1, nombre: 'Implementacion', descripcion: 'Preguntas de puesta en marcha', orden: 1, estado: true, created_at: iso(30000), updated_at: iso(40) },
    { id: 2, nombre: 'Facturacion', descripcion: 'Pagos y renovaciones', orden: 2, estado: true, created_at: iso(25000), updated_at: iso(120) },
  ]

  const preguntas: LocalPregunta[] = [
    { id: 1, tema_id: 1, tema_nombre: 'Implementacion', pregunta: 'Cuanto tarda una implementacion?', respuesta: 'El tiempo promedio es entre 2 y 4 semanas segun el alcance.', orden: 1, estado: true, created_at: iso(24000), updated_at: iso(120) },
    { id: 2, tema_id: 2, tema_nombre: 'Facturacion', pregunta: 'Como solicito una copia de factura?', respuesta: 'Puedes pedirla por este canal y se enviara al correo registrado.', orden: 1, estado: true, created_at: iso(22000), updated_at: iso(90) },
  ]

  return { users, empresas, conversaciones, temas, preguntas }
}

function readLocalDb(): LocalDb {
  const raw = localStorage.getItem(LOCAL_DB_KEY)
  if (!raw) {
    const seed = buildLocalSeed()
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(seed))
    localStorage.setItem(LOCAL_TRANSFER_KEY, JSON.stringify([]))
    return seed
  }
  try {
    return JSON.parse(raw) as LocalDb
  } catch {
    const seed = buildLocalSeed()
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(seed))
    localStorage.setItem(LOCAL_TRANSFER_KEY, JSON.stringify([]))
    return seed
  }
}

function writeLocalDb(db: LocalDb): void {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db))
}

function readTransfers(): LocalTransferencia[] {
  const raw = localStorage.getItem(LOCAL_TRANSFER_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as LocalTransferencia[]
  } catch {
    return []
  }
}

function writeTransfers(data: LocalTransferencia[]): void {
  localStorage.setItem(LOCAL_TRANSFER_KEY, JSON.stringify(data))
}

function getCurrentLocalUser(): LocalUser {
  const stored = getStoredUser()
  const db = readLocalDb()
  const user = db.users.find((item) => item.id_usuario === stored?.id_usuario)
  if (!user) throw new Error('Sesion invalida')
  return user
}

export interface LoginResponse {
  message: string
  token: string
  usuario: { id_usuario: number; username: string; rol: string; nombre_completo?: string | null; vistas_permitidas?: string[] | null }
  debe_cambiar_password?: boolean
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const loginLocal = (): LoginResponse => {
    const db = readLocalDb()
    const user = db.users.find((item) => item.username.toLowerCase() === username.trim().toLowerCase())
    if (!user || user.password !== password) throw new Error('Credenciales invalidas')
    setActiveDataSourceMode('local')
    return {
      message: 'Inicio de sesion exitoso',
      token: `local-token-${user.id_usuario}`,
      usuario: toStoredUser(user),
      debe_cambiar_password: false,
    }
  }

  if (isLocalMode()) return loginLocal()

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json; charset=utf-8' },
      body: JSON.stringify({ username: username.trim(), password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || 'Error al iniciar sesion')
    setActiveDataSourceMode('server')
    return data as LoginResponse
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      return loginLocal()
    }
    throw error
  }
}

export async function getMe(): Promise<{ usuario: StoredUser }> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    return { usuario: toStoredUser(getCurrentLocalUser()) }
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() })
    if (!res.ok) {
      await checkSessionReplaced(res)
      throw new Error('Sesion invalida')
    }
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error) && getStoredUser()) {
      setActiveDataSourceMode('local')
      return { usuario: toStoredUser(getCurrentLocalUser()) }
    }
    throw error
  }
}

export async function cambiarPasswordPropia(password_nueva: string): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const current = getCurrentLocalUser()
    db.users = db.users.map((user) => user.id_usuario === current.id_usuario ? { ...user, password: password_nueva } : user)
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/auth/cambiar-password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password_nueva }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Error al cambiar contrasena')
  }
}

export interface RegisterRequest {
  username: string
  password: string
  rol?: string
  nombre_completo?: string
  tipo_documento?: string
  documento?: string
}

export interface RegisterResponse {
  message: string
  usuario: { id_usuario: number; username: string; rol: string }
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const exists = db.users.some((user) => user.username.toLowerCase() === data.username.toLowerCase())
    if (exists) throw new Error('El usuario ya existe')
    const nuevo: LocalUser = {
      id_usuario: nextId(db.users, (item) => item.id_usuario),
      username: data.username.trim(),
      password: data.password,
      rol: data.rol || 'ASESOR',
      nombre_completo: data.nombre_completo || data.username.trim(),
      vistas_permitidas: null,
      estado: true,
      nivel: 2,
      tipo_documento: data.tipo_documento || null,
      documento: data.documento || null,
      creado_en: nowIso(),
    }
    db.users.push(nuevo)
    writeLocalDb(db)
    return { message: 'Usuario creado localmente', usuario: { id_usuario: nuevo.id_usuario, username: nuevo.username, rol: nuevo.rol } }
  }

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.message || result.error || 'Error al registrarse')
  return result as RegisterResponse
}

export interface Agente {
  id_usuario: number
  username: string
  rol: string
  estado: boolean
}

export async function listarAgentes(): Promise<{ usuarios: Agente[] }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    return { usuarios: db.users.map(({ id_usuario, username, rol, estado }) => ({ id_usuario, username, rol, estado })) }
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar agentes')
  return res.json()
}

export interface ConversacionConMensajes {
  id_conversacion: number
  empresa_id: number
  contacto_id: number
  canal: string
  tema: string
  estado: string
  contacto_nombre: string
  contacto_email?: string
  contacto_telefono?: string
  empresa_nit?: string
  empresa_nombre?: string
  agente_username?: string
  agente_nombre_completo?: string | null
  ultima_actividad_en?: string
  cerrada_en?: string
  creada_en?: string
  primer_mensaje_en?: string | null
  mensajes?: Array<{
    id_mensaje: number | string
    tipo_emisor: string
    contenido: string
    creado_en: string
    contacto_nombre?: string
    agente_username?: string
    agente_nombre_completo?: string | null
  }>
}

export async function listarConversaciones(estado?: string): Promise<{ conversaciones: ConversacionConMensajes[] }> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const db = readLocalDb()
    let lista = db.conversaciones.filter((item) => item.estado !== 'CERRADA')
    if (estado) lista = db.conversaciones.filter((item) => item.estado === estado)
    return { conversaciones: clone(sortConversaciones(lista)) }
  }

  try {
    const url = estado ? `${API_BASE}/conversaciones?estado=${encodeURIComponent(estado)}` : `${API_BASE}/conversaciones`
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) {
      await checkSessionReplaced(res)
      throw new Error('Error al cargar conversaciones')
    }
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return listarConversaciones(estado)
    }
    throw error
  }
}

export async function obtenerConversacion(id: number): Promise<ConversacionConMensajes> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const conv = readLocalDb().conversaciones.find((item) => item.id_conversacion === id)
    if (!conv) throw new Error('Error al cargar conversacion')
    return clone(conv)
  }

  try {
    const res = await fetch(`${API_BASE}/conversaciones/${id}`, { headers: authHeaders() })
    if (!res.ok) {
      await checkSessionReplaced(res)
      throw new Error('Error al cargar conversacion')
    }
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return obtenerConversacion(id)
    }
    throw error
  }
}

export interface HistorialCerradaItem {
  id_conversacion: number
  empresa_id: number
  contacto_id: number
  cerrada_en?: string
  ultima_actividad_en?: string
  creada_en?: string
  empresa_nombre?: string
  empresa_nit?: string
  contacto_nombre?: string
  contacto_email?: string
  contacto_telefono?: string
  agente_username?: string
  agente_nombre_completo?: string | null
}

export async function listarHistorialCerradas(): Promise<{ conversaciones: HistorialCerradaItem[] }> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const conversaciones = readLocalDb().conversaciones
      .filter((item) => item.estado === 'CERRADA')
      .sort((a, b) => new Date(b.cerrada_en || b.ultima_actividad_en || b.creada_en || 0).getTime() - new Date(a.cerrada_en || a.ultima_actividad_en || a.creada_en || 0).getTime())
    return { conversaciones: clone(conversaciones) }
  }

  try {
    const res = await fetch(`${API_BASE}/conversaciones/historial-cerradas`, { headers: authHeaders() })
    if (!res.ok) {
      await checkSessionReplaced(res)
      throw new Error('Error al cargar historial')
    }
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return listarHistorialCerradas()
    }
    throw error
  }
}

export interface HistorialContactoMensaje {
  id_mensaje: number
  conversacion_id: number
  tipo_emisor: string
  contenido: string
  creado_en: string
  contacto_nombre?: string
  agente_username?: string
  agente_nombre_completo?: string | null
}

export interface HistorialContactoResponse {
  contacto_nombre: string
  contacto_email?: string | null
  contacto_telefono?: string | null
  empresa_nombre: string
  empresa_nit?: string | null
  mensajes: HistorialContactoMensaje[]
}

export async function obtenerHistorialContacto(empresaId: number, contactoId: number): Promise<HistorialContactoResponse> {
  if (isLocalMode()) {
    const conversaciones = readLocalDb().conversaciones.filter((item) => item.estado === 'CERRADA' && item.empresa_id === empresaId && item.contacto_id === contactoId)
    if (!conversaciones.length) throw new Error('Error al cargar historial del contacto')
    const base = conversaciones[0]
    const mensajes = conversaciones
      .flatMap((conv) => conv.mensajes.map((msg) => ({ ...msg, conversacion_id: conv.id_conversacion })))
      .sort((a, b) => new Date(a.creado_en).getTime() - new Date(b.creado_en).getTime())
    return {
      contacto_nombre: base.contacto_nombre,
      contacto_email: base.contacto_email ?? null,
      contacto_telefono: base.contacto_telefono ?? null,
      empresa_nombre: base.empresa_nombre || 'Empresa',
      empresa_nit: base.empresa_nit ?? null,
      mensajes,
    }
  }

  const res = await fetch(`${API_BASE}/conversaciones/historial-contacto/${empresaId}/${contactoId}`, { headers: authHeaders() })
  if (!res.ok) {
    await checkSessionReplaced(res)
    throw new Error('Error al cargar historial del contacto')
  }
  return res.json()
}

export async function enviarMensaje(data: {
  empresa_id: number
  conversacion_id: number
  tipo_emisor: 'AGENTE'
  usuario_id: number
  contenido: string
}): Promise<{ mensaje: unknown }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const conv = db.conversaciones.find((item) => item.id_conversacion === data.conversacion_id)
    const user = db.users.find((item) => item.id_usuario === data.usuario_id)
    if (!conv || !user) throw new Error('Error al enviar mensaje')
    const idMensaje = db.conversaciones.flatMap((item) => item.mensajes).reduce((max, item) => Math.max(max, item.id_mensaje), 0) + 1
    const mensaje: LocalMensaje = {
      id_mensaje: idMensaje,
      tipo_emisor: 'AGENTE',
      contenido: data.contenido,
      creado_en: nowIso(),
      agente_username: user.username,
      agente_nombre_completo: user.nombre_completo ?? null,
    }
    conv.mensajes.push(mensaje)
    conv.ultima_actividad_en = mensaje.creado_en
    if (conv.estado === 'ASIGNADA') conv.estado = 'ACTIVA'
    if (!conv.agente_id) {
      conv.agente_id = user.id_usuario
      conv.agente_username = user.username
      conv.agente_nombre_completo = user.nombre_completo ?? null
    }
    writeLocalDb(db)
    return { mensaje }
  }

  const res = await fetch(`${API_BASE}/mensajes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    await checkSessionReplaced(res)
    const errData = await res.json().catch(() => ({}))
    throw new Error((errData as { message?: string }).message || 'Error al enviar mensaje')
  }
  return res.json()
}

export async function editarMensajeContacto(idMensaje: number, contenido: string): Promise<{ mensaje: unknown }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    for (const conv of db.conversaciones) {
      const mensaje = conv.mensajes.find((item) => item.id_mensaje === idMensaje)
      if (mensaje) {
        mensaje.contenido = contenido.trim()
        writeLocalDb(db)
        return { mensaje }
      }
    }
    throw new Error('No se pudo editar el mensaje')
  }

  const res = await fetch(`${API_BASE}/mensajes/${idMensaje}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ contenido: contenido.trim() }),
  })
  if (!res.ok) {
    await checkSessionReplaced(res)
    const errData = await res.json().catch(() => ({}))
    throw new Error((errData as { message?: string }).message || 'No se pudo editar el mensaje')
  }
  return res.json()
}

export async function eliminarMensajeContacto(idMensaje: number): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    for (const conv of db.conversaciones) {
      const before = conv.mensajes.length
      conv.mensajes = conv.mensajes.filter((item) => item.id_mensaje !== idMensaje)
      if (conv.mensajes.length !== before) {
        writeLocalDb(db)
        return
      }
    }
    throw new Error('No se pudo eliminar el mensaje')
  }

  const res = await fetch(`${API_BASE}/mensajes/${idMensaje}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) {
    await checkSessionReplaced(res)
    const errData = await res.json().catch(() => ({}))
    throw new Error((errData as { message?: string }).message || 'No se pudo eliminar el mensaje')
  }
}

export async function asignarConversacion(conversacionId: number, usuarioId: number): Promise<unknown> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const conv = db.conversaciones.find((item) => item.id_conversacion === conversacionId)
    const user = db.users.find((item) => item.id_usuario === usuarioId)
    if (!conv || !user) throw new Error('Error al asignar conversacion')
    conv.estado = 'ASIGNADA'
    conv.agente_id = user.id_usuario
    conv.agente_username = user.username
    conv.agente_nombre_completo = user.nombre_completo ?? null
    conv.ultima_actividad_en = nowIso()
    writeLocalDb(db)
    return { ok: true }
  }

  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/asignar`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ usuario_id: usuarioId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { message?: string }).message || (data as { error?: string }).error || 'Error al asignar conversacion'
    throw new Error(msg)
  }
  return data
}

export async function cerrarConversacion(conversacionId: number, datos?: { motivo?: string; notas?: string }): Promise<unknown> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const conv = db.conversaciones.find((item) => item.id_conversacion === conversacionId)
    if (!conv) throw new Error('Error al cerrar conversacion')
    conv.estado = 'CERRADA'
    conv.cerrada_en = nowIso()
    conv.ultima_actividad_en = conv.cerrada_en
    if (datos?.motivo || datos?.notas) {
      conv.mensajes.push({
        id_mensaje: db.conversaciones.flatMap((item) => item.mensajes).reduce((max, item) => Math.max(max, item.id_mensaje), 0) + 1,
        tipo_emisor: 'SISTEMA',
        contenido: `Caso cerrado${datos?.motivo ? ` | Motivo: ${datos.motivo}` : ''}${datos?.notas ? ` | Notas: ${datos.notas}` : ''}`,
        creado_en: conv.cerrada_en,
      })
    }
    writeLocalDb(db)
    return { ok: true }
  }

  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/cerrar`, {
    method: 'POST',
    headers: authHeaders(),
    body: datos ? JSON.stringify(datos) : undefined,
  })
  if (!res.ok) throw new Error('Error al cerrar conversacion')
  return res.json()
}

export async function transferirConversacion(conversacionId: number, usuarioDestinoId: number, motivo?: string): Promise<unknown> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const current = getStoredUser()
    const conv = db.conversaciones.find((item) => item.id_conversacion === conversacionId)
    const destino = db.users.find((item) => item.id_usuario === usuarioDestinoId)
    const origen = db.users.find((item) => item.id_usuario === current?.id_usuario) || null
    if (!conv || !destino) throw new Error('Error al transferir conversacion')
    conv.agente_id = destino.id_usuario
    conv.agente_username = destino.username
    conv.agente_nombre_completo = destino.nombre_completo ?? null
    conv.estado = 'ASIGNADA'
    conv.ultima_actividad_en = nowIso()
    const transferencias = readTransfers()
    transferencias.unshift({
      id_asignacion: nextId(transferencias, (item) => item.id_asignacion),
      conversacion_id: conv.id_conversacion,
      accion: 'TRANSFERENCIA',
      razon: motivo ?? null,
      creado_en: conv.ultima_actividad_en,
      destino_usuario_id: destino.id_usuario,
      destino_username: destino.username,
      destino_nombre_completo: destino.nombre_completo ?? null,
      origen_usuario_id: origen?.id_usuario ?? null,
      origen_username: origen?.username ?? null,
      origen_nombre_completo: origen?.nombre_completo ?? null,
      contacto_nombre: conv.contacto_nombre ?? null,
      nombre_empresa: conv.empresa_nombre ?? null,
      estado_conversacion: conv.estado,
    })
    writeTransfers(transferencias)
    writeLocalDb(db)
    return { ok: true }
  }

  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/transferir`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ usuario_destino_id: usuarioDestinoId, motivo }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || 'Error al transferir conversacion')
  }
  return res.json()
}

export interface UsuarioSoporte {
  id_usuario: number
  username: string
  nombre_completo: string | null
  rol: string
  nivel: number
  estado: boolean
  tipo_documento: string | null
  documento: string | null
  creado_en: string
  vistas_permitidas?: string[] | null
}

export async function listarUsuarios(todos = false): Promise<{ usuarios: UsuarioSoporte[]; total: number }> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const db = readLocalDb()
    const usuarios = todos ? db.users : db.users.filter((item) => item.estado)
    return { usuarios: clone(usuarios.map(toUsuarioSoporte)), total: usuarios.length }
  }

  try {
    const url = todos ? `${API_BASE}/usuarios-soporte?todos=true` : `${API_BASE}/usuarios-soporte`
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new Error('Error al cargar usuarios')
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return listarUsuarios(todos)
    }
    throw error
  }
}

export async function obtenerUsuario(id: number): Promise<{ usuario: UsuarioSoporte }> {
  if (isLocalMode()) {
    const usuario = readLocalDb().users.find((item) => item.id_usuario === id)
    if (!usuario) throw new Error('Error al obtener usuario')
    return { usuario: clone(toUsuarioSoporte(usuario)) }
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al obtener usuario')
  return res.json()
}

export async function actualizarUsuario(id: number, data: Partial<{ username: string; nombre_completo: string; rol: string; nivel: number; estado: boolean; tipo_documento: string; documento: string; vistas_permitidas: string[] | null }>): Promise<{ usuario: UsuarioSoporte }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const usuario = db.users.find((item) => item.id_usuario === id)
    if (!usuario) throw new Error('Error al actualizar usuario')
    Object.assign(usuario, data)
    writeLocalDb(db)
    return { usuario: clone(toUsuarioSoporte(usuario)) }
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { error?: string }).error || 'Error al actualizar usuario')
  return result
}

export async function cambiarPasswordUsuario(id: number, password: string): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const usuario = db.users.find((item) => item.id_usuario === id)
    if (!usuario) throw new Error('Error al cambiar contrasena')
    usuario.password = password
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const result = await res.json().catch(() => ({}))
    throw new Error((result as { error?: string }).error || 'Error al cambiar contrasena')
  }
}

export async function desactivarUsuario(id: number): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const usuario = db.users.find((item) => item.id_usuario === id)
    if (!usuario) throw new Error('Error al desactivar usuario')
    usuario.estado = false
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error('Error al desactivar usuario')
}

export async function eliminarUsuarioPermanente(id: number): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    db.users = db.users.filter((item) => item.id_usuario !== id)
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}/permanente`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || 'Error al eliminar usuario')
  }
}

export interface Empresa {
  id_empresa: number
  nit: string
  nombre_empresa: string
  estado: boolean
  creado_en: string
}

export async function listarEmpresas(): Promise<{ empresas: Empresa[]; total: number }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    return { empresas: clone(db.empresas), total: db.empresas.length }
  }

  const res = await fetch(`${API_BASE}/empresas`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar empresas')
  return res.json()
}

export async function actualizarEmpresa(id: number, data: Partial<{ nombre_empresa: string; estado: boolean }>): Promise<{ empresa: Empresa }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const empresa = db.empresas.find((item) => item.id_empresa === id)
    if (!empresa) throw new Error('Error al actualizar empresa')
    Object.assign(empresa, data)
    db.conversaciones = db.conversaciones.map((item) => item.empresa_id === id ? { ...item, empresa_nombre: empresa.nombre_empresa } : item)
    writeLocalDb(db)
    return { empresa: clone(empresa) }
  }

  const res = await fetch(`${API_BASE}/empresas/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { error?: string }).error || 'Error al actualizar empresa')
  return result
}

export interface DashboardStats {
  usuarios: number
  empresas: number
  contactos: number
  mensajes: number
  agentesEnLinea: number
  conversacionesHoy: number
  conversaciones: {
    total: number
    en_cola: number
    asignadas: number
    activas: number
    cerradas: number
  }
}

export async function obtenerDashboardStats(): Promise<DashboardStats> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const db = readLocalDb()
    const today = new Date().toDateString()
    return {
      usuarios: db.users.length,
      empresas: db.empresas.length,
      contactos: new Set(db.conversaciones.map((item) => item.contacto_id)).size,
      mensajes: db.conversaciones.reduce((sum, item) => sum + item.mensajes.length, 0),
      agentesEnLinea: db.users.filter((item) => item.estado).length,
      conversacionesHoy: db.conversaciones.filter((item) => new Date(item.creada_en || 0).toDateString() === today).length,
      conversaciones: {
        total: db.conversaciones.length,
        en_cola: db.conversaciones.filter((item) => item.estado === 'EN_COLA').length,
        asignadas: db.conversaciones.filter((item) => item.estado === 'ASIGNADA').length,
        activas: db.conversaciones.filter((item) => item.estado === 'ACTIVA').length,
        cerradas: db.conversaciones.filter((item) => item.estado === 'CERRADA').length,
      },
    }
  }

  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Error al cargar estadisticas')
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return obtenerDashboardStats()
    }
    throw error
  }
}

export interface ActividadReciente {
  id_conversacion: number
  estado: string
  creada_en: string
  asignada_en?: string | null
  cerrada_en?: string | null
  segundos_duracion?: number | null
  contacto_nombre: string | null
  nombre_empresa: string | null
  agente_username: string | null
  agente_nombre_completo: string | null
}

export async function obtenerActividadReciente(): Promise<{ actividad: ActividadReciente[] }> {
  if (isLocalMode()) {
    const actividad = readLocalDb().conversaciones
      .slice()
      .sort((a, b) => new Date(b.ultima_actividad_en || b.creada_en || 0).getTime() - new Date(a.ultima_actividad_en || a.creada_en || 0).getTime())
      .slice(0, 12)
      .map((item) => ({
        id_conversacion: item.id_conversacion,
        estado: item.estado,
        creada_en: item.creada_en || nowIso(),
        asignada_en: item.agente_id ? item.ultima_actividad_en || item.creada_en || null : null,
        cerrada_en: item.cerrada_en || null,
        segundos_duracion: item.cerrada_en && item.creada_en ? Math.max(0, Math.round((new Date(item.cerrada_en).getTime() - new Date(item.creada_en).getTime()) / 1000)) : null,
        contacto_nombre: item.contacto_nombre || null,
        nombre_empresa: item.empresa_nombre || null,
        agente_username: item.agente_username || null,
        agente_nombre_completo: item.agente_nombre_completo ?? null,
      }))
    return { actividad }
  }

  const res = await fetch(`${API_BASE}/dashboard/actividad-reciente`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar actividad reciente')
  return res.json()
}

export interface ConversacionActiva {
  id_conversacion: number
  estado: string
  asignada_en: string
  creada_en: string
  canal: string
  tema: string
  contacto_nombre: string | null
  contacto_email: string | null
  contacto_telefono: string | null
  nombre_empresa: string | null
  agente_username: string | null
  agente_nombre_completo: string | null
  segundos_asignada: number
}

export async function obtenerConversacionesActivas(): Promise<{ conversaciones: ConversacionActiva[] }> {
  if (isLocalMode()) {
    const conversaciones = readLocalDb().conversaciones
      .filter((item) => item.estado === 'ACTIVA' || item.estado === 'ASIGNADA')
      .map((item) => ({
        id_conversacion: item.id_conversacion,
        estado: item.estado,
        asignada_en: item.ultima_actividad_en || item.creada_en || nowIso(),
        creada_en: item.creada_en || nowIso(),
        canal: item.canal,
        tema: item.tema,
        contacto_nombre: item.contacto_nombre || null,
        contacto_email: item.contacto_email || null,
        contacto_telefono: item.contacto_telefono || null,
        nombre_empresa: item.empresa_nombre || null,
        agente_username: item.agente_username || null,
        agente_nombre_completo: item.agente_nombre_completo ?? null,
        segundos_asignada: Math.max(0, Math.round((Date.now() - new Date(item.ultima_actividad_en || item.creada_en || nowIso()).getTime()) / 1000)),
      }))
    return { conversaciones }
  }

  const res = await fetch(`${API_BASE}/dashboard/conversaciones-activas`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar conversaciones activas')
  return res.json()
}

export interface ConversacionBot {
  id_conversacion: number
  estado: string
  creada_en: string
  ultima_actividad_en: string
  contacto_nombre: string | null
  contacto_documento: string | null
  nombre_empresa: string | null
  empresa_nit: string | null
  segundos_desde_inicio: number
  segundos_sin_actividad: number
  total_mensajes_bot: number
  total_mensajes_contacto: number
  total_mensajes: number
}

export interface DashboardBotResponse {
  periodo: '24h' | 'todo'
  resumen: {
    total: number
    en_linea: number
    activas: number
    cerradas: number
    total_mensajes: number
  }
  conversaciones: ConversacionBot[]
}

export async function obtenerConversacionesBot(periodo: '24h' | 'todo' = '24h'): Promise<DashboardBotResponse> {
  if (isLocalMode()) {
    const limite = periodo === '24h' ? Date.now() - 24 * 60 * 60 * 1000 : 0
    const conversaciones = readLocalDb().conversaciones
      .filter((item) => item.canal === 'BOT')
      .filter((item) => new Date(item.creada_en || 0).getTime() >= limite)
      .map((item) => ({
        id_conversacion: item.id_conversacion,
        estado: item.estado,
        creada_en: item.creada_en || nowIso(),
        ultima_actividad_en: item.ultima_actividad_en || item.creada_en || nowIso(),
        contacto_nombre: item.contacto_nombre || null,
        contacto_documento: item.contacto_documento ?? null,
        nombre_empresa: item.empresa_nombre || null,
        empresa_nit: item.empresa_nit || null,
        segundos_desde_inicio: Math.max(0, Math.round((Date.now() - new Date(item.creada_en || nowIso()).getTime()) / 1000)),
        segundos_sin_actividad: Math.max(0, Math.round((Date.now() - new Date(item.ultima_actividad_en || item.creada_en || nowIso()).getTime()) / 1000)),
        total_mensajes_bot: item.mensajes.filter((msg) => msg.tipo_emisor === 'BOT').length,
        total_mensajes_contacto: item.mensajes.filter((msg) => msg.tipo_emisor === 'CONTACTO').length,
        total_mensajes: item.mensajes.length,
      }))

    return {
      periodo,
      resumen: {
        total: conversaciones.length,
        en_linea: conversaciones.filter((item) => item.segundos_sin_actividad < 600 && item.estado !== 'CERRADA').length,
        activas: conversaciones.filter((item) => item.estado !== 'CERRADA').length,
        cerradas: conversaciones.filter((item) => item.estado === 'CERRADA').length,
        total_mensajes: conversaciones.reduce((sum, item) => sum + item.total_mensajes, 0),
      },
      conversaciones,
    }
  }

  const res = await fetch(`${API_BASE}/dashboard/conversaciones-bot?periodo=${periodo}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar conversaciones bot')
  return res.json()
}

export interface Transferencia {
  id_asignacion: number
  conversacion_id: number
  accion: string
  razon: string | null
  creado_en: string
  destino_usuario_id: number
  destino_username: string | null
  destino_nombre_completo: string | null
  origen_usuario_id: number | null
  origen_username: string | null
  origen_nombre_completo: string | null
  contacto_nombre: string | null
  nombre_empresa: string | null
  estado_conversacion: string
}

export interface HistorialTransferenciasResponse {
  periodo: string
  total: number
  transferencias: Transferencia[]
}

export async function obtenerHistorialTransferencias(periodo: '24h' | '7d' | '30d' | 'todo' = '24h'): Promise<HistorialTransferenciasResponse> {
  if (isLocalMode()) {
    const days = periodo === '24h' ? 1 : periodo === '7d' ? 7 : periodo === '30d' ? 30 : 36500
    const minDate = Date.now() - days * 24 * 60 * 60 * 1000
    const transferencias = readTransfers().filter((item) => new Date(item.creado_en).getTime() >= minDate)
    return { periodo, total: transferencias.length, transferencias }
  }

  const res = await fetch(`${API_BASE}/dashboard/historial-transferencias?periodo=${periodo}`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar historial de transferencias')
  return res.json()
}

export interface TemaPreguntas {
  id: number
  nombre: string
  descripcion: string | null
  orden: number
  estado: boolean
  created_at: string
  updated_at: string
}

export interface PreguntaFrecuente {
  id: number
  tema_id: number
  pregunta: string
  respuesta: string
  orden: number
  estado: boolean
  tema_nombre?: string
  created_at: string
  updated_at: string
}

export async function listarTemas(): Promise<{ temas: TemaPreguntas[]; total: number }> {
  if (isLocalMode()) {
    setActiveDataSourceMode('local')
    const temas = [...readLocalDb().temas].sort((a, b) => a.orden - b.orden)
    return { temas: clone(temas), total: temas.length }
  }

  try {
    const res = await fetch(`${API_BASE}/temas-preguntas`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Error al cargar temas')
    setActiveDataSourceMode('server')
    return res.json()
  } catch (error) {
    if (shouldFallbackToLocal(error)) {
      setActiveDataSourceMode('local')
      return listarTemas()
    }
    throw error
  }
}

export async function crearTema(data: { nombre: string; descripcion?: string; orden?: number; estado?: boolean }): Promise<{ tema: TemaPreguntas }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const tema: LocalTema = {
      id: nextId(db.temas, (item) => item.id),
      nombre: data.nombre,
      descripcion: data.descripcion ?? null,
      orden: data.orden ?? db.temas.length + 1,
      estado: data.estado ?? true,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    db.temas.push(tema)
    writeLocalDb(db)
    return { tema: clone(tema) }
  }

  const res = await fetch(`${API_BASE}/temas-preguntas`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al crear tema')
  return result
}

export async function actualizarTema(id: number, data: Partial<{ nombre: string; descripcion: string; orden: number; estado: boolean }>): Promise<{ tema: TemaPreguntas }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const tema = db.temas.find((item) => item.id === id)
    if (!tema) throw new Error('Error al actualizar tema')
    Object.assign(tema, data, { updated_at: nowIso() })
    writeLocalDb(db)
    return { tema: clone(tema) }
  }

  const res = await fetch(`${API_BASE}/temas-preguntas/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al actualizar tema')
  return result
}

export async function eliminarTema(id: number): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    db.temas = db.temas.filter((item) => item.id !== id)
    db.preguntas = db.preguntas.filter((item) => item.tema_id !== id)
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/temas-preguntas/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) {
    const result = await res.json().catch(() => ({}))
    throw new Error((result as { message?: string }).message || 'Error al eliminar tema')
  }
}

export async function listarPreguntas(tema_id?: number): Promise<{ preguntas: PreguntaFrecuente[]; total: number }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const preguntas = db.preguntas
      .filter((item) => tema_id ? item.tema_id === tema_id : true)
      .map((item) => ({ ...item, tema_nombre: db.temas.find((tema) => tema.id === item.tema_id)?.nombre || item.tema_nombre }))
      .sort((a, b) => a.orden - b.orden)
    return { preguntas: clone(preguntas), total: preguntas.length }
  }

  const url = tema_id ? `${API_BASE}/preguntas-frecuentes?tema_id=${tema_id}` : `${API_BASE}/preguntas-frecuentes`
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error('Error al cargar preguntas')
  return res.json()
}

export async function crearPregunta(data: { tema_id: number; pregunta: string; respuesta: string; orden?: number; estado?: boolean }): Promise<{ pregunta: PreguntaFrecuente }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const pregunta: LocalPregunta = {
      id: nextId(db.preguntas, (item) => item.id),
      tema_id: data.tema_id,
      pregunta: data.pregunta,
      respuesta: data.respuesta,
      orden: data.orden ?? db.preguntas.filter((item) => item.tema_id === data.tema_id).length + 1,
      estado: data.estado ?? true,
      tema_nombre: db.temas.find((tema) => tema.id === data.tema_id)?.nombre,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    db.preguntas.push(pregunta)
    writeLocalDb(db)
    return { pregunta: clone(pregunta) }
  }

  const res = await fetch(`${API_BASE}/preguntas-frecuentes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al crear pregunta')
  return result
}

export async function actualizarPregunta(id: number, data: Partial<{ tema_id: number; pregunta: string; respuesta: string; orden: number; estado: boolean }>): Promise<{ pregunta: PreguntaFrecuente }> {
  if (isLocalMode()) {
    const db = readLocalDb()
    const pregunta = db.preguntas.find((item) => item.id === id)
    if (!pregunta) throw new Error('Error al actualizar pregunta')
    Object.assign(pregunta, data, {
      tema_nombre: data.tema_id ? db.temas.find((tema) => tema.id === data.tema_id)?.nombre : pregunta.tema_nombre,
      updated_at: nowIso(),
    })
    writeLocalDb(db)
    return { pregunta: clone(pregunta) }
  }

  const res = await fetch(`${API_BASE}/preguntas-frecuentes/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al actualizar pregunta')
  return result
}

export async function eliminarPregunta(id: number): Promise<void> {
  if (isLocalMode()) {
    const db = readLocalDb()
    db.preguntas = db.preguntas.filter((item) => item.id !== id)
    writeLocalDb(db)
    return
  }

  const res = await fetch(`${API_BASE}/preguntas-frecuentes/${id}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) {
    const result = await res.json().catch(() => ({}))
    throw new Error((result as { message?: string }).message || 'Error al eliminar pregunta')
  }
}
