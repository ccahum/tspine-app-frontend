import { useEffect } from 'react';

// Mismo corte de ancho que useResponsiveStyles — no se importa ese hook para no atarse a un
// componente con estado/reactividad: acá basta con revisar el ancho actual en cada pulsación.
const MOBILE_BREAKPOINT_PX = 768;

const FOCUSABLE_SELECTOR = 'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

/**
 * En móvil no hay tecla Tab — el botón "Intro"/"Ir" del teclado virtual debe saltar al siguiente
 * campo del formulario, igual que Tab en escritorio. Se limita a <input> (no <textarea>, ahí
 * Enter debe seguir insertando un salto de línea) y solo dentro de un <form> o de un modal
 * reconocido (className="modal-content-anim", el patrón que ya usan todos los modales de la
 * app) — si el campo no está en ninguno de los dos contenedores, no se hace nada (ej. la barra
 * de búsqueda del header no es parte de un formulario).
 */
export function useMobileEnterAsTab() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (window.innerWidth >= MOBILE_BREAKPOINT_PX) return;

      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;

      const container = target.closest('form') ?? target.closest<HTMLElement>('.modal-content-anim');
      if (!container) return;

      const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
      const currentIndex = focusables.indexOf(target);
      if (currentIndex === -1) return;

      const next = focusables[currentIndex + 1];
      if (!next) return; // último campo: se deja el comportamiento normal (ej. enviar el form)

      e.preventDefault();
      next.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
