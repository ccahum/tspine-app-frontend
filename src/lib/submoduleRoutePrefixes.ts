// Tabla de prefijos de RUTA del frontend por submódulo, usada por permissions.utils.ts para
// decidir qué puede ver/navegar un perfil restringido. Es la contraparte de SUBMODULE_REGISTRY
// en el backend (src/commons/authorization/submodule-registry.ts, apiPrefixes) — ahí son
// prefijos de la API, acá son prefijos de ruta del router, y no siempre coinciden 1:1 (ej.
// Remisión: la ruta es /operacion/remision pero también cubre varias rutas de detalle sueltas).
// Si agregas o cambias un submódulo, revisa también ese archivo.
export const ROUTE_PREFIXES: Record<string, string[]> = {
  '/operacion/programaciones': ['/operacion/programaciones'],
  '/operacion/cotizaciones': ['/operacion/cotizaciones'],
  '/operacion/remision': [
    '/operacion/remision',
    '/operacion/remisiones',
    '/operacion/consumos',
    '/operacion/producto-validado',
    '/operacion/comisiones',
    '/operacion/requisiciones',
  ],
  '/operacion/autorizacion-consumos': ['/operacion/autorizacion-consumos'],
  '/operacion/calendario': ['/operacion/calendario'],
  '/operacion/listas-precio': ['/operacion/listas-precio'],
  '/operacion/precios-especiales': ['/operacion/precios-especiales'],
  '/vehicular/catalogo': ['/vehicular/catalogo'],
  '/vehicular/control-viajes': ['/vehicular/control-viajes'],
};
