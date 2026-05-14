import { useEffect, useMemo, useState } from 'react';
import { api } from './services/api';
import type { AuditItem, ChatMessage, Conversation, UserLite, UserSession } from './types';
import './App.css';

function formatearHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function minutosEntre(inicio: string, fin: string): number {
  const a = new Date(inicio).getTime();
  const b = new Date(fin).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 60000);
}

function slaNivel(c: Conversation): { label: string; cls: string } {
  const mins = minutosEntre(c.created_at, new Date().toISOString());
  if (c.case_status === 'TERMINADO') return { label: 'Cerrado', cls: 'ok' };
  if (mins < 20) return { label: `SLA OK (${mins}m)`, cls: 'ok' };
  if (mins < 60) return { label: `SLA Riesgo (${mins}m)`, cls: 'warn' };
  return { label: `SLA Critico (${mins}m)`, cls: 'bad' };
}

const SESSION_KEY = 'wps_crm_session';
const plantillaKey = (userId: number) => `wps_templates_${userId}`;

type AdminView = 'bandeja' | 'historial' | 'dashboard' | 'auditoria';
type AsesorView = 'bandeja' | 'plantillas';

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [feed, setFeed] = useState<Conversation[]>([]);
  const [workers, setWorkers] = useState<UserLite[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [textByConversation, setTextByConversation] = useState<Record<number, string>>({});
  const [transferByConversation, setTransferByConversation] = useState<Record<number, number>>({});
  const [tagInputByConversation, setTagInputByConversation] = useState<Record<number, string>>({});
  const [notesByConversation, setNotesByConversation] = useState<Record<number, string>>({});
  const [activeComposeConversationId, setActiveComposeConversationId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [adminView, setAdminView] = useState<AdminView>('bandeja');
  const [asesorView, setAsesorView] = useState<AsesorView>('bandeja');

  const [templates, setTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODOS');
  const [agentFilter, setAgentFilter] = useState('TODOS');

  const role = (session?.role || '').toUpperCase();
  const isAsesor = role === 'ASESOR';
  const isAdmin = role === 'ADMIN' || role === 'SUPERVISOR';

  useEffect(() => {
    if (!session) return;
    const raw = localStorage.getItem(plantillaKey(session.id));
    if (raw) {
      try { setTemplates(JSON.parse(raw) as string[]); } catch { setTemplates([]); }
    } else setTemplates([]);
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    localStorage.setItem(plantillaKey(session.id), JSON.stringify(templates));
  }, [templates, session?.id]);

  const filteredFeed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return feed.filter((c) => {
      const byStatus = statusFilter === 'TODOS' || c.case_status === statusFilter;
      const byAgent = agentFilter === 'TODOS' || String(c.current_assigned_user_id || '') === agentFilter;
      const bySearch = !q || [c.contact_name, c.contact_phone, c.tags?.join(' '), c.internal_notes].join(' ').toLowerCase().includes(q);
      return byStatus && byAgent && bySearch;
    });
  }, [feed, search, statusFilter, agentFilter]);

  const selectedConversations = useMemo(() => {
    const convs = filteredFeed.filter((c) => selectedIds.includes(c.id));
    if (!isAsesor) return convs.slice(0, 1);
    const taken = filteredFeed.filter((c) => c.current_assigned_user_id === session?.id && ['TOMADO_CASO', 'ATENDIENDO', 'REVISADO'].includes(c.case_status));
    if (taken.length > 0) return taken.slice(0, 2);
    return convs.slice(0, 1);
  }, [filteredFeed, selectedIds, isAsesor, session?.id]);

  const closedConversations = useMemo(() => feed.filter((c) => c.case_status === 'TERMINADO' && c.closed_at), [feed]);

  const dashboardByWorker = useMemo(() => {
    const map = new Map<string, { count: number; totalMinutes: number }>();
    for (const c of closedConversations) {
      const worker = c.assigned_user_name || 'Sin asignar';
      const item = map.get(worker) || { count: 0, totalMinutes: 0 };
      item.count += 1;
      item.totalMinutes += minutosEntre(c.created_at, c.closed_at || c.updated_at);
      map.set(worker, item);
    }
    return [...map.entries()].map(([worker, data]) => ({ worker, closed_count: data.count, avg_minutes: data.count ? Math.round(data.totalMinutes / data.count) : 0 }));
  }, [closedConversations]);

  async function refreshFeed() {
    if (!session) return;
    try {
      const data = await api.conversationFeed(session.role, session.id);
      setFeed(data);
      setSelectedIds((prev) => {
        const stillExists = prev.filter((id) => data.some((c) => c.id === id));
        if (stillExists.length > 0) return stillExists;
        return data.length ? [data[0].id] : [];
      });
      setNotesByConversation((prev) => {
        const next = { ...prev };
        data.forEach((c) => { if (next[c.id] === undefined) next[c.id] = c.internal_notes || ''; });
        return next;
      });
      setTagInputByConversation((prev) => {
        const next = { ...prev };
        data.forEach((c) => { if (next[c.id] === undefined) next[c.id] = (c.tags || []).join(', '); });
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshWorkers() {
    if (!session) return;
    try {
      const users = await api.users();
      setWorkers(users.filter((u) => String(u.role).toUpperCase() === 'ASESOR'));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshAudit() {
    if (!isAdmin) return;
    try { setAudit(await api.audit()); } catch (e) { setError((e as Error).message); }
  }

  async function loadMessagesFor(conversation: Conversation) {
    if (!conversation.contact_phone) return;
    const data = (await api.conversation(conversation.contact_phone)) as ChatMessage[];
    setMessagesByConversation((prev) => ({ ...prev, [conversation.id]: data }));
  }

  useEffect(() => {
    if (!session) return;
    refreshFeed();
    refreshWorkers();
    refreshAudit();
  }, [session?.id, session?.role]);

  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      refreshFeed();
      if (isAdmin && adminView === 'auditoria') refreshAudit();
    }, 5000);
    return () => clearInterval(timer);
  }, [session?.id, session?.role, adminView, isAdmin]);

  useEffect(() => {
    selectedConversations.forEach((c) => loadMessagesFor(c).catch((e) => setError((e as Error).message)));
  }, [selectedConversations.map((c) => c.id).join(',')]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    try {
      setLoading(true);
      setLoginError('');
      const { user } = await api.login(email.trim(), password);
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      setSession(user);
      setEmail('');
      setPassword('');
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setFeed([]);
    setSelectedIds([]);
    setMessagesByConversation({});
  }

  async function handleTakeCase(conversationId: number) {
    if (!session) return;
    try { await api.takeConversation(conversationId, session.id); await refreshFeed(); await refreshWorkers(); } catch (e) { setError((e as Error).message); }
  }

  async function handleTransfer(conversationId: number) {
    if (!session) return;
    const toUserId = transferByConversation[conversationId];
    if (!toUserId) return;
    try { await api.transferConversation(conversationId, session.id, toUserId, session.role); await refreshFeed(); await refreshWorkers(); await refreshAudit(); } catch (e) { setError((e as Error).message); }
  }

  async function handleCloseCase(conversationId: number) {
    if (!session) return;
    try { await api.updateCaseStatus(conversationId, 'TERMINADO', session.id, session.role); await refreshFeed(); await refreshAudit(); } catch (e) { setError((e as Error).message); }
  }

  async function handleAvailabilityChange(value: 'DISPONIBLE' | 'AUSENTE') {
    if (!session) return;
    try {
      const { user } = await api.setAvailability(session.id, value);
      const updated = { ...session, availability_status: user.availability_status };
      setSession(updated);
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
      await refreshFeed();
    } catch (e) { setError((e as Error).message); }
  }

  async function handleSaveMeta(conv: Conversation) {
    if (!session) return;
    try {
      const tags = (tagInputByConversation[conv.id] || '').split(',').map((t) => t.trim()).filter(Boolean);
      await api.updateConversationMeta(conv.id, {
        user_id: session.id,
        role: session.role,
        tags,
        internal_notes: notesByConversation[conv.id] || '',
        priority: conv.priority || 'MEDIA'
      });
      await refreshFeed();
      await refreshAudit();
    } catch (e) { setError((e as Error).message); }
  }

  async function handleAutoAssign() {
    if (!session) return;
    try { await api.autoAssign(session.id); await refreshFeed(); await refreshWorkers(); await refreshAudit(); } catch (e) { setError((e as Error).message); }
  }

  async function handleSend(conversation: Conversation) {
    const text = (textByConversation[conversation.id] || '').trim();
    if (!text || !conversation.contact_phone) return;
    try {
      await api.reply(conversation.contact_phone, text);
      setTextByConversation((prev) => ({ ...prev, [conversation.id]: '' }));
      await loadMessagesFor(conversation);
      await refreshFeed();
    } catch (e) { setError((e as Error).message); }
  }

  function addTemplate() { const t = newTemplate.trim(); if (!t) return; setTemplates((prev) => (prev.includes(t) ? prev : [t, ...prev])); setNewTemplate(''); }
  function removeTemplate(index: number) { setTemplates((prev) => prev.filter((_, i) => i !== index)); }

  function useTemplate(template: string) {
    const target = selectedConversations.find((c) => c.id === activeComposeConversationId) || selectedConversations[0];
    if (!target) return;
    const name = target.contact_name || 'Cliente';
    const text = template
      .replace(/\{\{nombre\}\}/g, name)
      .replace(/\{\{telefono\}\}/g, target.contact_phone || '')
      .replace(/\{\{caso_id\}\}/g, String(target.id));
    setTextByConversation((prev) => ({ ...prev, [target.id]: text }));
    setAsesorView('bandeja');
  }

  if (!session) {
    return (
      <div className="crm-app login-wrap">
        <form onSubmit={handleLogin} className="crm-modal" style={{ maxWidth: 380 }}>
          <h3>Iniciar sesion CRM</h3>
          <p className="crm-modal-subtitulo">Usuarios de prueba por rol</p>
          <div className="crm-modal-campo"><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="asesor@wps.local" /></div>
          <div className="crm-modal-campo"><label>Contrasena</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="********" /></div>
          {loginError ? <div className="crm-modal-error">{loginError}</div> : null}
          <button className="crm-btn crm-btn--primary" disabled={loading || !email || !password} type="submit">{loading ? 'Ingresando...' : 'Entrar'}</button>
          <p className="crm-help">Admin: laura@wps.local / Admin12345<br/>Asesor: daniel@wps.local / Asesor12345</p>
        </form>
      </div>
    );
  }

  return (
    <div className="crm-app">
      <header className="crm-header">
        <div className="crm-header-brand"><h1>CRM WPS Pro</h1></div>
        <div className="crm-header-user">
          {isAsesor ? (
            <select className="crm-availability-select" value={session.availability_status} onChange={(e) => handleAvailabilityChange(e.target.value as 'DISPONIBLE' | 'AUSENTE')}>
              <option value="DISPONIBLE">Disponible</option>
              <option value="AUSENTE">No disponible</option>
            </select>
          ) : null}

          {isAsesor ? (
            <div className="crm-tabs">
              <button className={`crm-btn ${asesorView === 'bandeja' ? 'crm-btn--primary' : ''}`} onClick={() => setAsesorView('bandeja')}>Bandeja</button>
              <button className={`crm-btn ${asesorView === 'plantillas' ? 'crm-btn--primary' : ''}`} onClick={() => setAsesorView('plantillas')}>Plantillas</button>
            </div>
          ) : null}

          {isAdmin ? (
            <div className="crm-tabs">
              <button className={`crm-btn ${adminView === 'bandeja' ? 'crm-btn--primary' : ''}`} onClick={() => setAdminView('bandeja')}>Bandeja</button>
              <button className={`crm-btn ${adminView === 'historial' ? 'crm-btn--primary' : ''}`} onClick={() => setAdminView('historial')}>Historial</button>
              <button className={`crm-btn ${adminView === 'dashboard' ? 'crm-btn--primary' : ''}`} onClick={() => setAdminView('dashboard')}>Dashboard</button>
              <button className={`crm-btn ${adminView === 'auditoria' ? 'crm-btn--primary' : ''}`} onClick={() => setAdminView('auditoria')}>Auditoria</button>
            </div>
          ) : null}

          <span>{session.full_name} · {session.role}</span>
          <button className="crm-btn crm-btn--logout" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      {isAsesor && asesorView === 'plantillas' ? (
        <main className="crm-main" style={{ display: 'block', padding: '1rem' }}>
          <section className="crm-chat-card" style={{ maxWidth: 920, margin: '0 auto' }}>
            <div className="crm-chat-header"><h3>Plantillas del asesor</h3></div>
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
                <input value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} placeholder="Ej: Hola {{nombre}}, ya estoy revisando tu caso {{caso_id}}" style={{ flex: 1, padding: '0.65rem 0.85rem', border: '1px solid var(--crm-border)', borderRadius: 8 }} />
                <button className="crm-btn crm-btn--primary" onClick={addTemplate}>Guardar</button>
              </div>
              {templates.length === 0 ? <p className="crm-empty">No tienes plantillas guardadas.</p> : templates.map((t, i) => (
                <div key={`${t}-${i}`} className="crm-chat-card" style={{ borderRadius: 8, marginBottom: '0.5rem' }}>
                  <div style={{ padding: '0.8rem', display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="crm-btn crm-btn--primary" onClick={() => useTemplate(t)}>Usar</button>
                      <button className="crm-btn" onClick={() => removeTemplate(i)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : isAdmin && adminView === 'historial' ? (
        <main className="crm-main" style={{ display: 'block', padding: '1rem' }}>
          <section className="crm-chat-card" style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div className="crm-chat-header"><h3>Historial de casos cerrados</h3></div>
            <div style={{ padding: '1rem', overflow: 'auto' }}>
              <table className="crm-table">
                <thead><tr><th>ID</th><th>Contacto</th><th>Trabajador</th><th>Inicio</th><th>Cierre</th><th>Duracion</th></tr></thead>
                <tbody>
                  {closedConversations.map((c) => (
                    <tr key={c.id}><td>{c.id}</td><td>{c.contact_name || c.contact_phone}</td><td>{c.assigned_user_name || 'Sin asignar'}</td><td>{formatearFecha(c.created_at)}</td><td>{formatearFecha(c.closed_at || c.updated_at)}</td><td>{minutosEntre(c.created_at, c.closed_at || c.updated_at)} min</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      ) : isAdmin && adminView === 'dashboard' ? (
        <main className="crm-main" style={{ display: 'block', padding: '1rem' }}>
          <section className="crm-chat-card" style={{ maxWidth: 980, margin: '0 auto' }}>
            <div className="crm-chat-header"><h3>Dashboard</h3><button className="crm-btn crm-btn--primary" onClick={handleAutoAssign}>Autoasignar mas antiguo</button></div>
            <div style={{ padding: '1rem' }}>
              {dashboardByWorker.map((row) => (
                <div key={row.worker} className="crm-chat-card" style={{ borderRadius: 8, marginBottom: '0.6rem' }}>
                  <div style={{ padding: '0.8rem', display: 'flex', justifyContent: 'space-between' }}><strong>{row.worker}</strong><span>Cerrados: {row.closed_count} · Promedio: {row.avg_minutes} min</span></div>
                </div>
              ))}
            </div>
          </section>
        </main>
      ) : isAdmin && adminView === 'auditoria' ? (
        <main className="crm-main" style={{ display: 'block', padding: '1rem' }}>
          <section className="crm-chat-card" style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div className="crm-chat-header"><h3>Auditoria de acciones</h3></div>
            <div style={{ padding: '1rem', overflow: 'auto' }}>
              <table className="crm-table">
                <thead><tr><th>Fecha</th><th>Caso</th><th>Accion</th><th>Usuario</th><th>De</th><th>A</th></tr></thead>
                <tbody>{audit.map((a) => <tr key={a.id}><td>{formatearFecha(a.created_at)}</td><td>#{a.conversation_id}</td><td>{a.action}</td><td>{a.user_name}</td><td>{a.from_status}</td><td>{a.to_status}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </main>
      ) : (
        <main className="crm-main">
          <aside className="crm-sidebar">
            <div className="crm-sidebar-header"><h2>Conversaciones</h2></div>
            <div style={{ padding: '0.6rem' }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, telefono, tag o nota" style={{ width: '100%', padding: '0.55rem', borderRadius: 8, border: '1px solid var(--crm-border)' }} />
              <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.45rem' }}>
                <select className="crm-transfer-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="TODOS">Todos los estados</option>
                  <option value="SIN_TOMAR_CASO">Sin tomar</option>
                  <option value="TOMADO_CASO">Tomado</option>
                  <option value="ATENDIENDO">Atendiendo</option>
                  <option value="REVISADO">Revisado</option>
                  <option value="TERMINADO">Terminado</option>
                </select>
                <select className="crm-transfer-select" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
                  <option value="TODOS">Todos los asesores</option>
                  {workers.map((w) => <option key={w.id} value={String(w.id)}>{w.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="crm-conversaciones-lista">
              {filteredFeed.map((c) => {
                const sla = slaNivel(c);
                return (
                  <button key={c.id} className={`crm-conversacion-item ${selectedIds.includes(c.id) ? 'crm-conversacion-item--active' : ''}`} onClick={() => setSelectedIds([c.id])}>
                    <span className="crm-conversacion-nombre">#{c.id} · {c.contact_name || c.contact_phone}</span>
                    <span className="crm-conversacion-contacto">{c.contact_phone}</span>
                    <span className="crm-conversacion-estado">{c.case_status} · {c.priority || 'MEDIA'}</span>
                    <span className="crm-sla-pill" data-sla={sla.cls}>{sla.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="crm-chat-grid" style={{ gridTemplateColumns: selectedConversations.length > 1 ? '1fr 1fr' : '1fr' }}>
            {selectedConversations.map((conv) => {
              const msgs = messagesByConversation[conv.id] || [];
              const canTake = isAsesor && conv.case_status === 'SIN_TOMAR_CASO';
              const canReply = conv.current_assigned_user_id === session.id || session.role === 'ADMIN' || session.role === 'SUPERVISOR';
              const canTransfer = isAdmin || (isAsesor && conv.current_assigned_user_id === session.id && conv.case_status !== 'TERMINADO');
              const selectedTransferUserId = transferByConversation[conv.id] || 0;
              const transferOptions = workers.filter((w) => w.id !== conv.current_assigned_user_id);

              return (
                <section key={conv.id} className="crm-chat-card">
                  <div className="crm-chat-header">
                    <div>
                      <h3>#{conv.id} · {conv.contact_name || conv.contact_phone}</h3>
                      <span className="crm-chat-meta">{conv.case_status} · {conv.assigned_user_name || 'Sin asignar'} · Canal: {conv.channel || 'WHATSAPP'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      {canTake ? <button className="crm-btn crm-btn--primary" onClick={() => handleTakeCase(conv.id)}>Tomar caso</button> : null}
                      {canReply && conv.case_status !== 'TERMINADO' ? <button className="crm-btn" onClick={() => handleCloseCase(conv.id)}>Cerrar chat</button> : null}
                      {canTransfer ? (
                        <>
                          <select className="crm-transfer-select" value={selectedTransferUserId || ''} onChange={(e) => setTransferByConversation((prev) => ({ ...prev, [conv.id]: Number(e.target.value) }))}>
                            <option value="">Transferir a...</option>
                            {transferOptions.map((w) => <option key={w.id} value={w.id}>{w.full_name} ({w.active_conversations || 0}/2)</option>)}
                          </select>
                          <button className="crm-btn crm-btn--primary" onClick={() => handleTransfer(conv.id)} disabled={!selectedTransferUserId}>Transferir</button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--crm-border)', background: '#f8fbff' }}>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <input value={tagInputByConversation[conv.id] || ''} onChange={(e) => setTagInputByConversation((p) => ({ ...p, [conv.id]: e.target.value }))} placeholder="Etiquetas separadas por coma" style={{ padding: '0.48rem', borderRadius: 8, border: '1px solid var(--crm-border)' }} />
                      <textarea value={notesByConversation[conv.id] || ''} onChange={(e) => setNotesByConversation((p) => ({ ...p, [conv.id]: e.target.value }))} placeholder="Notas internas" rows={2} style={{ padding: '0.48rem', borderRadius: 8, border: '1px solid var(--crm-border)', resize: 'vertical' }} />
                      <button className="crm-btn" onClick={() => handleSaveMeta(conv)}>Guardar notas/etiquetas</button>
                    </div>
                  </div>

                  <div className="crm-chat-mensajes">
                    {msgs.map((m) => (
                      <div key={m.id} className={`crm-mensaje crm-mensaje--${m.direction === 'inbound' ? 'contacto' : 'agente'}`}>
                        <div className="crm-mensaje-burbuja"><span className="crm-mensaje-contenido">{m.text}</span><span className="crm-mensaje-hora">{formatearHora(m.created_at)}</span></div>
                      </div>
                    ))}
                  </div>

                  <form className="crm-chat-input" onSubmit={(e) => { e.preventDefault(); handleSend(conv); }}>
                    <input value={textByConversation[conv.id] || ''} onChange={(e) => setTextByConversation((prev) => ({ ...prev, [conv.id]: e.target.value }))} onFocus={() => setActiveComposeConversationId(conv.id)} placeholder="Escribe un mensaje..." disabled={!canReply} />
                    <button className="crm-btn crm-btn--send" type="submit" disabled={!canReply || !(textByConversation[conv.id] || '').trim()}>Enviar</button>
                  </form>
                </section>
              );
            })}
            {error ? <div className="crm-chat-error">{error}</div> : null}
          </section>
        </main>
      )}
    </div>
  );
}

