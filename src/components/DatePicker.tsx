import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '../lib/date.utils';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  error?: boolean;
  placeholder?: string;
  id?: string;
  style?: React.CSSProperties;
  /** Estilo del <span> del texto (no del botón completo) — para, por ejemplo, centrarlo sin mover
   * el ícono del calendario, que queda fijo a la derecha por el justifyContent del botón. */
  labelStyle?: React.CSSProperties;
}

const DIAS_SEMANA = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const parseLocal = (isoDate: string): Date | null => {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/** Reemplazo de <input type="date"> con el calendario propio de la app (mismos colores que el
 * resto del sistema) en vez del selector nativo del navegador, que se ve genérico y no se puede
 * personalizar. Misma API que un input controlado: value/onChange en formato "YYYY-MM-DD". */
export default function DatePicker({ value, onChange, min, max, error, placeholder = 'Selecciona una fecha', id, style, labelStyle }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState<'dias' | 'meses' | 'anios'>('dias');
  const [mesVisible, setMesVisible] = useState(() => parseLocal(value) ?? new Date());
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    // Arranca en el mes de la fecha ya elegida (o el actual, si no hay ninguna) cada vez que se
    // abre — así no se queda "atorado" en el último mes que se llegó a navegar la vez anterior.
    setMesVisible(parseLocal(value) ?? new Date());
    setVista('dias');
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 280;
      // Alto aproximado del calendario (header + fila de días de la semana + hasta 6 filas de
      // días) — antes siempre se abría pegado justo debajo del campo sin importar cuánto espacio
      // quedara, así que en campos cerca del borde inferior de la pantalla (común en formularios
      // largos en móvil, ej. Fecha QX) se salía por abajo. Simplemente "abrir hacia arriba" en ese
      // caso no alcanza si tampoco hay espacio arriba (pantallas cortas) — en vez de elegir un
      // lado, se prefiere pegado debajo del campo pero deslizándolo hacia arriba lo necesario para
      // que quepa completo en la pantalla, nunca más arriba de 8px del borde superior.
      const menuHeightEstimate = 340;
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);
      const idealTop = rect.bottom + 6;
      const maxTop = window.innerHeight - menuHeightEstimate - 8;
      const top = Math.max(8, Math.min(idealTop, maxTop));
      setMenuPos({ top, left: Math.max(12, left) });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const seleccionado = parseLocal(value);
  const minDate = parseLocal(min ?? '');
  const maxDate = parseLocal(max ?? '');

  // DD/MM/AAAA — mismo formato que el resto de la app muestra las fechas ya guardadas (ver
  // formatDate en las páginas que las listan), en vez de "17 sep 2026".
  const label = seleccionado ? toLocalDateString(seleccionado).split('-').reverse().join('/') : placeholder;

  const daysInMonth = new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1, 0).getDate();
  const firstDay = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1).getDay();
  const days = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const monthYear = mesVisible.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  const handleSelect = (day: number) => {
    const date = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), day);
    onChange(toLocalDateString(date));
    setOpen(false);
  };

  // Cuadrícula de 12 años (4x3) centrada en el año visible — clic en "Septiembre 2026" pasa a
  // esta vista en vez de tener que darle a "mes siguiente" doce veces para llegar a otro año.
  const anioBase = Math.floor(mesVisible.getFullYear() / 12) * 12;
  const anios = Array.from({ length: 12 }, (_, i) => anioBase + i);

  const handleSelectAnio = (anio: number) => {
    setMesVisible(new Date(anio, mesVisible.getMonth()));
    // Al elegir año se pasa a elegir mes (no directo a los días) — encadena bien con el flujo de
    // "cambiar también el año": año → mes → día, en vez de saltar de golpe a un mes que capaz no
    // era el que querían.
    setVista('meses');
  };

  const handleSelectMes = (mes: number) => {
    setMesVisible(new Date(mesVisible.getFullYear(), mes));
    setVista('dias');
  };

  return (
    <div style={{ position: 'relative' as const }}>
      <button
        type="button"
        ref={triggerRef}
        id={id}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          width: '100%', boxSizing: 'border-box' as const, textAlign: 'left' as const,
          padding: '0.65rem 0.85rem', borderRadius: '10px', cursor: 'pointer',
          border: `1.5px solid ${error ? '#dc2626' : '#e5e7eb'}`,
          backgroundColor: '#fff', fontSize: '0.9rem', fontFamily: 'inherit',
          color: seleccionado ? '#16170f' : '#9ca3af',
          ...style,
        }}
      >
        <span style={labelStyle}>{label}</span>
        <CalendarIcon size={16} color="#6b8c1f" style={{ flexShrink: 0 }} />
      </button>

      {open && createPortal(
        // data-datepicker-portal: este calendario se porta a document.body, por fuera del DOM del
        // popover que lo contiene (ej. DateRangeFilter) — si ese popover tiene su propio listener
        // de "clic afuera", no reconoce este dropdown como "adentro" y se cierra solo con elegir un
        // día. Ese listener puede chequear este atributo para no tratarlo como clic externo.
        <div ref={menuRef} data-datepicker-portal="true" style={{ ...styles.menu, top: menuPos.top, left: menuPos.left }}>
          {vista === 'anios' ? (
            <>
              <div style={styles.header}>
                <button type="button" style={styles.navBtn} title="12 años atrás" onClick={() => setMesVisible(new Date(mesVisible.getFullYear() - 12, mesVisible.getMonth()))}>
                  <ChevronLeft size={16} />
                </button>
                <span style={styles.monthLabel}>{anios[0]}–{anios[11]}</span>
                <button type="button" style={styles.navBtn} title="12 años adelante" onClick={() => setMesVisible(new Date(mesVisible.getFullYear() + 12, mesVisible.getMonth()))}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={styles.anioGrid}>
                {anios.map(anio => {
                  const isSelected = anio === mesVisible.getFullYear();
                  return (
                    <button
                      type="button"
                      key={anio}
                      className="datepicker-cell-hover"
                      onClick={() => handleSelectAnio(anio)}
                      style={{
                        ...styles.anioBtn,
                        ...(isSelected ? styles.dayBtnSelected : {}),
                      }}
                    >
                      {anio}
                    </button>
                  );
                })}
              </div>
            </>
          ) : vista === 'meses' ? (
            <>
              <div style={styles.header}>
                <button type="button" style={styles.navBtn} title="Año anterior" onClick={() => setMesVisible(new Date(mesVisible.getFullYear() - 1, mesVisible.getMonth()))}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" style={styles.monthLabelBtn} onClick={() => setVista('anios')} title="Elegir año">
                  {mesVisible.getFullYear()}
                </button>
                <button type="button" style={styles.navBtn} title="Año siguiente" onClick={() => setMesVisible(new Date(mesVisible.getFullYear() + 1, mesVisible.getMonth()))}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div style={styles.anioGrid}>
                {MESES.map((nombreMes, mes) => {
                  const isSelected = mes === mesVisible.getMonth();
                  return (
                    <button
                      type="button"
                      key={nombreMes}
                      className="datepicker-cell-hover"
                      onClick={() => handleSelectMes(mes)}
                      style={{
                        ...styles.anioBtn,
                        ...(isSelected ? styles.dayBtnSelected : {}),
                      }}
                    >
                      {nombreMes}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div style={styles.header}>
                <button type="button" style={styles.navBtn} title="Mes anterior" onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() - 1))}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" style={styles.monthLabelBtn} onClick={() => setVista('meses')} title="Elegir mes o año">
                  {monthYear.charAt(0).toUpperCase() + monthYear.slice(1)}
                </button>
                <button type="button" style={styles.navBtn} title="Mes siguiente" onClick={() => setMesVisible(new Date(mesVisible.getFullYear(), mesVisible.getMonth() + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div style={styles.weekRow}>
                {DIAS_SEMANA.map(d => <div key={d} style={styles.weekDay}>{d}</div>)}
              </div>

              <div style={styles.grid}>
                {days.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} />;
                  const date = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), day);
                  const isSelected = seleccionado && date.getTime() === seleccionado.getTime();
                  const disabled = (minDate && date < minDate) || (maxDate && date > maxDate);
                  return (
                    <button
                      type="button"
                      key={day}
                      className="datepicker-cell-hover"
                      disabled={!!disabled}
                      onClick={() => handleSelect(day)}
                      style={{
                        ...styles.dayBtn,
                        ...(isSelected ? styles.dayBtnSelected : {}),
                        ...(disabled ? styles.dayBtnDisabled : {}),
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed', zIndex: 10050,
    backgroundColor: '#fff', borderRadius: '12px', padding: '0.85rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.14)', border: '1px solid #e5e7eb',
    width: '280px', boxSizing: 'border-box',
    // Último resguardo para pantallas muy cortas donde ni deslizándolo hacia arriba cabe entero
    // (ver el clamp de "top" en reposition): en vez de cortarse, scrollea internamente.
    maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' as const,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' },
  navBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
    border: 'none', borderRadius: '8px', backgroundColor: '#f4f4ee', color: '#374151', cursor: 'pointer',
  },
  monthLabel: { fontSize: '0.85rem', fontWeight: 700, color: '#16170f', textTransform: 'capitalize' as const },
  // Botón (no <span>) porque el título del mes se puede clicar para pasar a elegir año — con un
  // fondo que reacciona al hover, para que se note que es interactivo y no solo una etiqueta.
  monthLabelBtn: {
    fontSize: '0.85rem', fontWeight: 700, color: '#16170f', textTransform: 'capitalize' as const,
    border: 'none', background: 'none', cursor: 'pointer', padding: '0.25rem 0.6rem', borderRadius: '8px',
  },
  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '0.2rem' },
  weekDay: { textAlign: 'center' as const, fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', padding: '0.2rem 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' },
  dayBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1',
    border: 'none', borderRadius: '8px', backgroundColor: 'transparent', color: '#33342a',
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
  },
  // No hay indicador de "hoy" — solo puede haber una fecha resaltada a la vez (la elegida), para
  // no dar la impresión de que hay dos fechas seleccionadas al mismo tiempo. Mismo verde suave
  // que el hover, así que elegir una fecha se siente como una continuación natural del preview.
  dayBtnSelected: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  dayBtnDisabled: { color: '#d1d5db', cursor: 'not-allowed' as const },
  anioGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' },
  anioBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0',
    border: 'none', borderRadius: '8px', backgroundColor: 'transparent', color: '#33342a',
    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  },
};
