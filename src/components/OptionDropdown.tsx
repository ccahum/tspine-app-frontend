import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface OptionDropdownOption {
  id: string;
  label: string;
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
}

/** Reemplazo de <select> con el mismo look que el resto de los pickers de la app (DatePicker,
 * Tarifa, etc.) en vez del listado nativo del navegador. Mismo patrón visual que medicoDropdown
 * pero empaquetado como componente reutilizable. */
export default function OptionDropdown({ value, options, onChange, placeholder = 'Selecciona...', disabled, error, id, searchable }: OptionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
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
              visibleOptions.map(opt => (
                <div
                  key={opt.id}
                  className="dropdown-item-hover"
                  style={{ ...styles.item, ...(opt.id === value ? styles.itemActive : {}) }}
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
}

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
};
