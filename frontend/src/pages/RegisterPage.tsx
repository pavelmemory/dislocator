import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSignupLink, register, type Role } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Администратор',
  viewer: 'Наблюдатель',
};

export default function RegisterPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const linkQuery = useQuery({
    queryKey: ['signup-link', token],
    queryFn: () => getSignupLink(token),
    enabled: token !== '',
    retry: false,
  });

  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 4) {
      setError('Пароль должен содержать не менее 4 символов');
      return;
    }
    setSubmitting(true);
    try {
      await register(token, loginValue.trim(), password);
      navigate('/login', {
        replace: true,
        state: { message: 'Регистрация завершена. Теперь вы можете войти.' },
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Не удалось завершить регистрацию'));
    } finally {
      setSubmitting(false);
    }
  }

  const invalid =
    token === '' ||
    linkQuery.isError ||
    (linkQuery.data && !linkQuery.data.valid);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Дислокатор</h1>
        <p className="auth-subtitle">Регистрация</p>

        {token === '' && (
          <div className="alert alert-error">
            Отсутствует токен приглашения. Ссылка недействительна.
          </div>
        )}

        {token !== '' && linkQuery.isLoading && (
          <div className="alert">Проверка ссылки…</div>
        )}

        {token !== '' && invalid && !linkQuery.isLoading && (
          <div className="alert alert-error">Ссылка недействительна или истекла.</div>
        )}

        {linkQuery.data && linkQuery.data.valid && (
          <>
            <div className="alert alert-info">
              Вам будет назначена роль:{' '}
              <strong>{ROLE_LABELS[linkQuery.data.role]}</strong>
            </div>

            <form onSubmit={onSubmit}>
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
                <span>Пароль (минимум 4 символа)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={4}
                  required
                />
              </label>

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Регистрация…' : 'Зарегистрироваться'}
              </button>
            </form>
          </>
        )}

        <p className="auth-hint">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
