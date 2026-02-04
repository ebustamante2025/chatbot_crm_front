import { useState, FormEvent } from 'react'
import { login, register, setToken, setStoredUser } from './services/api'
import './Login.css'

interface LoginProps {
  onSuccess: () => void
}

const ROLES = [
  { value: 'ASESOR', label: 'Asesor' },
  { value: 'AGENTE', label: 'Agente' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'VENTAS', label: 'Ventas' },
  { value: 'ADMIN', label: 'Administrador' },
]

export default function Login({ onSuccess }: LoginProps) {
  const [modoRegistro, setModoRegistro] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [rol, setRol] = useState('ASESOR')
  const [documento, setDocumento] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registroOk, setRegistroOk] = useState(false)

  const handleSubmitLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Usuario y contraseña son obligatorios')
      return
    }
    setLoading(true)
    try {
      const data = await login(username.trim(), password)
      setToken(data.token)
      setStoredUser(data.usuario)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Usuario y contraseña son obligatorios')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== passwordConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      await register({
        username: username.trim(),
        password,
        rol,
        documento: documento.trim() || undefined,
      })
      setRegistroOk(true)
      setPassword('')
      setPasswordConfirm('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse')
    } finally {
      setLoading(false)
    }
  }

  const toggleModo = () => {
    setModoRegistro((v) => !v)
    setError(null)
    setRegistroOk(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">CRM ChatBot</h1>
        <p className="login-subtitle">
          {modoRegistro ? 'Registro de usuario — Crear cuenta de soporte' : 'Inicia sesión con tu cuenta'}
        </p>

        {modoRegistro ? (
          <form onSubmit={handleSubmitRegister} className="login-form">
            {error && <div className="login-error">{error}</div>}
            {registroOk && (
              <div className="login-success">
                Usuario registrado. Ya puedes iniciar sesión.
              </div>
            )}
            <label className="login-label">Usuario *</label>
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nombre de usuario"
              autoComplete="username"
              disabled={loading}
            />
            <label className="login-label">Contraseña * (mín. 6 caracteres)</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="new-password"
              disabled={loading}
            />
            <label className="login-label">Confirmar contraseña *</label>
            <input
              type="password"
              className="login-input"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="Repetir contraseña"
              autoComplete="new-password"
              disabled={loading}
            />
            <label className="login-label">Rol</label>
            <select
              className="login-input"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              disabled={loading}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <label className="login-label">Documento (opcional)</label>
            <input
              type="text"
              className="login-input"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Cédula o NIT"
              disabled={loading}
            />
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Registrando...' : 'Registrarse'}
            </button>
            <button type="button" className="login-link" onClick={toggleModo}>
              ¿Ya tienes cuenta? Iniciar sesión
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmitLogin} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <label className="login-label">Usuario</label>
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: admin, agente1"
              autoComplete="username"
              disabled={loading}
            />
            <label className="login-label">Contraseña</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              disabled={loading}
            />
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </button>
            <button type="button" className="login-link" onClick={toggleModo}>
              ¿No tienes cuenta? Registro de usuario
            </button>
            <p className="login-hint">Datos de prueba (seed): admin / admin123 o agente1 / admin123</p>
          </form>
        )}
      </div>
    </div>
  )
}
