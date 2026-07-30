import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader, FileText, CheckCircle, Circle } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { programacionesService, type ProgramacionDetail } from '../../../services/programaciones.service';
import { remisionesService, type RemisionItem, type RemTecnicoItem } from '../../../services/remisiones.service';

type Tab = 'resumen' | 'tecnicos';

const formatMoney = (value: any): string => {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    // Si es ISO timestamp (2026-12-01T00:00:00.000Z)
    if (dateString.includes('T')) {
      const date = new Date(dateString);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
    // Si es ISO date (2026-12-01)
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

export default function ProgramacionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('resumen');

  const { data: programacion, isLoading, error } = useQuery<ProgramacionDetail | null>({
    queryKey: ['programacion', id],
    queryFn: () => programacionesService.getById(id),
    enabled: !!id,
  });

  const { data: remisiones = [] } = useQuery<RemisionItem[]>({
    queryKey: ['remisiones', id],
    queryFn: () => remisionesService.findByProgramacion(id),
    enabled: !!id,
  });

  const { data: tecnicos = [] } = useQuery<RemTecnicoItem[]>({
    queryKey: ['remisiones-tecnicos', id],
    queryFn: () => remisionesService.findTecnicosByProgramacion(id),
    enabled: !!id,
  });

  if (isLoading) return <Layout><div style={{ padding: '2rem', textAlign: 'center' }}><Loader className="spinner" size={32} /></div></Layout>;
  if (error) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>Error al cargar: {(error as any)?.message || 'Error desconocido'}</div></Layout>;
  if (!programacion) return <Layout><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Programación no encontrada</div></Layout>;

  const tabItems: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'tecnicos', label: 'Técnicos' },
  ];

  return (
    <Layout>
      <div style={styles.container}>
        <div style={styles.header}>
          <button onClick={() => navigate(-1)} style={styles.backBtn}>
            <ArrowLeft size={18} /> Volver
          </button>
          <h1 style={styles.title}>{programacion.hospital?.nombre || 'Programación'}</h1>
          <button style={styles.editBtn}>Editar</button>
        </div>

        <div style={styles.topSection}>
          <div style={styles.infoCard}>
            <div style={styles.infoRow}>
              <span style={styles.label}>ID</span>
              <span style={styles.value}>{programacion.idLegacy || programacion.id}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Médico</span>
              <span style={styles.value}>{programacion.medicos?.map(m => m.medico.nombreCompleto).join(', ') || '-'}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Fecha QX</span>
              <span style={styles.value}>{formatDate(programacion.fechaQx)}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Hora QX</span>
              <span style={styles.value}>{programacion.horaQx || '-'}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Sede</span>
              <span style={styles.value}>{programacion.sede ? programacion.sede.nombre : '-'}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.label}>Ciudad QX</span>
              <span style={styles.value}>{programacion.hospital?.ciudadCat?.nombre || '-'}</span>
            </div>
          </div>

          <div style={styles.financialCard}>
            <h3 style={styles.cardTitle}>Resumen Financiero</h3>
            <div style={styles.financialGrid}>
              <div style={styles.finRow}>
                <span>SubTotal</span>
                <span style={styles.finValue}>{formatMoney(programacion.total)}</span>
              </div>
              <div style={styles.finRow}>
                <span>Descuentos</span>
                <span style={styles.finValue}>{formatMoney(programacion.descuentos)}</span>
              </div>
              <div style={styles.finRow}>
                <span>Notas Crédito</span>
                <span style={styles.finValue}>{formatMoney(programacion.nc)}</span>
              </div>
              <div style={styles.finRow}>
                <span>Ingreso Base</span>
                <span style={styles.finValue}>{formatMoney(programacion.baseIngreso)}</span>
              </div>
              <div style={styles.divider}></div>
              <div style={styles.finRow}>
                <span>Comisiones/Pus/Invers.</span>
                <span style={styles.finValue}>{formatMoney(programacion.comisiones)}</span>
              </div>
              <div style={styles.finRow}>
                <span>Costo Total</span>
                <span style={styles.finValue}>{formatMoney(programacion.costoTotal)}</span>
              </div>
              <div style={styles.finRow}>
                <span>Utilidad Bruta</span>
                <span style={styles.finValue}>{formatMoney(programacion.utilidadBruta)}</span>
              </div>
            </div>

            <div style={styles.divider}></div>
            <div style={styles.extraField}>
              <span style={styles.extraLabel}>Consumo</span>
              <span style={styles.extraValue}>{programacion.consumo || '-'}</span>
            </div>
            <div style={styles.extraField}>
              <span style={styles.extraLabel}>Observaciones</span>
              <span style={styles.extraValue}>{programacion.observaciones || '-'}</span>
            </div>
          </div>
        </div>

        {/* ── Remisiones + Rem_Técnicos ───────────────────────────── */}
        <div style={styles.relatedGrid}>

          {/* Remisiones */}
          <div>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Remisiones</h2>
              <span style={styles.badge}>{remisiones.length}</span>
            </div>
            {remisiones.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No hay remisiones</p>
            ) : (
              <div style={styles.remList}>
                {remisiones.map((rem, i) => (
                  <div key={rem.id} style={{ ...styles.remRow, ...(i > 0 ? styles.remRowBorder : {}) }}>
                    <div style={styles.remRowLeft}>
                      <FileText size={14} color="#6b8c1f" style={{ flexShrink: 0 }} />
                      <span style={styles.remRowCode}>{rem.numRemision || rem.id}</span>
                    </div>
                    <div style={styles.remRowRight}>
                      {rem.estado && (
                        <span style={{ ...styles.estadoBadge, ...(rem.estado === 'Definitiva' ? styles.estadoDefinitiva : styles.estadoOtro) }}>
                          {rem.estado}
                        </span>
                      )}
                      <div style={styles.cxcLabel}>
                        {rem.cxc
                          ? <><CheckCircle size={13} color="#16a34a" /><span style={{ color: '#16a34a' }}>Enviada a CxC</span></>
                          : <><Circle size={13} color="#9ca3af" /><span style={{ color: '#9ca3af' }}>Pendiente CxC</span></>
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Técnicos Asociados */}
          <div>
            <div style={styles.remisionesTitleRow}>
              <h2 style={styles.sectionTitle}>Técnicos Asociados</h2>
              <span style={styles.badge}>{tecnicos.length}</span>
            </div>
            {tecnicos.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No hay técnicos asociados</p>
            ) : (
              <div style={styles.remList}>
                <div style={{ ...styles.tecnicoRow, ...styles.colHeader }}>
                  <span style={styles.colHeaderText}>Nombre técnico</span>
                  <span style={{ ...styles.colHeaderText, textAlign: 'left' }}>N° Programación</span>
                  <span style={{ ...styles.colHeaderText, textAlign: 'left' }}>Remisión</span>
                </div>
                {tecnicos.map((t, i) => (
                  <div key={t.id} style={{ ...styles.tecnicoRow, ...styles.remRowBorder }}>
                    <div style={styles.remRowLeft}>
                      <span style={styles.tecnicoNombre}>{t.tecnico?.nombreCompleto || '-'}</span>
                      {t.categoria && <span style={styles.categoriaBadge}>{t.categoria}</span>}
                    </div>
                    <span style={styles.programacionRef}>{t.programacion?.numProgram || t.programacion?.id || '-'}</span>
                    <span style={styles.remisionRef}>{t.remision?.numRemision || t.remision?.id || '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        <div style={styles.tabBar}>
          {tabItems.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{ ...styles.tabBtn, ...(tab === key ? styles.tabBtnActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={styles.tabContent}>
          {tab === 'resumen' && (
            <div style={styles.section}>
              <p style={styles.sectionText}>Estado: {programacion.cerrada ? '✓ Cerrada' : '○ Abierta'}</p>
              <p style={styles.sectionText}>% Avance: {programacion.avance}%</p>
              {programacion.estadoRequisicion && (
                <p style={styles.sectionText}>Estado Requisición: {programacion.estadoRequisicion}</p>
              )}
            </div>
          )}

          {tab === 'tecnicos' && (
            <div style={styles.section}>
              {programacion.tecnicos && programacion.tecnicos.length > 0 ? (
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.tableCell}>Nombre</th>
                      <th style={styles.tableCell}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {programacion.tecnicos.map(t => (
                      <tr key={t.tecnico.id}>
                        <td style={styles.tableCell}>{t.tecnico.nombreCompleto}</td>
                        <td style={styles.tableCell}>{formatMoney(programacion.montoTecnicos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={styles.sectionText}>Sin técnicos asignados</p>
              )}
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', gap: '1rem' },
  backBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 },
  title: { flex: 1, fontSize: '1.75rem', fontWeight: 700, color: '#333' },
  editBtn: { padding: '0.5rem 1rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 },
  topSection: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '1.5rem', marginBottom: '2rem' },
  infoCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  infoRow: { display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  value: { fontSize: '0.875rem', fontWeight: 600, color: '#333' },
  financialCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: '1rem', fontWeight: 700, color: '#333', marginBottom: '1rem' },
  financialGrid: { marginBottom: '1.5rem' },
  finRow: { display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: '0.875rem', color: '#555' },
  finValue: { fontWeight: 600, color: '#333' },
  divider: { height: '1px', backgroundColor: '#e5e7eb', margin: '0.5rem 0' },
  highlight: { fontWeight: 700, color: '#6b8c1f' },
  extraField: { paddingTop: '0.75rem' },
  extraLabel: { display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.25rem' },
  extraValue: { display: 'block', fontSize: '0.875rem', color: '#555', lineHeight: '1.5', whiteSpace: 'pre-wrap' as const },
  // Remisiones
  relatedGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' },
  remisionesTitleRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' },
  sectionTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#333', margin: 0 },
  badge: { backgroundColor: '#e5e7eb', color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, minWidth: '1.5rem', height: '1.5rem', padding: '0 0.4rem', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  remisionesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' },
  remList: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6', overflow: 'hidden' },
  remRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem' },
  remRowBorder: { borderTop: '1px solid #f3f4f6' },
  remRowLeft: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  remRowCode: { fontSize: '0.875rem', fontWeight: 700, color: '#374151' },
  remRowRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  estadoBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '999px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  estadoDefinitiva: { backgroundColor: '#dcfce7', color: '#15803d' },
  estadoOtro: { backgroundColor: '#fef9c3', color: '#a16207' },
  cxcLabel: { display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600 },
  tecnicoRow: { display: 'grid', gridTemplateColumns: '1fr 140px 120px', alignItems: 'center', padding: '0.75rem 1.25rem', gap: '0.5rem' },
  colHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  colHeaderText: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  tecnicoNombre: { fontSize: '0.875rem', fontWeight: 600, color: '#374151' },
  categoriaBadge: { fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  programacionRef: { fontSize: '0.8rem', fontWeight: 700, color: '#374151' },
  remisionRef: { fontSize: '0.8rem', fontWeight: 700, color: '#e11d48' },
  tabBar: { display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' },
  tabBtn: { padding: '0.75rem 1rem', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#9ca3af', borderBottom: '2px solid transparent', transition: 'all 0.2s' },
  tabBtnActive: { color: '#6b8c1f', borderBottom: '2px solid #6b8c1f' },
  tabContent: { backgroundColor: '#fff', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  section: { minHeight: '200px' },
  sectionText: { fontSize: '0.875rem', color: '#555', lineHeight: '1.6', whiteSpace: 'pre-wrap' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  tableHeader: { backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' },
  tableCell: { padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #f3f4f6', color: '#555' },
};
