import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import {
  autorizacionConsumosService,
  type EstadoAutorizacion,
  type AutorizacionConsumoItem,
} from '../../../services/autorizacionConsumos.service';

type TabKey = 'PENDIENTE' | 'AUTORIZADO' | 'NO AUTORIZADO' | 'TODO';

const ESTADO_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDIENTE: { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
  AUTORIZADO: { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  'NO AUTORIZADO': { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
};

function EstadoBadge({ estado }: { estado: string | null }) {
  const c = ESTADO_COLORS[estado ?? ''] ?? { bg: '#f3f4f6', text: '#555', dot: '#9ca3af' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700, backgroundColor: c.bg, color: c.text, whiteSpace: 'nowrap' as const }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {estado ?? '-'}
    </span>
  );
}

function RechazarModal({ item, onCancel, onConfirm, submitting }: {
  item: AutorizacionConsumoItem;
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
        <h3 style={styles.modalTitle}>Rechazar consumo</h3>
        <p style={styles.modalSubtitle}>{item.proVal ?? 'Producto validado'}</p>
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

export default function AutorizacionConsumosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('PENDIENTE');
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<AutorizacionConsumoItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = rejectTarget ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [rejectTarget]);

  // Le da sombra a la tarjeta fija (título + tabs) solo mientras está "pegada" arriba por el
  // scroll — mismo patrón que Solicitud de Programación / Remisiones.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const estado: EstadoAutorizacion | undefined = tab === 'TODO' ? undefined : tab;

  const { data, isLoading } = useQuery({
    queryKey: ['autorizacion-consumos', estado, page],
    queryFn: () => autorizacionConsumosService.findAll(estado, page),
  });

  const selectTab = (key: TabKey) => { setTab(key); setPage(1); };

  const mutation = useMutation({
    mutationFn: ({ id, estado, motivo }: { id: string; estado: 'AUTORIZADO' | 'NO AUTORIZADO'; motivo?: string }) =>
      autorizacionConsumosService.updateEstado(id, { estado, motivo }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['autorizacion-consumos'] });
      setToastMessage(variables.estado === 'AUTORIZADO' ? 'Consumo autorizado' : 'Consumo rechazado');
      setRejectTarget(null);
    },
  });

  const grupos = data?.grupos ?? [];
  const conteos = data?.conteos;
  const totalGeneral = (conteos?.PENDIENTE ?? 0) + (conteos?.AUTORIZADO ?? 0) + (conteos?.['NO AUTORIZADO'] ?? 0);

  const TABS: { key: TabKey; label: string; count: number | undefined }[] = [
    { key: 'PENDIENTE', label: 'Pendiente', count: conteos?.PENDIENTE },
    { key: 'AUTORIZADO', label: 'Autorizado', count: conteos?.AUTORIZADO },
    { key: 'NO AUTORIZADO', label: 'Rechazado', count: conteos?.['NO AUTORIZADO'] },
    { key: 'TODO', label: 'Todo', count: conteos ? totalGeneral : undefined },
  ];

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
            <h1 style={styles.title}>Autorización de Consumos</h1>
          </div>

          <div style={styles.tabs}>
            {TABS.map(t => (
              <button
                key={t.key}
                className="btn-press"
                style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
                <span style={{ ...styles.tabBadge, ...(tab === t.key ? styles.tabBadgeActive : {}) }}>{t.count ?? '-'}</span>
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div style={styles.emptyState}>Cargando...</div>
        ) : grupos.length === 0 ? (
          <div style={styles.emptyState}>No hay consumos {tab !== 'TODO' ? `en estado ${tab.toLowerCase()}` : ''}</div>
        ) : (
          <div style={styles.grupoList}>
            {grupos.map((grupo, gi) => (
              <div key={grupo.remisionId ?? `sin-remision-${gi}`} style={styles.grupoCard}>
                <div style={styles.grupoHeader}>
                  <span
                    style={{ ...styles.grupoFolio, cursor: grupo.remisionId ? 'pointer' : 'default' }}
                    onClick={() => grupo.remisionId && navigate(`/operacion/remisiones/${grupo.remisionId}`)}
                  >
                    {grupo.numRemision ?? 'Sin remisión'}
                  </span>
                  <span style={styles.badge}>{grupo.items.length}</span>
                </div>

                <div style={styles.colHeaderRow}>
                  <span style={styles.colHeaderText}>Estado</span>
                  <span style={styles.colHeaderText}>Sede Consumo</span>
                  <span style={styles.colHeaderText}>Sede Usuario</span>
                  <span style={{ ...styles.colHeaderText, textAlign: 'right' as const }}>Can Val</span>
                  <span style={styles.colHeaderText}>Pro Val</span>
                  <span />
                </div>

                {grupo.items.map(item => (
                  <div
                    key={item.id}
                    style={styles.itemRow}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                  >
                    <div style={styles.actionsCell}>
                      {item.estadoAutorizacion === 'PENDIENTE' ? (
                        <>
                          <button
                            type="button"
                            style={styles.thumbBtn}
                            title="Autorizar"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ id: item.id, estado: 'AUTORIZADO' })}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e9f2d8'; e.currentTarget.style.color = '#4f6b17'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
                          >
                            <ThumbsUp size={15} />
                          </button>
                          <button
                            type="button"
                            style={styles.thumbBtn}
                            title="Rechazar"
                            disabled={mutation.isPending}
                            onClick={() => setRejectTarget(item)}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fee2e2'; e.currentTarget.style.color = '#991b1b'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
                          >
                            <ThumbsDown size={15} />
                          </button>
                        </>
                      ) : (
                        <EstadoBadge estado={item.estadoAutorizacion} />
                      )}
                    </div>
                    <div
                      style={styles.itemCell}
                      onClick={() => navigate(`/operacion/producto-validado/${item.id}`)}
                    >
                      {item.sedeConsumo ?? '-'}
                    </div>
                    <div
                      style={styles.itemCell}
                      onClick={() => navigate(`/operacion/producto-validado/${item.id}`)}
                    >
                      {item.sedeUsuario ?? '-'}
                    </div>
                    <div
                      style={{ ...styles.itemCell, textAlign: 'right' as const }}
                      onClick={() => navigate(`/operacion/producto-validado/${item.id}`)}
                    >
                      {item.canVal}
                    </div>
                    <div
                      style={{ ...styles.itemCell, ...styles.itemCellTruncate }}
                      title={item.proVal ?? undefined}
                      onClick={() => navigate(`/operacion/producto-validado/${item.id}`)}
                    >
                      {item.proVal ?? '-'}
                    </div>
                    <div
                      style={styles.chevronCell}
                      onClick={() => navigate(`/operacion/producto-validado/${item.id}`)}
                    >
                      <ChevronRight size={16} color="#9ca3af" />
                    </div>
                  </div>
                ))}
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

      {rejectTarget && (
        <RechazarModal
          item={rejectTarget}
          submitting={mutation.isPending}
          onCancel={() => setRejectTarget(null)}
          onConfirm={motivo => mutation.mutate({ id: rejectTarget.id, estado: 'NO AUTORIZADO', motivo })}
        />
      )}

      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem', maxWidth: '1200px', margin: '0 auto' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },

  tabs: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const },
  tab: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #e5e7eb', borderRadius: '12px', backgroundColor: '#fff', color: '#374151', fontSize: '0.84375rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const },
  tabActive: { backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510' },
  tabBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1.5rem', height: '1.35rem', padding: '0 0.4rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700 },
  tabBadgeActive: { backgroundColor: '#dbe8c2', color: '#3f6510' },

  emptyState: { padding: '3rem', textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.9rem', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #eeeee6' },

  grupoList: { display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  grupoCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', overflowX: 'auto' as const, overflowY: 'hidden' as const },
  grupoHeader: { display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1.1rem', borderBottom: '1px solid #f3f4f6', backgroundColor: '#fafaf8' },
  grupoFolio: { fontFamily: 'monospace', fontSize: '0.85rem', fontWeight: 700, color: '#db2777' },
  badge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },

  colHeaderRow: { display: 'grid', gridTemplateColumns: '110px 1fr 1fr 90px 2fr 24px', padding: '0.5rem 1.1rem', gap: '0.5rem', minWidth: '850px' },
  colHeaderText: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },

  itemRow: { display: 'grid', gridTemplateColumns: '110px 1fr 1fr 90px 2fr 24px', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 1.1rem', borderTop: '1px solid #f3f4f6', transition: 'background-color 0.15s ease', minWidth: '850px' },
  actionsCell: { display: 'flex', alignItems: 'center', gap: '0.3rem' },
  thumbBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '7px', border: 'none', backgroundColor: 'transparent', color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s ease' },
  itemCell: { fontSize: '0.85rem', color: '#333', cursor: 'pointer' },
  itemCellTruncate: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  chevronCell: { display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },

  modalOverlay: { position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 },
  modalBox: { backgroundColor: '#fff', borderRadius: '14px', padding: '1.5rem', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: '0 0 0.25rem' },
  modalSubtitle: { fontSize: '0.82rem', color: '#6b7280', margin: '0 0 1rem' },
  modalLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '0.4rem' },
  modalTextarea: { width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.88rem', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const, outline: 'none' },
  inputError: { borderColor: '#dc2626' },
  errorText: { display: 'block', color: '#dc2626', fontSize: '0.75rem', marginTop: '0.3rem', fontWeight: 600 },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' },
  modalBtnSecondary: { padding: '0.55rem 1.1rem', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },
  modalBtnDanger: { padding: '0.55rem 1.1rem', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
};
