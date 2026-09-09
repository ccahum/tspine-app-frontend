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
      // El caso común es que el chunk YA esté en caché (prefetch por hover, o porque ya visitaste
      // esa página antes — "Volver" casi siempre cae acá). Ahí loadPromise resuelve casi al
      // instante, y aunque antes se garantizaba un mínimo de tiempo visible para el loader, ese
      // destello de "cargando" de todos modos se sentía como un parpadeo — para algo que en
      // realidad no tardó nada, no debería verse ningún loader.
      //
      // Por eso ahora el loader NO se prende de inmediato: se arma un timer de 100ms, y solo si
      // loadPromise sigue sin resolver para cuando ese timer dispara (o sea, la carga sí está
      // tardando de verdad) se muestra el loader. Si loadPromise gana la carrera, se navega directo
      // sin mostrar nada — se siente instantáneo, como antes de este sistema de loader.
      let mostroLoader = false;
      const timer = setTimeout(() => {
        mostroLoader = true;
        loading.start();
      }, 100);

      loadPromise.then(() => {
        clearTimeout(timer);
        if (mostroLoader) {
          // Si sí llegó a mostrarse, se le da un mínimo de tiempo visible antes de navegar (mismo
          // motivo que antes: que el navegador ya haya pintado el loader antes de que Outlet
          // "suspenda" esperando el chunk) — acá ya sabemos que la carga tardó, así que este
          // mínimo no se siente como un parpadeo extra, es parte de la espera real.
          setTimeout(() => { navigate(path); loading.end(); }, 50);
        } else {
          navigate(path);
        }
      });
    } else {
      navigate(path);
    }
  };
}
