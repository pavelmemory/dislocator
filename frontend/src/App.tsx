import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TablePage from './pages/TablePage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (loading) {
    return <div className="page-center">Загрузка…</div>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <TablePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
