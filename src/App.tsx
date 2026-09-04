import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import LoginPage from './pages/login/LoginPage';
// Página casi universal justo después del login — se deja en el bundle principal (pesa poco)
// para que esa primera transición nunca muestre el loader de carga.
import DashboardPage from './pages/dashboard/DashboardPage';
import { esSuperAdmin } from './lib/auth.utils';
import { routeImports } from './routeImports';

// as any: routeImports está tipado como () => Promise<unknown> para que Sidebar no necesite
// conocer el tipo real del módulo — cada entrada individual sí es un import() válido de
// componente, TS solo no puede verlo a través del Record genérico.
const ResetPasswordPage = lazy(routeImports['/reset-password'] as any);
const OperacionPage = lazy(routeImports['/operacion'] as any);
const ProgramacionesPage = lazy(routeImports['/operacion/programaciones'] as any);
const ProgramacionDetailPage = lazy(() => import('./pages/operacion/programaciones/ProgramacionDetailPage'));
const RemisionesPage = lazy(routeImports['/operacion/remision'] as any);
const RemisionDetailPage = lazy(() => import('./pages/operacion/remisiones/RemisionDetailPage'));
const ConsumoDetailPage = lazy(() => import('./pages/operacion/consumos/ConsumoDetailPage'));
const ProductoValidadoDetailPage = lazy(() => import('./pages/operacion/consumos/ProductoValidadoDetailPage'));
const ComisionDetailPage = lazy(() => import('./pages/operacion/consumos/ComisionDetailPage'));
const RequisicionDetailPage = lazy(() => import('./pages/operacion/requisiciones/RequisicionDetailPage'));
const CalendarPage = lazy(routeImports['/operacion/calendario'] as any);
const ListasPrecioPage = lazy(routeImports['/operacion/listas-precio'] as any);
const PreciosEspecialesPage = lazy(routeImports['/operacion/precios-especiales'] as any);
const CotizacionesPage = lazy(routeImports['/operacion/cotizaciones'] as any);
const AutorizacionConsumosPage = lazy(routeImports['/operacion/autorizacion-consumos'] as any);
const SolicitudProgramacionPage = lazy(routeImports['/operacion/solicitud-programacion'] as any);
const AdministracionPage = lazy(routeImports['/administracion'] as any);
const UsuariosAdminPage = lazy(routeImports['/administracion/usuarios'] as any);
const TercerosAdminPage = lazy(routeImports['/administracion/terceros'] as any);
const VehicularPage = lazy(routeImports['/vehicular'] as any);
const CatalogoVehicularPage = lazy(routeImports['/vehicular/catalogo'] as any);
const ControlViajesPage = lazy(routeImports['/vehicular/control-viajes'] as any);

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
