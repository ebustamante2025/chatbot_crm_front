import type { AuditItem, Conversation, UserLite, UserSession } from '../types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch (_e) {
    throw new Error('No se pudo conectar con el backend. Verifica `npm run dev:api` en puerto 3000.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error del servidor');
  return data as T;
}

export const api = {
  login: (email: string, password: string) => request<{ ok: boolean; user: UserSession }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password })
  }),
  setAvailability: (userId: number, availabilityStatus: 'DISPONIBLE' | 'AUSENTE') =>
    request<{ ok: boolean; user: UserSession }>(`/api/users/${userId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ availability_status: availabilityStatus })
    }),
  conversation: (phone: string) => request(`/api/conversations/${phone}`),
  conversationFeed: (role: string, userId: number) => request<Conversation[]>(`/api/conversations/feed?role=${encodeURIComponent(role)}&user_id=${userId}`),
  reply: (to: string, text: string) => request('/api/reply', { method: 'POST', body: JSON.stringify({ to, text }) }),
  users: () => request<UserLite[]>('/api/users'),
  audit: (conversationId?: number) => request<AuditItem[]>(`/api/audit${conversationId ? `?conversation_id=${conversationId}` : ''}`),
  takeConversation: (conversationId: number, userId: number) => request(`/api/conversations/${conversationId}/take`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  transferConversation: (conversationId: number, fromUserId: number, toUserId: number, byRole: string) =>
    request(`/api/conversations/${conversationId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ from_user_id: fromUserId, to_user_id: toUserId, by_role: byRole })
    }),
  autoAssign: (userId: number) => request(`/api/conversations/auto-assign`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  }),
  updateConversationMeta: (conversationId: number, payload: { user_id: number; role: string; tags?: string[]; internal_notes?: string; priority?: string }) =>
    request(`/api/conversations/${conversationId}/meta`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  updateCaseStatus: (conversationId: number, caseStatus: string, userId?: number, role?: string) => request(`/api/conversations/${conversationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ case_status: caseStatus, user_id: userId, role })
  })
};
