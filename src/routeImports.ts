// Fuente única de los import() dinámicos por ruta — App.tsx los usa para armar los React.lazy(),
// y Sidebar los usa para precargar el chunk de una página en cuanto el mouse pasa por su enlace,
// para que al hacer clic ya esté (o casi) descargado en vez de mostrar el loader.
export const routeImports: Record<string, () => Promise<unknown>> = {
  '/reset-password': () => import('./pages/login/ResetPasswordPage'),
  '/dashboard': () => import('./pages/dashboard/DashboardPage'),
  '/operacion': () => import('./pages/operacion/OperacionPage'),
  '/operacion/programaciones': () => import('./pages/operacion/programaciones/ProgramacionesPage'),
  '/operacion/remision': () => import('./pages/operacion/remisiones/RemisionesPage'),
  '/operacion/calendario': () => import('./pages/operacion/calendario/CalendarPage'),
  '/operacion/listas-precio': () => import('./pages/operacion/listas-precio/ListasPrecioPage'),
  '/operacion/precios-especiales': () => import('./pages/operacion/precios-especiales/PreciosEspecialesPage'),
  '/operacion/cotizaciones': () => import('./pages/operacion/cotizaciones/CotizacionesPage'),
  '/operacion/autorizacion-consumos': () => import('./pages/operacion/autorizacion-consumos/AutorizacionConsumosPage'),
  '/operacion/solicitud-programacion': () => import('./pages/operacion/solicitud-programacion/SolicitudProgramacionPage'),
  '/administracion': () => import('./pages/administracion/AdministracionPage'),
  '/administracion/usuarios': () => import('./pages/administracion/usuarios/UsuariosAdminPage'),
  '/administracion/terceros': () => import('./pages/administracion/terceros/TercerosAdminPage'),
  '/vehicular': () => import('./pages/vehicular/VehicularPage'),
  '/vehicular/catalogo': () => import('./pages/vehicular/catalogo/CatalogoVehicularPage'),
  '/vehicular/control-viajes': () => import('./pages/vehicular/control-viajes/ControlViajesPage'),
};

export function prefetchRoute(path: string) {
  routeImports[path]?.();
}
