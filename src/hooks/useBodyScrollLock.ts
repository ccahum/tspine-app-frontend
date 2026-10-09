import { useEffect } from 'react';

// `overflow:hidden` solo en el body no basta: en iOS Safari el fondo se sigue pudiendo deslizar
// con el dedo, y en general deja que el contenido que quede DETRÁS de un modal (otro modal, o la
// página) se siga scrolleando con la rueda del mouse mientras el modal de encima está abierto.
// Fijar la posición del body en el scroll actual sí lo bloquea de verdad — mismo patrón que ya
// usaba Layout.tsx para el drawer de navegación móvil.
//
// Lleva un contador en vez de solo "set on mount / unset on unmount" porque los modales de este
// proyecto se anidan (ej. "Nuevo insumo" sobre "Agregar Requisición" sobre el detalle de una
// Requisición): si cada uno bloqueara y desbloqueara el body de forma independiente, cerrar el
// modal de encima desbloquearía el fondo aunque el de abajo siga abierto. Con el contador, el
// body solo se desbloquea de verdad cuando el ÚLTIMO modal que lo pidió se cierra.
let lockCount = 0;
let savedScrollY = 0;

function applyLock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
  }
  lockCount++;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    const body = document.body;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    applyLock();
    return () => releaseLock();
  }, [locked]);
}
