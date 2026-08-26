import { useEffect, type RefObject } from 'react';

// El scroll nativo de la rueda del mouse avanza ~100px por "click", lo que en tablas con filas
// cortas se siente como saltar varios registros de golpe. Este hook intercepta el wheel con un
// listener nativo (no pasivo, por eso no alcanza con el prop onWheel de React, que React adjunta
// como pasivo) y escala + anima la distancia real del gesto, en vez de aplicar un salto fijo.
//
// speedMultiplier: por defecto avanza ~1 fila por "click" de rueda. Las tablas que paginan a 300
// registros usan 3 (definido por el usuario) para poder recorrerlas más rápido.
export function useSmoothWheelScroll(ref: RefObject<HTMLElement | null>, deps: unknown[] = [], speedMultiplier = 1) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let target = el.scrollTop;
    let animating = false;
    // Distingue un scrollTop que nosotros mismos escribimos (dentro de step()) de uno que vino de
    // otra fuente (arrastrar la barra de scroll, teclado, touch) — sin esto, si el usuario agarra
    // la barra mientras la animación de la rueda todavía no llega a su destino, cada frame la
    // vuelve a jalar hacia ese destino viejo y el arrastre se siente trabado/lento.
    let programmatic = false;

    const step = () => {
      const current = el.scrollTop;
      const diff = target - current;
      programmatic = true;
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = target;
        programmatic = false;
        animating = false;
        return;
      }
      el.scrollTop = current + diff * 0.25;
      programmatic = false;
      requestAnimationFrame(step);
    };

    const handleWheel = (e: WheelEvent) => {
      // Si el gesto es principalmente horizontal (shift+rueda, swipe de trackpad), se deja pasar
      // sin tocarlo — algunas de estas tablas también scrollean horizontalmente por columnas.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const max = el.scrollHeight - el.clientHeight;
      target = Math.min(max, Math.max(0, target + e.deltaY * 0.35 * speedMultiplier));
      if (!animating) {
        animating = true;
        requestAnimationFrame(step);
      }
    };

    // El usuario movió el scroll por su cuenta (arrastrando la barra, con el teclado, etc.) —
    // le cedemos el control de inmediato en vez de seguir animando hacia el destino viejo.
    const handleScroll = () => {
      if (programmatic) return;
      animating = false;
      target = el.scrollTop;
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('scroll', handleScroll);
    };
  }, deps);
}
