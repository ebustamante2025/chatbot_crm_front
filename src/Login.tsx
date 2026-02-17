import { useState, FormEvent } from 'react'
import { login, setToken, setStoredUser, cambiarPasswordPropia } from './services/api'
import './Login.css'

interface LoginProps {
  onSuccess: () => void
}

export default function Login({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Estado para forzar cambio de contraseña
  const [debeCambiar, setDebeCambiar] = useState(false)
  const [nuevaPassword, setNuevaPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)

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

      // Si tiene contraseña temporal, forzar cambio antes de entrar
      if (data.debe_cambiar_password) {
        setDebeCambiar(true)
      } else {
        onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleCambiarPassword = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setMensajeExito(null)

    if (!nuevaPassword || !confirmarPassword) {
      setError('Todos los campos son obligatorios')
      return
    }
    if (nuevaPassword.length < 12) {
      setError('La nueva contraseña debe tener al menos 12 caracteres')
      return
    }
    if (nuevaPassword !== confirmarPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      await cambiarPasswordPropia(nuevaPassword)
      setMensajeExito('Contraseña actualizada correctamente. Ingresando...')
      // Esperar un momento y luego entrar
      setTimeout(() => {
        onSuccess()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    } finally {
      setLoading(false)
    }
  }

  // Formulario de cambio obligatorio de contraseña
  if (debeCambiar) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo-wrap">
            <img src="/logo-hgi.png" alt="HGI" className="login-logo" />
          </div>
          <h1 className="login-title">CRM ChatBot</h1>
          <p className="login-subtitle">Cambio de contraseña obligatorio</p>
          <p className="login-hint-warning">
            Su contraseña es temporal. Debe establecer una nueva contraseña para continuar.
          </p>

          <form onSubmit={handleCambiarPassword} className="login-form">
            {error && <div className="login-error">{error}</div>}
            {mensajeExito && <div className="login-success">{mensajeExito}</div>}

            <label className="login-label">Nueva contraseña (mín. 12 caracteres)</label>
            <input
              type="password"
              className="login-input"
              value={nuevaPassword}
              onChange={(e) => setNuevaPassword(e.target.value)}
              placeholder="Ingrese nueva contraseña"
              autoComplete="new-password"
              disabled={loading || !!mensajeExito}
            />
            <label className="login-label">Confirmar nueva contraseña</label>
            <input
              type="password"
              className="login-input"
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              placeholder="Repita la nueva contraseña"
              autoComplete="new-password"
              disabled={loading || !!mensajeExito}
            />
            <button type="submit" className="login-btn" disabled={loading || !!mensajeExito || nuevaPassword.length < 12}>
              {loading ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo-wrap">
          <img src="/logo-hgi.png" alt="HGI" className="login-logo" />
        </div>
        <h1 className="login-title">CRM ChatBot</h1>
        <p className="login-subtitle">Inicio de Sesión</p>

        <form onSubmit={handleSubmitLogin} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <input
            type="text"
            className="login-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Usuario"
            autoComplete="username"
            disabled={loading}
          />
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
            {loading ? 'Entrando...' : '→  Ingresar'}
          </button>
          <p className="login-hint">Contacte al administrador si no tiene cuenta.</p>
        </form>
      </div>

      <div className="login-browsers-info">
        <span>Navegadores:</span>
        <span>Google Chrome v81 o superior</span>
        <span>Firefox v75 o superior</span>
      </div>
    </div>
  )
}
