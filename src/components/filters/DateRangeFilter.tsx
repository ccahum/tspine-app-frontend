import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, X, ChevronDown } from 'lucide-react';
import { toLocalDateString } from '../../lib/date.utils';
import DatePicker from '../DatePicker';

interface Props {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}

export default function DateRangeFilter({ dateFrom, dateTo, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState(dateFrom);
  const [tempTo, setTempTo] = useState(dateTo);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      // El calendario de DatePicker (Desde/Hasta) se porta a document.body por fuera de este
      // popover — sin este chequeo, elegir un día se veía como "clic afuera" y cerraba todo el
      // filtro antes de poder aplicar la fecha.
      if ((target as HTMLElement).closest?.('[data-datepicker-portal]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 340;
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);
      setMenuPos({ top: rect.bottom + 6, left: Math.max(12, left) });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  useEffect(() => {
    setTempFrom(dateFrom);
    setTempTo(dateTo);
  }, [dateFrom, dateTo]);

  const hasFilter = !!dateFrom || !!dateTo;

  const formatLabel = () => {
    if (!dateFrom && !dateTo) return 'Fecha';
    const fmt = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    if (dateFrom && dateTo && dateFrom === dateTo) return fmt(dateFrom);
    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `Desde ${fmt(dateFrom)}`;
    return `Hasta ${fmt(dateTo)}`;
  };

  const handleApply = () => {
    if (!tempFrom || !tempTo) return;
    onChange(tempFrom, tempTo);
    setOpen(false);
  };

  // Usado por la X del botón colapsado — ahí sí tiene sentido cerrar, no hay recuadro abierto que
  // conservar.
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempFrom('');
    setTempTo('');
    onChange('', '');
    setOpen(false);
  };

  // Usado por "Limpiar" DENTRO del recuadro abierto — solo borra las fechas elegidas, sin cerrar,
  // para poder seguir eligiendo otra fecha ahí mismo.
  const handleClearInMenu = () => {
    setTempFrom('');
    setTempTo('');
    onChange('', '');
  };

  const setPreset = (from: string, to: string) => {
    setTempFrom(from);
    setTempTo(to);
  };

  const today = new Date();
  const fmt = (d: Date) => toLocalDateString(d);

  const presets = [
    {
      label: 'Hoy',
      from: fmt(today), to: fmt(today),
    },
    {
      label: 'Esta semana',
      from: fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())),
      to: fmt(today),
    },
    {
      label: 'Este mes',
      from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    },
    {
      label: 'Mes anterior',
      from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
    },
    {
      label: 'Este año',
      from: fmt(new Date(today.getFullYear(), 0, 1)),
      to: fmt(new Date(today.getFullYear(), 11, 31)),
    },
  ];

  return (
    <div style={{ position: 'relative' as const }}>
      <button
        ref={triggerRef}
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
          fontSize: '0.875rem', color: hasFilter ? '#6b8c1f' : '#555',
          fontWeight: hasFilter ? 700 : 500, whiteSpace: 'nowrap',
          maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis',
          transition: 'all 0.2s ease',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
        }}>
        <CalendarDays size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{formatLabel()}</span>
        {hasFilter
          ? <X size={13} onClick={handleClear} style={{ flexShrink: 0 }} />
          : <ChevronDown size={13} style={{ flexShrink: 0 }} />}
      </button>

      {open && createPortal(
        <div ref={menuRef} style={{ ...menu, top: menuPos.top, left: menuPos.left }}>
          {/* Presets */}
          <div style={presetsRow}>
            {presets.map(p => (
              <button
                key={p.label}
                className="datepicker-cell-hover"
                onClick={() => setPreset(p.from, p.to)}
                style={{ ...presetBtn, ...(p.from === tempFrom && p.to === tempTo ? presetBtnActive : {}) }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '0.5rem 0' }} />

          {/* Inputs */}
          <div style={inputsRow}>
            <div style={inputGroup}>
              <label style={inputLabel}>Desde</label>
              <DatePicker value={tempFrom} onChange={setTempFrom} style={dateInput} />
            </div>
            <span style={{ color: '#999', paddingTop: '1.2rem' }}>–</span>
            <div style={inputGroup}>
              <label style={inputLabel}>Hasta</label>
              <DatePicker value={tempTo} min={tempFrom} onChange={setTempTo} style={dateInput} />
            </div>
          </div>

          {/* Actions */}
          <div style={actions}>
            <button
              onClick={handleClearInMenu}
              style={clearBtn}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                e.currentTarget.style.backgroundColor = '#f3f4f6';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#fff';
              }}
            >
              Limpiar
            </button>
            <button
              onClick={handleApply}
              disabled={!tempFrom || !tempTo}
              style={{ ...applyBtn, ...(!tempFrom || !tempTo ? applyBtnDisabled : {}) }}
              onMouseEnter={e => {
                if (!tempFrom || !tempTo) return;
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(107,140,31,0.2)';
                e.currentTarget.style.backgroundColor = '#5a7318';
              }}
              onMouseLeave={e => {
                if (!tempFrom || !tempTo) return;
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#6b8c1f';
              }}
            >
              Aplicar
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const menu: React.CSSProperties = {
  position: 'fixed', zIndex: 10050,
  backgroundColor: '#fff', borderRadius: '12px', padding: '0.875rem',
  boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid #e5e7eb',
  width: '340px', boxSizing: 'border-box',
};
const presetsRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' };
const presetBtn: React.CSSProperties = {
  padding: '0.25rem 0.6rem', border: '1px solid #e5e7eb', borderRadius: '20px',
  cursor: 'pointer', backgroundColor: '#f9fafb', fontSize: '0.78rem', color: '#555',
};
// Mismo verde suave que usa el DatePicker para el día seleccionado — así el preset activo queda
// marcado en vez de volver siempre a su estado neutro después de elegirlo.
const presetBtnActive: React.CSSProperties = {
  backgroundColor: '#e9f2d8', borderColor: '#c3dba0', color: '#3f6510', fontWeight: 700,
};
const inputsRow: React.CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.75rem' };
const inputGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 };
const inputLabel: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: '#666' };
const dateInput: React.CSSProperties = {
  padding: '0.4rem 0.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px',
  fontSize: '0.78rem', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const actions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' };
const clearBtn: React.CSSProperties = {
  padding: '0.4rem 0.875rem', border: '1.5px solid #e5e7eb', borderRadius: '8px',
  cursor: 'pointer', backgroundColor: '#fff', fontSize: '0.825rem', color: '#555',
};
const applyBtn: React.CSSProperties = {
  padding: '0.4rem 0.875rem', border: 'none', borderRadius: '8px',
  cursor: 'pointer', backgroundColor: '#6b8c1f', color: '#fff',
  fontSize: '0.825rem', fontWeight: 700, transition: 'all 0.2s ease',
};
const applyBtnDisabled: React.CSSProperties = {
  backgroundColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed',
};
