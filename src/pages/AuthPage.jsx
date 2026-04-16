import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './auth.css';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]       = useState('login'); // 'login' | 'signup'
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email, password);
        if (err) throw err;
      } else {
        const { error: err } = await signUp(email, password);
        if (err) throw err;
        setInfo('Revisa tu correo para confirmar tu cuenta.');
      }
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand__eyebrow">Herramientas XML del SII</span>
          <h1 className="auth-brand__title">dtepropdf</h1>
        </div>

        <h2 className="auth-card__heading">
          {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
        </h2>

        <form className="auth-form" onSubmit={handle}>
          <div className="auth-field">
            <label className="auth-label">Correo electrónico</label>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.cl"
              required
              autoFocus
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Contraseña</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && <p className="auth-error">{error}</p>}
          {info  && <p className="auth-info">{info}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Cargando…' : mode === 'login' ? 'Entrar' : 'Registrarse'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'login' ? (
            <>¿No tienes cuenta?{' '}
              <button className="auth-toggle__btn" onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>
                Regístrate
              </button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{' '}
              <button className="auth-toggle__btn" onClick={() => { setMode('login'); setError(''); setInfo(''); }}>
                Inicia sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))        return 'Confirma tu correo antes de entrar.';
  if (msg.includes('User already registered'))    return 'Ya existe una cuenta con ese correo.';
  if (msg.includes('Password should be'))         return 'La contraseña debe tener al menos 6 caracteres.';
  return msg;
}
