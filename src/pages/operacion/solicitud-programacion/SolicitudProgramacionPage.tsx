import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Plus, X, ThumbsUp, ThumbsDown, CheckCircle, Circle, AlertTriangle } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { solicitudProgramacionService, type SolicitudProgramacionItem } from '../../../services/solicitudProgramacion.service';
import { programacionesService, type SedeOption, type HospitalOption, type MedicoOption } from '../../../services/programaciones.service';
import { getTodayMexico, getNowMexicoTime } from '../../../lib/date.utils';

type TabKey = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'TODO';

const ESTADO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDIENTE: { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
  APROBADA: { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  RECHAZADA: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
};
const ESTADO_LABELS: Record<string, string> = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' };

function EstadoBadge({ estado }: { estado: string }) {
  const c = ESTADO_COLORS[estado] ?? { bg: '#f3f4f6', text: '#555', dot: '#9ca3af' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, backgroundColor: c.bg, color: c.text, whiteSpace: 'nowrap' as const }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  );
}

// Mismas iniciales que el avatar del header (nombre.slice(0,2)) — para que el "quién" de cada
// solicitud se vea igual en toda la app, en vez de un ícono genérico de usuario.
const getInitials = (name: string): string => name.trim().slice(0, 2).toUpperCase();

const formatFecha = (dateString: string | null): string => {
  if (!dateString) return '-';
  const d = new Date(dateString.length <= 10 ? `${dateString}T00:00:00` : dateString);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// Día calendario en México (mismo offset fijo UTC-6 que getTodayMexico) a partir de un
// timestamp UTC real como createdAt — para poder agrupar "solicitado el mismo día".
const getMexicoDateKey = (isoString: string): string => {
  const d = new Date(new Date(isoString).getTime() - 6 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
};

const formatGroupLabel = (dateKey: string, todayMexico: string): string => {
  if (dateKey === todayMexico) return 'Hoy';
  const yesterday = new Date(new Date(`${todayMexico}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  if (dateKey === yesterday) return 'Ayer';
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

function RechazarModal({ item, onCancel, onConfirm, submitting }: {
  item: SolicitudProgramacionItem;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
  submitting: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(false);

  const handleConfirm = () => {
    if (!motivo.trim()) { setError(true); return; }
    onConfirm(motivo.trim());
  };

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onCancel}>
      <div className="modal-content-anim" style={styles.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={styles.modalTitle}>Rechazar solicitud</h3>
        <p style={styles.modalSubtitle}>{item.hospital ?? 'Solicitud de programación'} — {formatFecha(item.fechaQx)}</p>
        <label style={styles.modalLabel}>Motivo del rechazo</label>
        <textarea
          ref={autoResizeTextarea}
          style={{ ...styles.modalTextarea, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const, ...(error ? styles.inputError : {}) }}
          value={motivo}
          onChange={e => { setMotivo(e.target.value); setError(false); autoResizeTextarea(e.target); }}
          placeholder="Describe el motivo del rechazo..."
          rows={3}
          autoFocus
        />
        {error && <span style={styles.errorText}>El motivo es obligatorio</span>}
        <div style={styles.modalActions}>
          <button type="button" style={styles.modalBtnSecondary} onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="button" style={styles.modalBtnDanger} onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Rechazando...' : 'Rechazar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TAB_KEYS: TabKey[] = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'TODO'];

export default function SolicitudProgramacionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabKey>('PENDIENTE');
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<SolicitudProgramacionItem | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    document.body.style.overflow = (rejectTarget || showNewModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [rejectTarget, showNewModal]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectTab = (key: TabKey) => { setTab(key); setPage(1); };

  // Le da sombra a la tarjeta fija (título + tabs + botón) solo mientras está "pegada" arriba
  // por el scroll, para que se note que quedó flotando sobre el contenido y no plana como antes.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Deep-link desde una notificación (?tab=RECHAZADA, etc.). Reacciona a cambios en searchParams
  // (no solo al montar): si el usuario ya estaba en esta página, React Router no vuelve a montar
  // el componente al navegar a la misma ruta con otro query, así que un efecto con dependencias
  // vacías nunca se habría vuelto a disparar.
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && (TAB_KEYS as string[]).includes(tabParam)) {
      setTab(tabParam as TabKey);
      setPage(1);
      setSearchParams(params => { params.delete('tab'); return params; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [newForm, setNewForm] = useState({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
  const [newObservaciones, setNewObservaciones] = useState('');
  const [newConsumo, setNewConsumo] = useState('');
  const [newMedicos, setNewMedicos] = useState<MedicoOption[]>([]);
  const [newMedicoSearch, setNewMedicoSearch] = useState('');
  const [newHospitalSearch, setNewHospitalSearch] = useState('');
  const [newError, setNewError] = useState<{ field: string; message: string } | null>(null);

  const estadoFiltro = tab === 'TODO' ? undefined : tab;
  const { data, isLoading } = useQuery({
    queryKey: ['solicitud-programacion', estadoFiltro, page],
    queryFn: () => solicitudProgramacionService.findAll(estadoFiltro, page),
    placeholderData: keepPreviousData,
  });
  const items = data?.data ?? [];

  const { data: meta } = useQuery({
    queryKey: ['solicitud-programacion-soy-revisor'],
    queryFn: () => solicitudProgramacionService.soyRevisor(),
  });
  const esRevisor = meta?.esRevisor ?? false;

  const { data: sedeOptions = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showNewModal,
  });
  const { data: hospitalOptions = [] } = useQuery<HospitalOption[]>({
    queryKey: ['programaciones-hospitales'],
    queryFn: () => programacionesService.getHospitales(),
    enabled: showNewModal,
  });
  const { data: newMedicoResults = [] } = useQuery<MedicoOption[]>({
    queryKey: ['programaciones-medicos', newMedicoSearch],
    queryFn: () => programacionesService.searchMedicos(newMedicoSearch),
    enabled: showNewModal && !!newMedicoSearch.trim(),
  });

  const selectedNewHospital = hospitalOptions.find(h => h.id === newForm.hospitalId) ?? null;
  const newHospitalResults = newHospitalSearch.trim()
    ? hospitalOptions.filter(h => h.nombre.toLowerCase().includes(newHospitalSearch.trim().toLowerCase()))
    : [];

  // Al crear una solicitud (no al editar) no se permite elegir fecha/hora ya pasada.
  const todayMexico = getTodayMexico();
  const isNewFechaToday = newForm.fechaQx === todayMexico;
  const nowMexicoTime = getNowMexicoTime();
  const minHour = isNewFechaToday ? Number(nowMexicoTime.split(':')[0]) : 0;
  const selectedHour = newForm.horaQx.split(':')[0] ?? '';
  const minMinute = isNewFechaToday && Number(selectedHour) === minHour ? Number(nowMexicoTime.split(':')[1]) : 0;

  // Agrupa las solicitudes por el día en que se solicitaron (no el día de la cirugía), para
  // poder distinguir de un vistazo cuáles llegaron hoy, ayer, etc. cuando hay varias por día.
  const groups = useMemo(() => {
    const map = new Map<string, SolicitudProgramacionItem[]>();
    for (const item of items) {
      const key = getMexicoDateKey(item.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].map(([key, groupItems]) => ({
      key,
      label: formatGroupLabel(key, todayMexico),
      items: groupItems,
    }));
  }, [items, todayMexico]);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const conteos = data?.conteos ?? { PENDIENTE: 0, APROBADA: 0, RECHAZADA: 0 };
  const totalGeneral = conteos.PENDIENTE + conteos.APROBADA + conteos.RECHAZADA;

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'PENDIENTE', label: 'Pendiente', count: conteos.PENDIENTE },
    { key: 'APROBADA', label: 'Aprobada', count: conteos.APROBADA },
    { key: 'RECHAZADA', label: 'Rechazada', count: conteos.RECHAZADA },
    { key: 'TODO', label: 'Todo', count: totalGeneral },
  ];

  const reviewMutation = useMutation({
    mutationFn: ({ id, estado, motivoRechazo }: { id: string; estado: 'APROBADA' | 'RECHAZADA'; motivoRechazo?: string }) =>
      solicitudProgramacionService.updateEstado(id, estado, motivoRechazo),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['solicitud-programacion'] });
      setToastMessage(variables.estado === 'APROBADA' ? 'Solicitud aprobada' : 'Solicitud rechazada');
      setRejectTarget(null);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => solicitudProgramacionService.create({
      fechaQx: newForm.fechaQx,
      horaQx: newForm.horaQx,
      sedeId: newForm.sedeId,
      hospitalId: newForm.hospitalId,
      observaciones: newObservaciones,
      consumo: newConsumo,
      medicoIds: newMedicos.map(m => m.id),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitud-programacion'] });
      setShowNewModal(false);
      setToastMessage('Solicitud enviada, en espera de revisión');
    },
  });

  const openNewModal = () => {
    setNewForm({ fechaQx: '', horaQx: '', sedeId: '', hospitalId: '' });
    setNewObservaciones('');
    setNewConsumo('');
    setNewMedicos([]);
    setNewMedicoSearch('');
    setNewHospitalSearch('');
    setNewError(null);
    setShowNewModal(true);
  };

  const handleGuardarNew = () => {
    if (!newForm.fechaQx) { setNewError({ field: 'fechaQx', message: 'Selecciona la fecha.' }); return; }
    if (!newForm.horaQx || newForm.horaQx.split(':').some(p => !p)) { setNewError({ field: 'horaQx', message: 'Selecciona la hora.' }); return; }
    if (!newForm.sedeId) { setNewError({ field: 'sedeId', message: 'Selecciona la sede.' }); return; }
    if (!newForm.hospitalId) { setNewError({ field: 'hospitalId', message: 'Selecciona el hospital.' }); return; }
    if (newMedicos.length === 0) { setNewError({ field: 'medicos', message: 'Agrega al menos un médico.' }); return; }
    if (!newConsumo.trim()) { setNewError({ field: 'consumo', message: 'Ingresa el consumo.' }); return; }
    setNewError(null);
    createMutation.mutate();
  };

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
            <h1 style={styles.title}>Solicitud de programación</h1>
          </div>

          <div style={styles.tabsRow}>
            <div style={styles.tabs}>
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  className="btn-press"
                  style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}
                  onClick={() => selectTab(t.key)}
                >
                  {t.label}
                  <span style={{ ...styles.tabBadge, ...(active ? styles.tabBadgeActive : {}) }}>{t.count}</span>
                </button>
              );
            })}
            </div>

            <button className="btn-press header-btn-primary" style={styles.newBtn} onClick={openNewModal}>
              <Plus size={16} />
              Nueva solicitud
            </button>
          </div>
        </div>

        {isLoading && items.length === 0 ? (
          <div style={styles.emptyState}>Cargando...</div>
        ) : items.length === 0 ? (
          <div style={styles.emptyState}>No hay solicitudes {tab !== 'TODO' ? `en estado ${ESTADO_LABELS[tab]?.toLowerCase()}` : ''}</div>
        ) : (
          <div style={styles.list}>
            {groups.map(group => (
              <div key={group.key}>
                <div style={styles.groupHeader}>
                  <span style={styles.groupHeaderLabel}>{group.label}</span>
                  <span style={styles.groupHeaderCount}>{group.items.length} solicitud{group.items.length !== 1 ? 'es' : ''}</span>
                </div>
                <div style={styles.groupList}>
                {group.items.map(item => (
              <div key={item.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <div style={styles.cardTopLeft}>
                    <div style={styles.cardDateCol}>
                      <span style={styles.cardDateLabel}>Fecha Qx solicitada</span>
                      <span style={styles.cardFecha}>{formatFecha(item.fechaQx)} {item.horaQx ? `· ${item.horaQx}` : ''}</span>
                    </div>
                    <EstadoBadge estado={item.estado} />
                    {item.estado === 'PENDIENTE' && item.fechaQx && item.fechaQx.slice(0, 10) < todayMexico && (
                      <span style={styles.overdueBadge}>
                        <AlertTriangle size={11} />
                        Fecha ya pasó
                      </span>
                    )}
                  </div>
                  {esRevisor && item.estado === 'PENDIENTE' && (
                    <div style={styles.actionsCell}>
                      <button
                        type="button"
                        style={styles.thumbBtn}
                        title="Aprobar"
                        disabled={reviewMutation.isPending}
                        onClick={() => reviewMutation.mutate({ id: item.id, estado: 'APROBADA' })}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e9f2d8'; e.currentTarget.style.color = '#4f6b17'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
                      >
                        <ThumbsUp size={15} />
                      </button>
                      <button
                        type="button"
                        style={styles.thumbBtn}
                        title="Rechazar"
                        disabled={reviewMutation.isPending}
                        onClick={() => setRejectTarget(item)}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.color = '#991b1b'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
                      >
                        <ThumbsDown size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div style={styles.cardGrid}>
                  <div><span style={styles.cardLabel}>Sede</span><div style={styles.cardValue}>{item.sede ?? '-'}</div></div>
                  <div><span style={styles.cardLabel}>Hospital</span><div style={styles.cardValue}>{item.hospital ?? '-'}</div></div>
                  <div><span style={styles.cardLabel}>Médico(s)</span><div style={styles.cardValue}>{item.medicos.map(m => m.nombreCompleto).join(', ') || '-'}</div></div>
                </div>

                <div style={styles.cardConsumo}>
                  <span style={styles.cardLabel}>Consumo</span>
                  <div style={styles.cardValue}>{item.consumo ?? '-'}</div>
                </div>

                {item.observaciones && (
                  <div style={styles.cardConsumo}>
                    <span style={styles.cardLabel}>Observaciones</span>
                    <div style={styles.cardValue}>{item.observaciones}</div>
                  </div>
                )}

                {item.estado === 'RECHAZADA' && item.motivoRechazo && (
                  <div style={styles.motivoBox}>
                    <span style={{ fontWeight: 700 }}>Motivo del rechazo:</span> {item.motivoRechazo}
                  </div>
                )}

                {item.estado === 'APROBADA' && item.programacionId && (
                  <button
                    type="button"
                    style={styles.linkProgramacion}
                    onClick={() => navigate(`/operacion/programaciones/${item.programacionId}`)}
                  >
                    Ver programación creada →
                  </button>
                )}

                <div style={styles.cardMetaRow}>
                  <span style={styles.cardMetaItem}>
                    <span style={styles.cardMetaAvatar}>{getInitials(item.solicitante ?? '?')}</span>
                    Solicitado por <strong style={styles.cardMetaName}>{item.solicitante ?? '-'}</strong> · {formatFecha(item.createdAt)}
                  </span>
                  {item.revisor && (
                    <span style={styles.cardMetaItem}>
                      <span style={styles.cardMetaAvatar}>{getInitials(item.revisor)}</span>
                      Revisado por <strong style={styles.cardMetaName}>{item.revisor}</strong>
                    </span>
                  )}
                </div>
              </div>
                ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, ...(page === 1 ? styles.pageBtnDisabled : {}) }}
            >
              <MaterialIcon name="chevron_left" size={16} /> Anterior
            </button>
            <span style={styles.pageLabel}>Página {page} de {data.totalPages} · {data.total} registros</span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              style={{ ...styles.pageBtn, ...(page === data.totalPages ? styles.pageBtnDisabled : {}) }}
            >
              Siguiente <MaterialIcon name="chevron_right" size={16} />
            </button>
          </div>
        )}
      </div>

      {showNewModal && (
        <div className="modal-overlay-anim" style={styles.modalOverlayForm} onClick={() => setShowNewModal(false)}>
          <div className="modal-content-anim" style={styles.formModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.formModalHeader}>
              <h2 style={styles.modalTitle}>Nueva solicitud de programación</h2>
              <button style={styles.closeBtn} onClick={() => setShowNewModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.formModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Fecha QX *</label>
                <input
                  type="date"
                  min={todayMexico}
                  style={{ ...styles.input, ...(newError?.field === 'fechaQx' ? styles.inputError : {}) }}
                  value={newForm.fechaQx}
                  onChange={e => {
                    const fechaQx = e.target.value;
                    const esHoy = fechaQx === todayMexico;
                    const [h, m] = newForm.horaQx.split(':');
                    const horaInvalida = esHoy && h && (Number(h) < Number(nowMexicoTime.split(':')[0])
                      || (Number(h) === Number(nowMexicoTime.split(':')[0]) && m && Number(m) < Number(nowMexicoTime.split(':')[1])));
                    setNewForm({ ...newForm, fechaQx, horaQx: horaInvalida ? '' : newForm.horaQx });
                    setNewError(null);
                  }}
                />
                {newError?.field === 'fechaQx' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hora QX *</label>
                <div style={styles.horaGrid}>
                  <select
                    style={{ ...styles.input, ...(newError?.field === 'horaQx' ? styles.inputError : {}) }}
                    value={newForm.horaQx.split(':')[0] ?? ''}
                    onChange={e => {
                      const minuto = newForm.horaQx.split(':')[1] ?? '00';
                      setNewForm({ ...newForm, horaQx: `${e.target.value}:${minuto}` });
                      setNewError(null);
                    }}
                  >
                    <option value="">HH</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).filter(h => Number(h) >= minHour).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <select
                    style={{ ...styles.input, ...(newError?.field === 'horaQx' ? styles.inputError : {}) }}
                    value={newForm.horaQx.split(':')[1] ?? ''}
                    onChange={e => {
                      const hora = newForm.horaQx.split(':')[0] ?? '00';
                      setNewForm({ ...newForm, horaQx: `${hora}:${e.target.value}` });
                      setNewError(null);
                    }}
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).filter(m => Number(m) >= minMinute).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {newError?.field === 'horaQx' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Sede *</label>
                <div style={styles.sedeGrid}>
                  {sedeOptions.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      style={{ ...styles.sedeBtn, ...(newForm.sedeId === s.id ? styles.sedeBtnActive : {}), ...(newError?.field === 'sedeId' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setNewForm({ ...newForm, sedeId: s.id }); setNewError(null); e.currentTarget.blur(); }}
                    >
                      {newForm.sedeId === s.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {newError?.field === 'sedeId' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Hospital *</label>
                {selectedNewHospital && (
                  <div style={styles.medicoTagsWrap}>
                    <span style={styles.medicoTag}>
                      {selectedNewHospital.nombre}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewForm({ ...newForm, hospitalId: '' })} />
                    </span>
                  </div>
                )}
                {!selectedNewHospital && (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={{ ...styles.input, ...(newError?.field === 'hospitalId' ? styles.inputError : {}) }}
                      placeholder="Buscar hospital..."
                      value={newHospitalSearch}
                      onChange={e => { setNewHospitalSearch(e.target.value); setNewError(null); }}
                    />
                    {newHospitalSearch.trim() && (
                      <div style={styles.medicoDropdown}>
                        {newHospitalResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          newHospitalResults.map(h => (
                            <div
                              key={h.id}
                              style={styles.medicoDropdownItem}
                              onClick={() => { setNewForm({ ...newForm, hospitalId: h.id }); setNewHospitalSearch(''); setNewError(null); }}
                            >
                              <Plus size={14} /> {h.nombre}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {newError?.field === 'hospitalId' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              {selectedNewHospital?.ciudadCat?.nombre && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>Ciudad QX</label>
                  <span style={styles.ciudadPill}>{selectedNewHospital.ciudadCat.nombre}</span>
                </div>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Médico *</label>
                {newMedicos.length > 0 && (
                  <div style={styles.medicoTagsWrap}>
                    {newMedicos.map(m => (
                      <span key={m.id} style={styles.medicoTag}>
                        {m.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setNewMedicos(newMedicos.filter(x => x.id !== m.id))} />
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={{ ...styles.input, ...(newError?.field === 'medicos' ? styles.inputError : {}) }}
                    placeholder="Buscar médico..."
                    value={newMedicoSearch}
                    onChange={e => { setNewMedicoSearch(e.target.value); setNewError(null); }}
                  />
                  {newMedicoSearch.trim() && (
                    <div style={styles.medicoDropdown}>
                      {newMedicoResults.filter(m => !newMedicos.some(x => x.id === m.id)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        newMedicoResults.filter(m => !newMedicos.some(x => x.id === m.id)).map(m => (
                          <div
                            key={m.id}
                            style={styles.medicoDropdownItem}
                            onClick={() => { setNewMedicos([...newMedicos, m]); setNewMedicoSearch(''); }}
                          >
                            <Plus size={14} /> {m.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {newError?.field === 'medicos' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Consumo *</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const, ...(newError?.field === 'consumo' ? styles.inputError : {}) }}
                  value={newConsumo}
                  onChange={e => { setNewConsumo(e.target.value); setNewError(null); autoResizeTextarea(e.target); }}
                />
                {newError?.field === 'consumo' && <span style={styles.errorText}>{newError.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Observaciones</label>
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={newObservaciones}
                  onChange={e => { setNewObservaciones(e.target.value); autoResizeTextarea(e.target); }}
                  placeholder="Observaciones adicionales"
                />
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowNewModal(false)}>
                Cancelar
              </button>
              <button style={styles.saveBtn} onClick={handleGuardarNew} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <RechazarModal
          item={rejectTarget}
          submitting={reviewMutation.isPending}
          onCancel={() => setRejectTarget(null)}
          onConfirm={motivoRechazo => reviewMutation.mutate({ id: rejectTarget.id, estado: 'RECHAZADA', motivoRechazo })}
        />
      )}

      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem', maxWidth: '1100px', margin: '0 auto' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  newBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },

  tabsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' as const },
  tabs: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  tab: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#374151', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  tabActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  tabBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.5rem', height: '1.35rem', padding: '0 0.4rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700 },
  tabBadgeActive: { backgroundColor: '#dbe8c2', color: '#3f6510' },

  emptyState: { padding: '3rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.9rem', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #eeeee6' },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', border: '1px solid #eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },

  list: { display: 'flex', flexDirection: 'column' as const, gap: '1.5rem' },
  groupHeader: { display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid #e5e7eb' },
  groupHeaderLabel: { fontSize: '0.8rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.03em' },
  groupHeaderCount: { fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500 },
  groupList: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  card: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' },
  cardTopLeft: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' as const },
  cardDateCol: { display: 'flex', flexDirection: 'column' as const, gap: '0.1rem' },
  cardDateLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  cardFecha: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f' },
  overdueBadge: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#fee2e2', color: '#991b1b', whiteSpace: 'nowrap' as const },
  actionsCell: { display: 'flex', alignItems: 'center', gap: '0.3rem' },
  thumbBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '7px', border: 'none', backgroundColor: 'transparent', color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s ease' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem 1.25rem' },
  cardLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  cardValue: { fontSize: '0.85rem', color: '#333', marginTop: '0.15rem' },
  cardConsumo: { paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' },
  motivoBox: { backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', padding: '0.6rem 0.85rem', fontSize: '0.82rem', color: '#7f1d1d' },
  linkProgramacion: { alignSelf: 'flex-start' as const, border: 'none', background: 'transparent', color: '#4d7a13', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', padding: 0 },
  cardMetaRow: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f6' },
  cardMetaItem: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#6b7280', backgroundColor: '#f9fafb', padding: '0.25rem 0.65rem 0.25rem 0.25rem', borderRadius: '999px' },
  cardMetaAvatar: { width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#1f2937', color: '#fff', fontSize: '0.55rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardMetaName: { color: '#374151', fontWeight: 700 },

  modalOverlay: { position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 },
  modalBox: { backgroundColor: '#fff', borderRadius: '14px', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: '0 0 0.25rem' },
  modalSubtitle: { fontSize: '0.82rem', color: '#6b7280', margin: '0 0 1rem' },
  modalLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '0.4rem' },
  modalTextarea: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const, outline: 'none' },
  inputError: { border: '1.5px solid #dc2626' },
  errorText: { display: 'block', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, marginTop: '0.2rem' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' },
  modalBtnSecondary: { padding: '0.55rem 1.1rem', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  modalBtnDanger: { padding: '0.55rem 1.1rem', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },

  modalOverlayForm: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  formModalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  formModalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', position: 'sticky' as const, top: 0, zIndex: 1 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  formModalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#555', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit' },
  horaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' },
  sedeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  sedeBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  sedeBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  ciudadPill: { display: 'inline-flex', alignSelf: 'flex-start' as const, padding: '0.4rem 0.85rem', borderRadius: '999px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.85rem', fontWeight: 600, color: '#374151' },
  medicoTagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  medicoTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600 },
  medicoDropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  medicoDropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' as const },
  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
