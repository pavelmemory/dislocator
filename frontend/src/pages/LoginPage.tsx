import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { login as loginRequest } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../lib/auth';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)?.message;

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await loginRequest(loginValue.trim(), password);
      signIn(res.token, { login: res.login, role: res.role });
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err, 'Неверный логин или пароль'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Дислокатор</h1>
        <p className="auth-subtitle">Вход в систему</p>

        {successMessage && <div className="alert alert-success">{successMessage}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <label className="field">
          <span>Логин</span>
          <input
            type="text"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span>Пароль</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Вход…' : 'Войти'}
        </button>

        <p className="auth-hint">
          Есть ссылка-приглашение? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </form>
    </div>
  );
}
