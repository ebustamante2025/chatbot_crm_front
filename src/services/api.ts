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

export interface LoginResponse {
  message: string;
  token: string;
  usuario: { id_usuario: number; username: string; rol: string };
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

export async function getMe(): Promise<{ usuario: { id_usuario: number; username: string; rol: string } }> {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Sesión inválida');
  return res.json();
}

export interface RegisterRequest {
  username: string;
  password: string;
  rol?: string;
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
    headers: { 'Content-Type': 'application/json' },
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
  mensajes: Array<{
    id_mensaje: number;
    tipo_emisor: string;
    contenido: string;
    creado_en: string;
    contacto_nombre?: string;
    agente_username?: string;
  }>;
}

export async function listarConversaciones(estado?: string): Promise<{ conversaciones: ConversacionConMensajes[] }> {
  const url = estado
    ? `${API_BASE}/conversaciones?estado=${encodeURIComponent(estado)}`
    : `${API_BASE}/conversaciones`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar conversaciones');
  return res.json();
}

export async function obtenerConversacion(id: number): Promise<ConversacionConMensajes> {
  const res = await fetch(`${API_BASE}/conversaciones/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Error al cargar conversación');
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
  if (!res.ok) throw new Error('Error al enviar mensaje');
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

export async function cerrarConversacion(conversacionId: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/conversaciones/${conversacionId}/cerrar`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Error al cerrar conversación');
  return res.json();
}
