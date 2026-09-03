import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import LoginPage from './pages/login/LoginPage';
import { esSuperAdmin } from './lib/auth.utils';

const ResetPasswordPage = lazy(() => import('./pages/login/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const OperacionPage = lazy(() => import('./pages/operacion/OperacionPage'));
const ProgramacionesPage = lazy(() => import('./pages/operacion/programaciones/ProgramacionesPage'));
const ProgramacionDetailPage = lazy(() => import('./pages/operacion/programaciones/ProgramacionDetailPage'));
const RemisionesPage = lazy(() => import('./pages/operacion/remisiones/RemisionesPage'));
const RemisionDetailPage = lazy(() => import('./pages/operacion/remisiones/RemisionDetailPage'));
const ConsumoDetailPage = lazy(() => import('./pages/operacion/consumos/ConsumoDetailPage'));
const ProductoValidadoDetailPage = lazy(() => import('./pages/operacion/consumos/ProductoValidadoDetailPage'));
const ComisionDetailPage = lazy(() => import('./pages/operacion/consumos/ComisionDetailPage'));
const RequisicionDetailPage = lazy(() => import('./pages/operacion/requisiciones/RequisicionDetailPage'));
const CalendarPage = lazy(() => import('./pages/operacion/calendario/CalendarPage'));
const ListasPrecioPage = lazy(() => import('./pages/operacion/listas-precio/ListasPrecioPage'));
const PreciosEspecialesPage = lazy(() => import('./pages/operacion/precios-especiales/PreciosEspecialesPage'));
const CotizacionesPage = lazy(() => import('./pages/operacion/cotizaciones/CotizacionesPage'));
const AutorizacionConsumosPage = lazy(() => import('./pages/operacion/autorizacion-consumos/AutorizacionConsumosPage'));
const SolicitudProgramacionPage = lazy(() => import('./pages/operacion/solicitud-programacion/SolicitudProgramacionPage'));
const AdministracionPage = lazy(() => import('./pages/administracion/AdministracionPage'));
const UsuariosAdminPage = lazy(() => import('./pages/administracion/usuarios/UsuariosAdminPage'));
const TercerosAdminPage = lazy(() => import('./pages/administracion/terceros/TercerosAdminPage'));
const VehicularPage = lazy(() => import('./pages/vehicular/VehicularPage'));
const CatalogoVehicularPage = lazy(() => import('./pages/vehicular/catalogo/CatalogoVehicularPage'));
const ControlViajesPage = lazy(() => import('./pages/vehicular/control-viajes/ControlViajesPage'));

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Loader className="spinner" size={32} color="#6b8c1f" />
    </div>
  );
}

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
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
