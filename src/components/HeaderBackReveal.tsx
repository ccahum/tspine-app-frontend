import { MaterialIcon } from './icons/MaterialIcon';

const ARROW_SIZE = 32;
// El desplazamiento al hacer hover (44px) vive en index.css (.header-back-reveal:hover
// .header-back-content) porque la animación se maneja por CSS, no por estado de React.

interface HeaderBackRevealProps {
  /** Ícono del módulo/submódulo, ya con su propio color y tamaño (ej. <Calendar size={20} color="#4d7a13"/>). */
  icon: React.ReactNode;
  onBack: () => void;
  /** Lado del recuadro del ícono, en px. */
  size?: number;
  /** Radio de borde del recuadro del ícono, en px. */
  badgeRadius?: number;
  /** Título (y cualquier otro contenido) que debe moverse junto con el ícono, no quedarse fijo. */
  children: React.ReactNode;
  /**
   * true en vistas sin cursor/hover (móvil): ahí no existe el gesto que dispara la animación de
   * revelar la flecha, así que en vez de eso el propio ícono se vuelve el botón de "volver" (sin
   * flecha aparte). Pásalo como `mobileIconAsBack={isMobile}`.
   */
  mobileIconAsBack?: boolean;
}

/**
 * Botón "Volver" combinado con el ícono + título del módulo/submódulo.
 *
 * Escritorio (mobileIconAsBack=false): el bloque ícono+título nace tapando la flecha (el ícono
 * queda justo en su misma posición) y, al pasar el cursor por encima, todo el bloque se corre a
 * la derecha revelando la flecha debajo. El hover que dispara la animación se maneja por CSS (ver
 * .header-back-reveal en index.css) para que no haya parpadeos por reconciliación de React.
 *
 * Móvil (mobileIconAsBack=true): no hay hover, así que en vez del truco de tapar/revelar, el
 * propio ícono es el botón que navega hacia atrás — un solo elemento, sin animación.
 */
export default function HeaderBackReveal({ icon, onBack, size = 40, badgeRadius = 12, children, mobileIconAsBack = false }: HeaderBackRevealProps) {
  if (mobileIconAsBack) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <button
          type="button"
          onClick={onBack}
          title="Volver"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size, borderRadius: badgeRadius, flexShrink: 0,
            backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2',
            cursor: 'pointer', padding: 0, outline: 'none', boxShadow: 'none',
            appearance: 'none' as const, WebkitAppearance: 'none' as const,
          }}
        >
          {icon}
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className="header-back-reveal" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={onBack}
        className="header-back-arrow"
        style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: ARROW_SIZE, height: ARROW_SIZE, border: 'none', background: 'transparent',
          borderRadius: '8px', color: '#6b7280', cursor: 'pointer', outline: 'none', boxShadow: 'none',
          appearance: 'none' as const, WebkitAppearance: 'none' as const,
          transition: 'background-color 0.15s ease, color 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; e.currentTarget.style.color = '#4d7a13'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
        title="Volver"
      >
        <MaterialIcon name="arrow_back" size={18} />
      </button>
      <div className="header-back-content" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <span
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: size, height: size, borderRadius: badgeRadius, flexShrink: 0,
            backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2',
            pointerEvents: 'none' as const,
          }}
        >
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}
