import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Loader } from 'lucide-react';
import LoginPage from './pages/login/LoginPage';
// Página casi universal justo después del login — se deja en el bundle principal (pesa poco)
// para que esa primera transición nunca muestre el loader de carga.
import DashboardPage from './pages/dashboard/DashboardPage';
import Layout from './components/layout/Layout';
import { esSuperAdmin } from './lib/auth.utils';
import { routeImports } from './routeImports';

// as any: routeImports está tipado como () => Promise<unknown> para que Sidebar no necesite
// conocer el tipo real del módulo — cada entrada individual sí es un import() válido de
// componente, TS solo no puede verlo a través del Record genérico.
const ResetPasswordPage = lazy(routeImports['/reset-password'] as any);
const OperacionPage = lazy(routeImports['/operacion'] as any);
const ProgramacionesPage = lazy(routeImports['/operacion/programaciones'] as any);
const ProgramacionDetailPage = lazy(routeImports['/operacion/programaciones/:id'] as any);
const RemisionesPage = lazy(routeImports['/operacion/remision'] as any);
const RemisionDetailPage = lazy(routeImports['/operacion/remisiones/:id'] as any);
const ConsumoDetailPage = lazy(routeImports['/operacion/consumos/:id'] as any);
const ProductoValidadoDetailPage = lazy(routeImports['/operacion/producto-validado/:id'] as any);
const ComisionDetailPage = lazy(routeImports['/operacion/comisiones/:id'] as any);
const RequisicionDetailPage = lazy(routeImports['/operacion/requisiciones/:id'] as any);
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

// Ruta padre de todo lo autenticado: valida el token una sola vez y renderiza el shell fijo
// (Layout → Header/Sidebar + <Outlet/>). Antes cada página individual se envolvía en <Layout> y
// verificaba el token por su cuenta, lo que hacía que Header/Sidebar se desmontaran en cada
// navegación entre chunks — ver el comentario en Layout.tsx.
function PrivateShell() {
  const token = localStorage.getItem('accessToken');
  return token ? <Layout /> : <Navigate to="/login" replace />;
}

// El backend ya rechaza estas llamadas si el usuario no es SA — este guard solo evita que se
// vea la pantalla (el usuario ni siquiera debería llegar a intentarlo).
function SuperAdminGuard() {
  return esSuperAdmin() ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/reset-password"
          element={(
            <Suspense fallback={<PageLoader />}>
              <ResetPasswordPage />
            </Suspense>
          )}
        />

        <Route element={<PrivateShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/operacion" element={<OperacionPage />} />
          <Route path="/operacion/programaciones" element={<ProgramacionesPage />} />
          <Route path="/operacion/programaciones/:id" element={<ProgramacionDetailPage />} />
          <Route path="/operacion/remision" element={<RemisionesPage />} />
          <Route path="/operacion/remisiones/:id" element={<RemisionDetailPage />} />
          <Route path="/operacion/consumos/:id" element={<ConsumoDetailPage />} />
          <Route path="/operacion/producto-validado/:id" element={<ProductoValidadoDetailPage />} />
          <Route path="/operacion/comisiones/:id" element={<ComisionDetailPage />} />
          <Route path="/operacion/requisiciones/:id" element={<RequisicionDetailPage />} />
          <Route path="/operacion/calendario" element={<CalendarPage />} />
          <Route path="/operacion/listas-precio" element={<ListasPrecioPage />} />
          <Route path="/operacion/precios-especiales" element={<PreciosEspecialesPage />} />
          <Route path="/operacion/cotizaciones" element={<CotizacionesPage />} />
          <Route path="/operacion/autorizacion-consumos" element={<AutorizacionConsumosPage />} />
          <Route path="/operacion/solicitud-programacion" element={<SolicitudProgramacionPage />} />
          <Route path="/vehicular" element={<VehicularPage />} />
          <Route path="/vehicular/catalogo" element={<CatalogoVehicularPage />} />
          <Route path="/vehicular/control-viajes" element={<ControlViajesPage />} />

          <Route element={<SuperAdminGuard />}>
            <Route path="/administracion" element={<AdministracionPage />} />
            <Route path="/administracion/usuarios" element={<UsuariosAdminPage />} />
            <Route path="/administracion/terceros" element={<TercerosAdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
