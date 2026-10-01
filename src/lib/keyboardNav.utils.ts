/** Al presionar Enter en un campo dentro de un contenedor marcado con data-enter-nav-root, mueve
 * el foco al siguiente input/textarea/button habilitado y visible dentro de ese contenedor. No
 * hace nada si el campo no está dentro de uno. Compartido entre Cotizaciones y Remisión. */
export function focusNextInEnterNavRoot(current: HTMLElement) {
  const root = current.closest('[data-enter-nav-root]');
  if (!root) return;
  const listFocusable = () => Array.from(
    root.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled])'),
  ).filter(el => el.offsetParent !== null);
  const idx = listFocusable().indexOf(current);
  if (idx < 0) return;
  // Se espera un tick porque seleccionar un valor (p. ej. el Hospital) puede hacer que el
  // siguiente campo (p. ej. Cirugía) pase de deshabilitado/oculto a habilitado recién en el
  // siguiente render — antes de eso, no existe todavía como elemento enfocable.
  setTimeout(() => {
    const fresh = listFocusable();
    // Si el campo actual sigue en la lista (p. ej. un input de texto simple), el siguiente sigue
    // un índice adelante; si desapareció (p. ej. el buscador de Hospital se reemplazó por su
    // etiqueta ya seleccionada), lo que antes era el siguiente ahora quedó en su mismo índice.
    const target = fresh.includes(current) ? fresh[idx + 1] : fresh[idx];
    target?.focus();
  }, 0);
}
