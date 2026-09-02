// Top-right gear menu. Holds account + admin actions:
//   - logout (all users)
//   - file upload (admin only)
//   - signup-link creation (admin only)
import { useEffect, useRef, useState } from 'react';
import {
  createSignupLink,
  uploadImport,
  type CreateSignupLinkResponse,
  type ImportResponse,
  type Role,
} from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../lib/auth';

export default function GearMenu({ onImported }: { onImported: () => void }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="gear" ref={rootRef}>
      <button
        type="button"
        className="gear-btn"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon />
      </button>

      {open && (
        <div className="gear-menu" role="menu">
          <div className="gear-user">
            <strong>{user?.login}</strong>
            <span className="role-tag">
              {isAdmin ? 'администратор' : 'наблюдатель'}
            </span>
          </div>

          {isAdmin && (
            <>
              <div className="gear-section">
                <UploadBox onImported={onImported} />
              </div>
              <div className="gear-section">
                <SignupLinkBox />
              </div>
            </>
          )}

          <div className="gear-section">
            <button
              type="button"
              className="btn gear-logout"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
            >
              Выйти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
      />
    </svg>
  );
}

function UploadBox({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await uploadImport(file);
      setResult(res);
      onImported();
    } catch (err) {
      setError(apiErrorMessage(err, 'Не удалось загрузить файл'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="gear-block">
      <h4>Загрузить файл</h4>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Загрузка…' : 'Выбрать .xlsx'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}
      {result && (
        <div className="alert alert-success">
          Обработано строк: <strong>{result.row_count}</strong> (добавлено{' '}
          {result.inserted}, обновлено {result.updated})
          {result.warnings && result.warnings.length > 0 && (
            <details className="warnings">
              <summary>Предупреждения ({result.warnings.length})</summary>
              <ul>
                {result.warnings.map((wn, i) => (
                  <li key={i}>{wn}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SignupLinkBox() {
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<CreateSignupLinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onCreate() {
    setError(null);
    setLink(null);
    setCopied(false);
    setBusy(true);
    try {
      const res = await createSignupLink(role);
      setLink(res);
    } catch (err) {
      setError(apiErrorMessage(err, 'Не удалось создать ссылку'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="gear-block">
      <h4>Пригласить пользователя</h4>
      <div className="row">
        <label className="field inline">
          <span>Роль</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="viewer">Наблюдатель</option>
            <option value="admin">Администратор</option>
          </select>
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onCreate}>
          {busy ? 'Создание…' : 'Создать ссылку'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {link && (
        <div className="alert alert-info link-result">
          <input
            className="link-url"
            readOnly
            value={link.url}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn btn-sm" onClick={copy}>
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
        </div>
      )}
    </div>
  );
}
