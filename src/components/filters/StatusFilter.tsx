import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

const OPTIONS = [
  { key: 'sinRemision', label: 'Sin remisión', color: '#dc2626', bg: '#fee2e2' },
  { key: 'consumoNoValidado', label: 'Sin validar', color: '#7c3aed', bg: '#ede9fe' },
  { key: 'sinComision', label: 'Sin comisión', color: '#2563eb', bg: '#dbeafe' },
  { key: 'cerrada', label: 'Cerrada', color: '#6b7280', bg: '#f3f4f6' },
];

interface Props {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function StatusFilter({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };

  const hasFilter = selected.length > 0;

  const label = () => {
    if (!hasFilter) return 'Estado';
    if (selected.length === 1) return OPTIONS.find(o => o.key === selected[0])?.label ?? 'Estado';
    return `${selected.length} estados`;
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
          e.currentTarget.style.borderColor = hasFilter ? '#6b8c1f' : '#d1d5db';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = hasFilter ? '#6b8c1f' : '#e5e7eb';
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '0.4rem 0.75rem',
          border: `1.5px solid ${hasFilter ? '#6b8c1f' : '#e5e7eb'}`,
          borderRadius: '8px', cursor: 'pointer',
          backgroundColor: hasFilter ? '#f0f4e8' : '#fff',
          fontSize: '0.875rem',
          color: hasFilter ? '#6b8c1f' : '#555',
          fontWeight: hasFilter ? 700 : 500,
          whiteSpace: 'nowrap',
          transition: 'all 0.2s ease',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
        }}>
        {hasFilter && (
          <div style={{ display: 'flex', gap: '2px' }}>
            {selected.map(k => (
              <span key={k} style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: OPTIONS.find(o => o.key === k)?.color,
                display: 'inline-block',
              }} />
            ))}
          </div>
        )}
        {label()}
        {hasFilter
          ? <X size={13} onClick={(e) => { e.stopPropagation(); onChange([]); }} />
          : <ChevronDown size={13} />}
      </button>

      {open && (
        <div style={menu}>
          <p style={hint}>Selecciona uno o varios estados</p>
          <div style={grid}>
            {OPTIONS.map(opt => {
              const isSelected = selected.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  onClick={() => toggle(opt.key)}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '0.6rem 0.875rem',
                    border: `2px solid ${isSelected ? opt.color : '#e5e7eb'}`,
                    borderRadius: '8px', cursor: 'pointer',
                    backgroundColor: isSelected ? opt.bg : '#fff',
                    fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500,
                    color: isSelected ? opt.color : '#555',
                    transition: 'all 0.2s ease',
                    width: '100%', textAlign: 'left',
                  }}>
                  <span style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    backgroundColor: opt.color, flexShrink: 0,
                  }} />
                  {opt.label}
                  {isSelected && (
                    <span style={{
                      marginLeft: 'auto', width: '18px', height: '18px',
                      borderRadius: '50%', backgroundColor: opt.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '0.7rem', fontWeight: 900,
                    }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
          {hasFilter && (
            <button
              onClick={() => { onChange([]); setOpen(false); }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                e.currentTarget.style.backgroundColor = '#eff0f2';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              style={{ ...clearBtn, transition: 'all 0.2s ease' }}
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const menu: React.CSSProperties = {
  position: 'absolute', top: '110%', left: 0, zIndex: 300,
  backgroundColor: '#fff', borderRadius: '12px', padding: '0.875rem',
  boxShadow: '0 8px 28px rgba(0,0,0,0.13)', border: '1px solid #e5e7eb',
  minWidth: '240px',
};
const hint: React.CSSProperties = {
  fontSize: '0.72rem', color: '#999', margin: '0 0 0.6rem 0', textAlign: 'center',
};
const grid: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.4rem',
};
const clearBtn: React.CSSProperties = {
  width: '100%', marginTop: '0.6rem', padding: '0.4rem',
  border: '1px solid #e5e7eb', borderRadius: '8px',
  cursor: 'pointer', backgroundColor: '#f9fafb',
  fontSize: '0.78rem', color: '#666',
};
