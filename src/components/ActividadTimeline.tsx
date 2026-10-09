import { MaterialIcon } from './icons/MaterialIcon';

export interface ActividadEvento {
  key: string;
  label: string;
  sub: string | null;
  fecha: string | null;
}

/** Línea de tiempo vertical para la tarjeta "Actividad" de un detalle (Cotización, Programación,
 * Remisión): ordena los eventos por fecha (los de fecha desconocida van al final, no se tratan
 * como los más antiguos) y habilita scroll a partir de 3 eventos. */
export function ActividadTimeline({ eventos: eventosRaw }: { eventos: ActividadEvento[] }) {
  const eventos = [...eventosRaw].sort(
    (a, b) => (a.fecha ? new Date(a.fecha).getTime() : Infinity) - (b.fecha ? new Date(b.fecha).getTime() : Infinity),
  );
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', padding: '0.75rem', ...(eventos.length > 3 ? { maxHeight: '220px', overflowY: 'auto' as const } : {}) }}>
      {eventos.map((ev, i) => (
        <div key={ev.key} style={{ display: 'flex', gap: '0.6rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#6b8c1f', flexShrink: 0 }}>
              <MaterialIcon name="check" size={13} color="#fff" />
            </span>
            {i < eventos.length - 1 && (
              <span style={{ width: '2px', flex: 1, backgroundColor: '#e5e7eb', minHeight: '1.25rem' }} />
            )}
          </div>
          <div style={{ minWidth: 0, paddingBottom: i < eventos.length - 1 ? '0.75rem' : 0 }}>
            <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#16170f' }}>{ev.label}</span>
            {ev.sub && <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af' }}>{ev.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
