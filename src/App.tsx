import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OperacionPage from './pages/operacion/OperacionPage';
import ProgramacionesPage from './pages/operacion/programaciones/ProgramacionesPage';
import ProgramacionDetailPage from './pages/operacion/programaciones/ProgramacionDetailPage';
import CalendarPage from './pages/operacion/calendario/CalendarPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function Private({ element }: { element: React.ReactNode }) {
  return <PrivateRoute>{element}</PrivateRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Private element={<DashboardPage />} />} />
        <Route path="/operacion" element={<Private element={<OperacionPage />} />} />
        <Route path="/operacion/programaciones" element={<Private element={<ProgramacionesPage />} />} />
        <Route path="/operacion/programaciones/:id" element={<Private element={<ProgramacionDetailPage />} />} />
        <Route path="/operacion/calendario" element={<Private element={<CalendarPage />} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
