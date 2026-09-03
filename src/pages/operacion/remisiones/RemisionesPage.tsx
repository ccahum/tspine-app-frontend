import { useState, useRef, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, ChevronDown, Check, Plus, X } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import DateRangeFilter from '../../../components/filters/DateRangeFilter';
import { remisionesService, ESTADOS_REMISION, type RemisionListItem, type RemisionListResponse } from '../../../services/remisiones.service';
import { programacionesService, type ProgramacionItem } from '../../../services/programaciones.service';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

const ESTADO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'definitiva':   { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  'tramitada':    { bg: '#dbeafe', text: '#1e40af', dot: '#2563eb' },
  'descorche':    { bg: '#f3e8ff', text: '#6b21a8', dot: '#9333ea' },
  'trazabilidad': { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
};

const getEstadoColors = (estado: string | null) => ESTADO_COLORS[(estado ?? '').trim().toLowerCase()] ?? { bg: '#f3f4f6', text: '#555', dot: '#9ca3af' };

function EstadoBadge({ estado }: { estado: string | null }) {
  const c = getEstadoColors(estado);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: c.bg, color: c.text }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {estado || '-'}
    </span>
  );
}

function EstadoFilter({ selected, onChange }: { selected: string | undefined; onChange: (estado: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.85rem', border: `1.5px solid ${selected ? '#6b8c1f' : '#e5e7eb'}`, borderRadius: '8px', backgroundColor: selected ? '#f3faec' : '#fff', color: selected ? '#6b8c1f' : '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => setOpen(o => !o)}
      >
        Estado{selected ? `: ${selected}` : ''}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 0.4rem)', left: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', padding: '0.4rem', minWidth: '180px', zIndex: 20 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' }}
            onClick={() => { onChange(undefined); setOpen(false); }}
          >
            Todos {!selected && <Check size={14} color="#6b8c1f" />}
          </div>
          {ESTADOS_REMISION.map(opt => {
            const c = getEstadoColors(opt);
            return (
              <div
                key={opt}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer', backgroundColor: selected === opt ? '#f3f4f6' : 'transparent' }}
                onClick={() => { onChange(opt); setOpen(false); }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{opt}</span>
                {selected === opt && <Check size={14} color="#6b8c1f" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const RemisionRow = memo(({ item, index, navigate }: { item: RemisionListItem; index: number; navigate: (path: string) => void }) => (
  <tr
    style={styles.tr}
    onClick={() => navigate(`/operacion/remisiones/${item.id}`)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.boxShadow = 'none'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#999', width: '40px' }}>{index + 1}</td>
    <td style={{ ...styles.td, fontSize: '0.85rem', color: '#6b8c1f', fontWeight: 700 }}>
      {item.numRemision ?? item.id}
    </td>
    <td style={styles.td}>
      <span
        style={{ color: item.programacionId ? '#3f6510' : '#9ca3af', fontWeight: 600, cursor: item.programacionId ? 'pointer' : 'default' }}
        onClick={e => { if (item.programacionId) { e.stopPropagation(); navigate(`/operacion/programaciones/${item.programacionId}`); } }}
      >
        {item.numProgram ?? item.programacionId ?? '-'}
      </span>
    </td>
    <td style={styles.td}>{formatDate(item.fechaQx)}</td>
    <td style={styles.td}>{item.horaQx ?? '-'}</td>
    <td style={styles.td}>{item.sede ?? '-'}</td>
    <td style={styles.td}>{item.ciudad ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.medicos.join(', ') || '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.tarifa ?? '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.hospital ?? '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.empresa ?? '-'}
    </td>
    <td style={styles.td}><EstadoBadge estado={item.estado} /></td>
  </tr>
));

const RemisionCard = memo(({ item, navigate }: { item: RemisionListItem; navigate: (path: string) => void }) => (
  <div style={styles.mobileCard} onClick={() => navigate(`/operacion/remisiones/${item.id}`)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardId}>{item.numRemision ?? item.id}</span>
      <EstadoBadge estado={item.estado} />
    </div>
    <div style={styles.mobileCardMainRow}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardPrograma}>{item.numProgram ?? item.programacionId ?? '-'}</div>
        <div style={styles.mobileCardSubtext}>{formatDate(item.fechaQx)}{item.horaQx ? ` · ${item.horaQx}` : ''}</div>
        <div style={styles.mobileCardSubtext}>{item.sede ?? '-'}{item.ciudad ? ` · ${item.ciudad}` : ''}</div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Médico</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.medicos.join(', ') || '-'}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Hospital</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.hospital ?? '-'}</span>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Empresa</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.empresa ?? '-'}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Tarifa</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.tarifa ?? '-'}</span>
      </div>
    </div>
  </div>
));

function ProgramacionPickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['programaciones-picker', debouncedSearch],
    queryFn: () => programacionesService.findAll({ page: 1, limit: 8, search: debouncedSearch || undefined, conRequisicion: true }),
    placeholderData: keepPreviousData,
  });
  const results = data?.data ?? [];

  // Cierra el modal con un fade breve antes de navegar, para que la llegada al detalle de la
  // programación no se sienta como un corte instantáneo.
  const handleSelect = (id: string) => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onSelect(id), 180);
  };

  return (
    <div className={closing ? 'modal-overlay-closing' : 'modal-overlay-anim'} style={styles.modalOverlay} onClick={closing ? undefined : onClose}>
      <div className="modal-content-anim" style={styles.modalBox} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>Selecciona una programación</h3>
            <p style={styles.modalSubtitle}>Solo se muestran programaciones con al menos una requisición registrada.</p>
          </div>
          <button type="button" style={styles.modalCloseBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.pickerSearchWrap}>
          <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            style={styles.pickerSearchInput}
            placeholder="Buscar por N° programa, médico, hospital..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div style={styles.pickerList}>
          {isLoading ? (
            <div style={styles.pickerEmpty}>Cargando...</div>
          ) : results.length === 0 ? (
            <div style={styles.pickerEmpty}>
              {debouncedSearch ? 'Sin resultados' : 'No hay programaciones con requisición disponibles'}
            </div>
          ) : (
            results.map((p: ProgramacionItem) => (
              <div
                key={p.id}
                style={styles.pickerItem}
                onClick={() => handleSelect(p.id)}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
              >
                <div style={styles.pickerItemMain}>
                  <span style={styles.pickerItemNumPrograma}>{p.numProgram ?? p.id}</span>
                  <span style={styles.pickerItemMeta}>{formatDate(p.fechaQx)}{p.horaQx ? ` · ${p.horaQx}` : ''}{p.sede ? ` · ${p.sede}` : ''}</span>
                </div>
                <span style={styles.pickerItemHospital}>{p.hospital ?? 'Sin hospital'}</span>
                <span style={styles.pickerItemMedicos}>{p.medicos.join(', ') || '-'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function RemisionesPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [estado, setEstado] = useState<string | undefined>(undefined);
  const [cxcTab, setCxcTab] = useState<'todo' | 'pendiente' | 'enviada'>('todo');
  const [page, setPage] = useState(1);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = showPickerModal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showPickerModal]);

  // Le da sombra a la tarjeta fija (título + tabs) solo mientras está "pegada" arriba por el
  // scroll — mismo patrón que Solicitud de Programación.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const query = {
    page,
    limit: 300,
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    estado,
    cxc: cxcTab === 'pendiente' ? false : cxcTab === 'enviada' ? true : undefined,
  };

  const { data, isLoading } = useQuery<RemisionListResponse>({
    queryKey: ['remisiones', query],
    queryFn: () => remisionesService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const { data: cxcStats } = useQuery({
    queryKey: ['remisiones-cxc-stats'],
    queryFn: () => remisionesService.getCxcStats(),
  });

  const items = data?.data ?? [];

  return (
    <Layout>
      <div style={styles.pageWrapper}>
        <button
          type="button"
          onClick={() => navigate('/operacion')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={{ ...styles.contentCard, ...(isStuck ? styles.contentCardStuck : {}) }}>
          <div style={styles.header}>
            <h1 style={styles.title}>Remisiones</h1>
          </div>

          <div style={styles.tabsRow}>
            <div style={styles.cxcTabs}>
              <button
                className="btn-press"
                style={{ ...styles.cxcTab, ...(cxcTab === 'todo' ? styles.cxcTabActive : {}) }}
                onClick={() => { setCxcTab('todo'); setPage(1); }}
              >
                Todo
                <span style={{ ...styles.cxcTabBadge, ...(cxcTab === 'todo' ? styles.cxcTabBadgeActive : {}) }}>{cxcStats?.total ?? '-'}</span>
              </button>
              <button
                className="btn-press"
                style={{ ...styles.cxcTab, ...(cxcTab === 'pendiente' ? styles.cxcTabActive : {}) }}
                onClick={() => { setCxcTab('pendiente'); setPage(1); }}
              >
                Pendiente
                <span style={{ ...styles.cxcTabBadge, ...(cxcTab === 'pendiente' ? styles.cxcTabBadgeActive : {}) }}>{cxcStats?.pendiente ?? '-'}</span>
              </button>
              <button
                className="btn-press"
                style={{ ...styles.cxcTab, ...(cxcTab === 'enviada' ? styles.cxcTabActive : {}) }}
                onClick={() => { setCxcTab('enviada'); setPage(1); }}
              >
                Enviada
                <span style={{ ...styles.cxcTabBadge, ...(cxcTab === 'enviada' ? styles.cxcTabBadgeActive : {}) }}>{cxcStats?.enviada ?? '-'}</span>
              </button>
            </div>

            <button className="btn-press header-btn-primary" style={styles.newBtn} onClick={() => setShowPickerModal(true)}>
              <Plus size={16} />
              Nueva remisión
            </button>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por N° remisión, paciente, médico, hospital..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); setPage(1); }}
            />

            <EstadoFilter selected={estado} onChange={e => { setEstado(e); setPage(1); }} />

            <span style={styles.totalLabel}>{isLoading ? '...' : `${data?.total ?? 0} registros`}</span>
          </div>
        </div>

        <div ref={tableWrapRef} style={styles.tableWrap}>
          {isLoading && items.length === 0 ? (
            <div style={styles.empty}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : isMobile ? (
            <div style={styles.mobileCardList}>
              {items.map(item => (
                <RemisionCard key={item.id} item={item} navigate={navigate} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'N° Remisión', 'N° Program', 'Fecha QX', 'Hora QX', 'Sede', 'Ciudad QX', 'Médico', 'Tarifa', 'Hospital', 'Empresa', 'Estado'].map((h, i) => (
                    <th key={i} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <RemisionRow key={item.id} item={item} index={(page - 1) * 300 + index} navigate={navigate} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, ...(page === 1 ? styles.pageBtnDisabled : {}) }}
            >
              ← Anterior
            </button>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#333' }}>
              Página {page} de {data.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              style={{ ...styles.pageBtn, ...(page === data.totalPages ? styles.pageBtnDisabled : {}) }}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {showPickerModal && (
        <ProgramacionPickerModal
          onClose={() => setShowPickerModal(false)}
          onSelect={id => navigate(`/operacion/programaciones/${id}?agregarRemision=1`)}
        />
      )}
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { marginBottom: '1.25rem' },
  tabsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.1rem', flexWrap: 'wrap' as const },
  cxcTabs: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  newBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  cxcTab: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#374151', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  cxcTabActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  cxcTabBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.5rem', height: '1.35rem', padding: '0 0.4rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700 },
  cxcTabBadgeActive: { backgroundColor: '#dbe8c2', color: '#3f6510' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '280px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  totalLabel: { fontSize: '0.8rem', color: '#999', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '12px', overflowX: 'auto' as const, overflowY: 'auto' as const, maxHeight: 'calc(100vh - 260px)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.875rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.65rem 0.875rem', textAlign: 'left' as const, fontWeight: 700, color: '#555', fontSize: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const, color: '#333' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'all 0.2s ease' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#999' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', gap: '0.5rem' },
  mobileCardId: { fontSize: '0.85rem', fontWeight: 700, color: '#6b8c1f' },
  mobileCardMainRow: { display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.15rem' },
  mobileCardPrograma: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardSubtext: { fontSize: '0.78rem', color: '#6b7280', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardFieldsRow: { display: 'flex', gap: '1.25rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f6' },
  mobileCardField: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  mobileCardFieldLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageBtn: { padding: '0.5rem 1rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', transition: 'all 0.2s ease' },
  pageBtnDisabled: { backgroundColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' as const },

  modalOverlay: { position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000, padding: '1.5rem' },
  modalBox: { backgroundColor: '#fff', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 20px 50px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#333', margin: 0 },
  modalSubtitle: { fontSize: '0.8rem', color: '#888', margin: '0.3rem 0 0' },
  modalCloseBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', borderRadius: '6px', flexShrink: 0 },
  pickerSearchWrap: { position: 'relative' as const, marginBottom: '0.75rem', flexShrink: 0 },
  pickerSearchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  pickerList: { overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', minHeight: '80px' },
  pickerEmpty: { textAlign: 'center' as const, padding: '2rem 1rem', color: '#999', fontSize: '0.875rem' },
  pickerItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', padding: '0.6rem 0.7rem', borderRadius: '10px', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  pickerItemMain: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' },
  pickerItemNumPrograma: { fontSize: '0.85rem', fontWeight: 700, color: '#3f6510' },
  pickerItemHospital: { fontSize: '0.875rem', fontWeight: 700, color: '#333' },
  pickerItemMeta: { fontSize: '0.75rem', color: '#999', whiteSpace: 'nowrap' as const },
  pickerItemMedicos: { fontSize: '0.8rem', color: '#6b7280' },
};
