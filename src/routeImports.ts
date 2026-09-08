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
  // Páginas de detalle: la URL real siempre lleva un id variable (ej. /operacion/programaciones/ABC123),
  // así que se registran bajo una clave de "plantilla" (con :id) en vez de la ruta exacta — quien navega
  // a una de estas páginas debe pasarle esta clave explícitamente a useNavigateWithLoading (ver ese hook).
  '/operacion/programaciones/:id': () => import('./pages/operacion/programaciones/ProgramacionDetailPage'),
  '/operacion/remisiones/:id': () => import('./pages/operacion/remisiones/RemisionDetailPage'),
  '/operacion/consumos/:id': () => import('./pages/operacion/consumos/ConsumoDetailPage'),
  '/operacion/producto-validado/:id': () => import('./pages/operacion/consumos/ProductoValidadoDetailPage'),
  '/operacion/comisiones/:id': () => import('./pages/operacion/consumos/ComisionDetailPage'),
  '/operacion/requisiciones/:id': () => import('./pages/operacion/requisiciones/RequisicionDetailPage'),
};

export function prefetchRoute(path: string) {
  routeImports[path]?.();
}
