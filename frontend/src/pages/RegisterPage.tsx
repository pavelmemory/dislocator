import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSignupLink, register, type Role } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Адміністратор',
  viewer: 'Спостерігач',
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
      setError('Пароль повинен містити щонайменше 4 символи');
      return;
    }
    setSubmitting(true);
    try {
      await register(token, loginValue.trim(), password);
      navigate('/login', {
        replace: true,
        state: { message: 'Реєстрацію завершено. Увійдіть.' },
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Не вдалося завершити реєстрацію'));
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
        <h1>Дислокація вагонів</h1>
        <p className="auth-subtitle">Реєстрація</p>

        {token === '' && (
          <div className="alert alert-error">
            Посилання недійсне або протерміноване
          </div>
        )}

        {token !== '' && linkQuery.isLoading && (
          <div className="alert">Перевірка посилання…</div>
        )}

        {token !== '' && invalid && !linkQuery.isLoading && (
          <div className="alert alert-error">Посилання недійсне або протерміноване</div>
        )}

        {linkQuery.data && linkQuery.data.valid && (
          <>
            <div className="alert alert-info">
              Роль: <strong>{ROLE_LABELS[linkQuery.data.role]}</strong>
            </div>

            <form onSubmit={onSubmit}>
              {error && <div className="alert alert-error">{error}</div>}

              <label className="field">
                <span>Логін</span>
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
                <span>Пароль (щонайменше 4 символи)</span>
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
                {submitting ? 'Реєстрація…' : 'Зареєструватися'}
              </button>
            </form>
          </>
        )}

        <p className="auth-hint">
          Вже маєте акаунт? <Link to="/login">Увійти</Link>
        </p>
      </div>
    </div>
  );
}
