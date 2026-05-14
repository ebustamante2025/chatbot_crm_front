export type Direction = 'inbound' | 'outbound';

export interface UserSession {
  id: number;
  full_name: string;
  email: string;
  role: 'ADMIN' | 'ASESOR' | 'SUPERVISOR' | string;
  availability_status: string;
}

export interface UserLite {
  id: number;
  full_name: string;
  email: string;
  role: string;
  availability_status: string;
  is_active?: boolean;
  active_conversations?: number;
}

export interface ChatMessage {
  id: number;
  conversation_id?: number;
  phone: string;
  direction: Direction;
  text: string;
  created_at: string;
}

export interface Conversation {
  id: number;
  contact_id: number;
  contact_phone: string | null;
  contact_name: string | null;
  case_status: string;
  current_assigned_user_id: number | null;
  assigned_user_name: string | null;
  channel?: string;
  priority?: string;
  tags?: string[];
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

export interface AuditItem {
  id: number;
  conversation_id: number;
  user_id: number | null;
  user_name: string;
  action: string;
  from_status: string;
  to_status: string;
  created_at: string;
}
