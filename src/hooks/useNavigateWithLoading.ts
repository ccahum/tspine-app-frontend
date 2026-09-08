import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { routeImports } from '../routeImports';

interface NavigationLoadingApi {
  start: () => void;
  end: () => void;
}

/** Layout.tsx la provee (ver ese archivo) — expone el estado de "cargando módulo" del shell fijo. */
export const NavigationLoadingContext = createContext<NavigationLoadingApi | null>(null);

/**
 * Navega a `path` mostrando el loader del shell fijo (Layout.tsx) mientras se descarga el chunk
 * de la página destino, si todavía no estaba cargado (por hover-prefetch o una visita anterior).
 * Usar esto en vez de navigate(path) directo para cualquier link/tarjeta que apunte a un módulo o
 * submódulo con code-splitting (ver routeImports.ts) — de lo contrario la navegación no muestra
 * ningún indicador de carga y la pantalla se siente "congelada" mientras baja el chunk.
 *
 * `routeKey` es opcional y solo hace falta para páginas de detalle, cuya URL real siempre lleva
 * un id variable (ej. /operacion/programaciones/ABC123) y por eso no coincide con ninguna clave
 * literal de routeImports — en ese caso se le pasa la clave de "plantilla" registrada ahí (ej.
 * '/operacion/programaciones/:id'). Si se omite, se usa el propio `path` como clave (el caso de
 * Sidebar y las tarjetas de módulo, donde la URL sí es fija).
 */
export function useNavigateWithLoading() {
  const navigate = useNavigate();
  const loading = useContext(NavigationLoadingContext);

  return (path: string | number, routeKey?: string) => {
    // navigate(-1)/(1) — "volver"/"adelante" en el historial. Va directo, sin loader: no hay un
    // chunk específico que precargar y la página destino normalmente ya estaba cargada.
    if (typeof path === 'number') {
      navigate(path);
      return;
    }
    const loadPromise = routeImports[routeKey ?? path]?.();
    if (loadPromise && loading) {
      loading.start();
      loadPromise.finally(() => loading.end());
      // Si start() y navigate() (que hace que el Outlet "suspenda" esperando el chunk) se
      // disparan en el mismo tick, React agrupa ambos cambios y no pinta nada hasta que la carga
      // termina. setTimeout corre después de que el navegador ya pintó el frame con el loader,
      // garantizando que se vea antes de disparar la navegación real.
      setTimeout(() => navigate(path), 50);
    } else {
      navigate(path);
    }
  };
}
