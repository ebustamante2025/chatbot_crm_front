const API_BASE = '/api';

const TOKEN_KEY = 'crm_token';
const USER_KEY = 'crm_user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): { id_usuario: number; username: string; rol: string } | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { id_usuario: number; username: string; rol: string };
  } catch {
    return null;
  }
}

export function setStoredUser(usuario: { id_usuario: number; username: string; rol: string }): void {
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Listener global para sesión reemplazada
let onSessionReplaced: (() => void) | null = null;

export function setOnSessionReplaced(callback: () => void): void {
  onSessionReplaced = callback;
}

/** Verifica si la respuesta indica que la sesión fue reemplazada */
async function checkSessionReplaced(res: Response): Promise<void> {
  if (res.status === 401) {
    try {
      const clone = res.clone();
      const data = await clone.json();
      if (data.code === 'SESSION_REPLACED' && onSessionReplaced) {
        onSessionReplaced();
      }
    } catch {
      // ignorar errores de parsing
    }
  }
}

export interface LoginResponse {
  message: string;
  token: string;
  usuario: { id_usuario: number; username: string; rol: string };
  debe_cambiar_password?: boolean;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'Error al iniciar sesión');
  return data as LoginResponse;
}

export async function getMe(): Promise<{ usuario: { id_usuario: number; username: string; nombre_completo?: string | null; rol: string } }> {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) {
    await checkSessionReplaced(res);
    throw new Error('Sesión inválida');
  }
  return res.json();
}

export async function cambiarPasswordPropia(password_nueva: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/cambiar-password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password_nueva }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Error al cambiar contraseña');
  }
}

export interface RegisterRequest {
  username: string;
  password: string;
  rol?: string;
  nombre_completo?: string;
  tipo_documento?: string;
  documento?: string;
}

export interface RegisterResponse {
  message: string;
  usuario: { id_usuario: number; username: string; rol: string };
}

export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.message || result.error || 'Error al registrarse');
  return result as RegisterResponse;
}

export interface Agente {
  id_usuario: number;
  username: string;
  rol: string;
  estado: boolean;
}

export async function listarAgentes(): Promise<{ usuarios: Agente[] }> {
  const res = await fetch(`${API_BASE}/usuarios-soporte`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar agentes');
  return res.json();
}

export interface ConversacionConMensajes {
  id_conversacion: number;
  empresa_id: number;
  contacto_id: number;
  canal: string;
  tema: string;
  estado: string;
  contacto_nombre: string;
  contacto_email?: string;
  contacto_telefono?: string;
  empresa_nit?: string;
  empresa_nombre?: string;
  agente_username?: string;
  agente_nombre_completo?: string | null;
  mensajes: Array<{
    id_mensaje: number | string; // string para IDs temporales (optimistic update)
    tipo_emisor: string;
    contenido: string;
    creado_en: string;
    contacto_nombre?: string;
    agente_username?: string;
    agente_nombre_completo?: string | null;
  }>;
}

export async function listarConversaciones(estado?: string): Promise<{ conversaciones: ConversacionConMensajes[] }> {
  const url = estado
    ? `${API_BASE}/conversaciones?estado=${encodeURIComponent(estado)}`
    : `${API_BASE}/conversaciones`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    await checkSessionReplaced(res);
    throw new Error('Error al cargar conversaciones');
  }
  return res.json();
}

export async function obtenerConversacion(id: number): Promise<ConversacionConMensajes> {
  const res = await fetch(`${API_BASE}/conversaciones/${id}`, { headers: authHeaders() });
  if (!res.ok) {
    await checkSessionReplaced(res);
    throw new Error('Error al cargar conversación');
  }
  return res.json();
}

export async function enviarMensaje(data: {
  empresa_id: number;
  conversacion_id: number;
  tipo_emisor: 'AGENTE';
  usuario_id: number;
  contenido: string;
}): Promise<{ mensaje: unknown }> {
  const res = await fetch(`${API_BASE}/mensajes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    await checkSessionReplaced(res);
    const errData = await res.json().catch(() => ({}));
    console.error('[enviarMensaje] Error:', res.status, errData);
    throw new Error((errData as { message?: string }).message || 'Error al enviar mensaje');
  }
  return res.json();
}

export async function asignarConversacion(conversacionId: number, usuarioId: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/asignar`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ usuario_id: usuarioId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { message?: string }).message || (data as { error?: string }).error || 'Error al asignar conversación';
    throw new Error(msg);
  }
  return data;
}

export async function cerrarConversacion(conversacionId: number, datos?: { motivo?: string; notas?: string }): Promise<unknown> {
  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/cerrar`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  if (!res.ok) throw new Error('Error al cerrar conversación');
  return res.json();
}

export async function transferirConversacion(
  conversacionId: number,
  usuarioDestinoId: number,
  motivo?: string
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/transferir`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_destino_id: usuarioDestinoId, motivo }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Error al transferir conversación');
  }
  return res.json();
}

// =============================================
// ADMIN: USUARIOS DE SOPORTE
// =============================================

export interface UsuarioSoporte {
  id_usuario: number;
  username: string;
  nombre_completo: string | null;
  rol: string;
  nivel: number;
  estado: boolean;
  tipo_documento: string | null;
  documento: string | null;
  creado_en: string;
}

export async function listarUsuarios(todos = false): Promise<{ usuarios: UsuarioSoporte[]; total: number }> {
  const url = todos ? `${API_BASE}/usuarios-soporte?todos=true` : `${API_BASE}/usuarios-soporte`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar usuarios');
  return res.json();
}

export async function obtenerUsuario(id: number): Promise<{ usuario: UsuarioSoporte }> {
  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al obtener usuario');
  return res.json();
}

export async function actualizarUsuario(id: number, data: Partial<{ username: string; rol: string; nivel: number; estado: boolean; tipo_documento: string; documento: string }>): Promise<{ usuario: UsuarioSoporte }> {
  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { error?: string }).error || 'Error al actualizar usuario');
  return result;
}

export async function cambiarPasswordUsuario(id: number, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error((result as { error?: string }).error || 'Error al cambiar contraseña');
  }
}

export async function desactivarUsuario(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Error al desactivar usuario');
}

export async function eliminarUsuarioPermanente(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/usuarios-soporte/${id}/permanente`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Error al eliminar usuario');
  }
}

// =============================================
// ADMIN: EMPRESAS
// =============================================

export interface Empresa {
  id_empresa: number;
  nit: string;
  nombre_empresa: string;
  estado: boolean;
  creado_en: string;
}

export async function listarEmpresas(): Promise<{ empresas: Empresa[]; total: number }> {
  const res = await fetch(`${API_BASE}/empresas`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar empresas');
  return res.json();
}

export async function actualizarEmpresa(id: number, data: Partial<{ nombre_empresa: string; estado: boolean }>): Promise<{ empresa: Empresa }> {
  const res = await fetch(`${API_BASE}/empresas/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { error?: string }).error || 'Error al actualizar empresa');
  return result;
}

// =============================================
// ADMIN: DASHBOARD
// =============================================

export interface DashboardStats {
  usuarios: number;
  empresas: number;
  contactos: number;
  mensajes: number;
  agentesEnLinea: number;
  conversacionesHoy: number;
  conversaciones: {
    total: number;
    en_cola: number;
    asignadas: number;
    activas: number;
    cerradas: number;
  };
}

export async function obtenerDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar estadísticas');
  return res.json();
}

export interface ActividadReciente {
  id_conversacion: number;
  estado: string;
  creada_en: string;
  contacto_nombre: string | null;
  nombre_empresa: string | null;
  agente_username: string | null;
  agente_nombre_completo: string | null;
}

export async function obtenerActividadReciente(): Promise<{ actividad: ActividadReciente[] }> {
  const res = await fetch(`${API_BASE}/dashboard/actividad-reciente`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar actividad reciente');
  return res.json();
}

export interface ConversacionActiva {
  id_conversacion: number;
  estado: string;
  asignada_en: string;
  creada_en: string;
  canal: string;
  tema: string;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  nombre_empresa: string | null;
  agente_username: string | null;
  agente_nombre_completo: string | null;
  segundos_asignada: number;
}

export async function obtenerConversacionesActivas(): Promise<{ conversaciones: ConversacionActiva[] }> {
  const res = await fetch(`${API_BASE}/dashboard/conversaciones-activas`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar conversaciones activas');
  return res.json();
}

// =============================================
// DASHBOARD BOT (ISA)
// =============================================
export interface ConversacionBot {
  id_conversacion: number;
  estado: string;
  creada_en: string;
  ultima_actividad_en: string;
  contacto_nombre: string | null;
  contacto_documento: string | null;
  nombre_empresa: string | null;
  empresa_nit: string | null;
  segundos_desde_inicio: number;
  segundos_sin_actividad: number;
  total_mensajes_bot: number;
  total_mensajes_contacto: number;
  total_mensajes: number;
}

export interface DashboardBotResponse {
  periodo: '24h' | 'todo';
  resumen: {
    total: number;
    en_linea: number;
    activas: number;
    cerradas: number;
    total_mensajes: number;
  };
  conversaciones: ConversacionBot[];
}

export async function obtenerConversacionesBot(periodo: '24h' | 'todo' = '24h'): Promise<DashboardBotResponse> {
  const res = await fetch(`${API_BASE}/dashboard/conversaciones-bot?periodo=${periodo}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar conversaciones bot');
  return res.json();
}

// =============================================
// HISTORIAL DE TRANSFERENCIAS
// =============================================

export interface Transferencia {
  id_asignacion: number;
  conversacion_id: number;
  accion: string;
  razon: string | null;
  creado_en: string;
  destino_usuario_id: number;
  destino_username: string | null;
  destino_nombre_completo: string | null;
  origen_usuario_id: number | null;
  origen_username: string | null;
  origen_nombre_completo: string | null;
  contacto_nombre: string | null;
  nombre_empresa: string | null;
  estado_conversacion: string;
}

export interface HistorialTransferenciasResponse {
  periodo: string;
  total: number;
  transferencias: Transferencia[];
}

export async function obtenerHistorialTransferencias(
  periodo: '24h' | '7d' | '30d' | 'todo' = '24h'
): Promise<HistorialTransferenciasResponse> {
  const res = await fetch(`${API_BASE}/dashboard/historial-transferencias?periodo=${periodo}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar historial de transferencias');
  return res.json();
}

// =============================================
// TEMAS DE PREGUNTAS FRECUENTES
// =============================================

export interface TemaPreguntas {
  id: number;
  nombre: string;
  descripcion: string | null;
  orden: number;
  estado: boolean;
  created_at: string;
  updated_at: string;
}

export interface PreguntaFrecuente {
  id: number;
  tema_id: number;
  pregunta: string;
  respuesta: string;
  orden: number;
  estado: boolean;
  tema_nombre?: string;
  created_at: string;
  updated_at: string;
}

// --- TEMAS ---

export async function listarTemas(): Promise<{ temas: TemaPreguntas[]; total: number }> {
  const res = await fetch(`${API_BASE}/temas-preguntas`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar temas');
  return res.json();
}

export async function crearTema(data: { nombre: string; descripcion?: string; orden?: number; estado?: boolean }): Promise<{ tema: TemaPreguntas }> {
  const res = await fetch(`${API_BASE}/temas-preguntas`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al crear tema');
  return result;
}

export async function actualizarTema(id: number, data: Partial<{ nombre: string; descripcion: string; orden: number; estado: boolean }>): Promise<{ tema: TemaPreguntas }> {
  const res = await fetch(`${API_BASE}/temas-preguntas/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al actualizar tema');
  return result;
}

export async function eliminarTema(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/temas-preguntas/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error((result as { message?: string }).message || 'Error al eliminar tema');
  }
}

// --- PREGUNTAS FRECUENTES ---

export async function listarPreguntas(tema_id?: number): Promise<{ preguntas: PreguntaFrecuente[]; total: number }> {
  const url = tema_id
    ? `${API_BASE}/preguntas-frecuentes?tema_id=${tema_id}`
    : `${API_BASE}/preguntas-frecuentes`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar preguntas');
  return res.json();
}

export async function crearPregunta(data: { tema_id: number; pregunta: string; respuesta: string; orden?: number; estado?: boolean }): Promise<{ pregunta: PreguntaFrecuente }> {
  const res = await fetch(`${API_BASE}/preguntas-frecuentes`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al crear pregunta');
  return result;
}

export async function actualizarPregunta(id: number, data: Partial<{ tema_id: number; pregunta: string; respuesta: string; orden: number; estado: boolean }>): Promise<{ pregunta: PreguntaFrecuente }> {
  const res = await fetch(`${API_BASE}/preguntas-frecuentes/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((result as { message?: string }).message || 'Error al actualizar pregunta');
  return result;
}

export async function eliminarPregunta(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/preguntas-frecuentes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const result = await res.json().catch(() => ({}));
    throw new Error((result as { message?: string }).message || 'Error al eliminar pregunta');
  }
}
