import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ChevronDown } from 'lucide-react';

export interface OptionDropdownOption {
  id: string;
  label: string;
}

export interface OptionDropdownHandle {
  /** Abre la lista de opciones de forma programática — p. ej. para encadenar "al elegir esto, se
   * despliega el siguiente selector" (ver Hora/Minuto en Nueva Programación). Si el selector está
   * deshabilitado en el momento de llamarlo, queda pendiente y se muestra solo en cuanto se habilite. */
  open: () => void;
  /** Cierra la lista si estaba abierta — p. ej. si "open()" se llamó pero el flujo saltó directo a
   * otro campo antes de que el usuario llegara a interactuar con esta lista. */
  close: () => void;
}

interface OptionDropdownProps {
  value: string;
  options: OptionDropdownOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  /** Agrega un buscador arriba de la lista — para catálogos largos (ej. País/Estado/Ciudad) donde
   * desplazarse por todas las opciones no es práctico, a diferencia de listas cortas como horas. */
  searchable?: boolean;
  /** Se dispara al confirmar una opción con Enter (no con clic) — para encadenar "Enter aquí asigna
   * lo resaltado y salta al siguiente campo" sin que este componente conozca ese siguiente campo. */
  onEnterSelect?: (id: string) => void;
}

/** Reemplazo de <select> con el mismo look que el resto de los pickers de la app (DatePicker,
 * Tarifa, etc.) en vez del listado nativo del navegador. Mismo patrón visual que medicoDropdown
 * pero empaquetado como componente reutilizable. */
const OptionDropdown = forwardRef<OptionDropdownHandle, OptionDropdownProps>(function OptionDropdown(
  { value, options, onChange, placeholder = 'Selecciona...', disabled, error, id, searchable, onEnterSelect },
  handleRef,
) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Un open() programático (ver más abajo) normalmente ocurre COMO CONSECUENCIA de un clic en otro
  // campo (ej. elegir un día en el DatePicker de Fecha) — ese mismo clic sigue "vivo" en el listener
  // global de mousedown de abajo, que ve el clic como "afuera de este selector" y lo vuelve a cerrar
  // de inmediato. Esta bandera ignora ese primer mousedown que llega justo después de abrir así.
  const ignoreNextOutsideMousedownRef = useRef(false);
  useImperativeHandle(handleRef, () => ({
    open: () => { ignoreNextOutsideMousedownRef.current = true; setOpen(true); },
    close: () => setOpen(false),
  }), []);

  // "open()" solo cambia este estado interno — sin esto, el menú se abre visualmente pero el foco
  // del teclado se queda en el campo anterior (ej. Fecha), así que flechas/Enter no le llegan a
  // este selector hasta que el usuario le hace clic a mano.
  useEffect(() => {
    if (open && !disabled) buttonRef.current?.focus();
  }, [open, disabled]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      if (ignoreNextOutsideMousedownRef.current) { ignoreNextOutsideMousedownRef.current = false; return; }
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const selectedLabel = options.find(o => o.id === value)?.label ?? '';
  const searchTerm = search.trim().toLowerCase();
  const visibleOptions = searchTerm ? options.filter(o => o.label.toLowerCase().includes(searchTerm)) : options;

  // Al abrirse (o al cambiar el filtro de búsqueda) siempre queda resaltada la primera opción, así
  // un Enter directo sin usar flechas ya asigna algo — no exige navegar antes de poder confirmar.
  useEffect(() => { if (open) setHighlighted(0); }, [open, searchTerm]);
  useEffect(() => { if (open) optionRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' }); }, [open, highlighted]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (disabled) return;
          if (e.key === 'ArrowDown') {
            if (open) { e.preventDefault(); setHighlighted(i => Math.min(i + 1, visibleOptions.length - 1)); }
          } else if (e.key === 'ArrowUp') {
            if (open) { e.preventDefault(); setHighlighted(i => Math.max(i - 1, 0)); }
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            const opt = visibleOptions[highlighted];
            if (opt) {
              setOpen(false);
              // Antes que onChange: así, si el llamador necesita evitar algún efecto secundario
              // propio de onChange (p. ej. no abrir el siguiente selector porque este Enter ya
              // salta más lejos), tiene oportunidad de marcarlo antes de que onChange se ejecute.
              onEnterSelect?.(opt.id);
              onChange(opt.id);
            }
          }
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          width: '100%', boxSizing: 'border-box',
          padding: '0.65rem 0.85rem', borderRadius: '10px', cursor: disabled ? 'not-allowed' : 'pointer',
          border: `1.5px solid ${error ? '#dc2626' : '#e5e7eb'}`,
          backgroundColor: disabled ? '#f4f4ee' : '#fff', fontSize: '0.9rem', fontFamily: 'inherit',
          color: selectedLabel ? '#16170f' : '#9ca3af',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{selectedLabel || placeholder}</span>
        <ChevronDown size={14} color="#9ca3af" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && !disabled && (
        <div style={styles.menu}>
          {searchable && (
            <input
              autoFocus
              style={styles.searchInput}
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          )}
          <div style={styles.list}>
            {visibleOptions.length === 0 ? (
              <div style={{ ...styles.item, color: '#9ca3af', cursor: 'default' }}>Sin opciones</div>
            ) : (
              visibleOptions.map((opt, i) => (
                <div
                  key={opt.id}
                  ref={el => { optionRefs.current[i] = el; }}
                  className="dropdown-item-hover"
                  style={{ ...styles.item, ...(i === highlighted ? styles.itemHighlighted : {}), ...(opt.id === value ? styles.itemActive : {}) }}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                >
                  {opt.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default OptionDropdown;

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'absolute', top: 'calc(100% + 0.35rem)', left: 0, right: 0,
    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', border: 'none',
    borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit',
  },
  list: { maxHeight: '220px', overflowY: 'auto' },
  item: { padding: '0.55rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  itemActive: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  itemHighlighted: { backgroundColor: '#f4f4ee' },
};
