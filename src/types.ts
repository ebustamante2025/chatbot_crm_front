export type RolCRM = 'asesor' | 'administrador' | 'supervisor' | 'ventas' | 'admin_faq';

export interface Mensaje {
  id_mensaje: number;
  conversacion_id: number;
  tipo_emisor: 'CONTACTO' | 'AGENTE' | 'BOT' | 'SISTEMA';
  contenido: string;
  creado_en: string;
  contacto_nombre?: string;
  agente_username?: string;
}

export interface Conversacion {
  id_conversacion: number;
  empresa_id: number;
  contacto_id: number;
  canal: string;
  tema: string;
  estado: string;
  prioridad?: string;
  contacto_nombre: string;
  contacto_email?: string;
  agente_username?: string;
  ultima_actividad_en: string;
  creada_en: string;
  mensajes?: Mensaje[];
}
