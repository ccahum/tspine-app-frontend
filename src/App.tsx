import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/login/LoginPage';
import ResetPasswordPage from './pages/login/ResetPasswordPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OperacionPage from './pages/operacion/OperacionPage';
import ProgramacionesPage from './pages/operacion/programaciones/ProgramacionesPage';
import ProgramacionDetailPage from './pages/operacion/programaciones/ProgramacionDetailPage';
import RemisionesPage from './pages/operacion/remisiones/RemisionesPage';
import RemisionDetailPage from './pages/operacion/remisiones/RemisionDetailPage';
import ConsumoDetailPage from './pages/operacion/consumos/ConsumoDetailPage';
import ProductoValidadoDetailPage from './pages/operacion/consumos/ProductoValidadoDetailPage';
import ComisionDetailPage from './pages/operacion/consumos/ComisionDetailPage';
import RequisicionDetailPage from './pages/operacion/requisiciones/RequisicionDetailPage';
import CalendarPage from './pages/operacion/calendario/CalendarPage';
import ListasPrecioPage from './pages/operacion/listas-precio/ListasPrecioPage';
import PreciosEspecialesPage from './pages/operacion/precios-especiales/PreciosEspecialesPage';
import CotizacionesPage from './pages/operacion/cotizaciones/CotizacionesPage';
import AutorizacionConsumosPage from './pages/operacion/autorizacion-consumos/AutorizacionConsumosPage';
import SolicitudProgramacionPage from './pages/operacion/solicitud-programacion/SolicitudProgramacionPage';
import AdministracionPage from './pages/administracion/AdministracionPage';
import UsuariosAdminPage from './pages/administracion/usuarios/UsuariosAdminPage';
import TercerosAdminPage from './pages/administracion/terceros/TercerosAdminPage';
import VehicularPage from './pages/vehicular/VehicularPage';
import CatalogoVehicularPage from './pages/vehicular/catalogo/CatalogoVehicularPage';
import ControlViajesPage from './pages/vehicular/control-viajes/ControlViajesPage';
import { esSuperAdmin } from './lib/auth.utils';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function Private({ element }: { element: React.ReactNode }) {
  return <PrivateRoute>{element}</PrivateRoute>;
}

// El backend ya rechaza estas llamadas si el usuario no es SA — este guard solo evita que se
// vea la pantalla (el usuario ni siquiera debería llegar a intentarlo).
function PrivateSuperAdmin({ element }: { element: React.ReactNode }) {
  return (
    <PrivateRoute>
      {esSuperAdmin() ? <>{element}</> : <Navigate to="/dashboard" replace />}
    </PrivateRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<Private element={<DashboardPage />} />} />
        <Route path="/operacion" element={<Private element={<OperacionPage />} />} />
        <Route path="/operacion/programaciones" element={<Private element={<ProgramacionesPage />} />} />
        <Route path="/operacion/programaciones/:id" element={<Private element={<ProgramacionDetailPage />} />} />
        <Route path="/operacion/remision" element={<Private element={<RemisionesPage />} />} />
        <Route path="/operacion/remisiones/:id" element={<Private element={<RemisionDetailPage />} />} />
        <Route path="/operacion/consumos/:id" element={<Private element={<ConsumoDetailPage />} />} />
        <Route path="/operacion/producto-validado/:id" element={<Private element={<ProductoValidadoDetailPage />} />} />
        <Route path="/operacion/comisiones/:id" element={<Private element={<ComisionDetailPage />} />} />
        <Route path="/operacion/requisiciones/:id" element={<Private element={<RequisicionDetailPage />} />} />
        <Route path="/operacion/calendario" element={<Private element={<CalendarPage />} />} />
        <Route path="/operacion/listas-precio" element={<Private element={<ListasPrecioPage />} />} />
        <Route path="/operacion/precios-especiales" element={<Private element={<PreciosEspecialesPage />} />} />
        <Route path="/operacion/cotizaciones" element={<Private element={<CotizacionesPage />} />} />
        <Route path="/operacion/autorizacion-consumos" element={<Private element={<AutorizacionConsumosPage />} />} />
        <Route path="/operacion/solicitud-programacion" element={<Private element={<SolicitudProgramacionPage />} />} />
        <Route path="/administracion" element={<PrivateSuperAdmin element={<AdministracionPage />} />} />
        <Route path="/administracion/usuarios" element={<PrivateSuperAdmin element={<UsuariosAdminPage />} />} />
        <Route path="/administracion/terceros" element={<PrivateSuperAdmin element={<TercerosAdminPage />} />} />
        <Route path="/vehicular" element={<Private element={<VehicularPage />} />} />
        <Route path="/vehicular/catalogo" element={<Private element={<CatalogoVehicularPage />} />} />
        <Route path="/vehicular/control-viajes" element={<Private element={<ControlViajesPage />} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
