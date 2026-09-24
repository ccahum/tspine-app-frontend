import { useState, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, X } from 'lucide-react';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import HeaderBackReveal from '../../../components/HeaderBackReveal';
import SuccessToast from '../../../components/SuccessToast';
import {
  perfilesAdminService,
  type PerfilAdminItem,
  type SubmoduleCatalogItem,
} from '../../../services/perfilesAdmin.service';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';

const REGLAS_OPTIONS: { value: string; label: string }[] = [
  { value: 'READ_ONLY', label: 'Solo lectura' },
  { value: 'ADDS_AND_UPDATES', label: 'Agrega y edita' },
  { value: 'ALL_CHANGES', label: 'Todos los cambios' },
];
const reglaLabel = (value: string) => REGLAS_OPTIONS.find(r => r.value === value)?.label ?? value;

function AccesoBadge({ restringido, cantidad }: { restringido: boolean; cantidad: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.25rem 0.65rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 700,
        backgroundColor: restringido ? '#fef3c7' : '#dcfce7',
        color: restringido ? '#92400e' : '#166534',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: restringido ? '#d97706' : '#16a34a', flexShrink: 0 }} />
      {restringido ? `${cantidad} submódulo${cantidad === 1 ? '' : 's'}` : 'Acceso total'}
    </span>
  );
}

function NuevoPerfilModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [reglas, setReglas] = useState('READ_ONLY');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => perfilesAdminService.create({ nombre: nombre.trim(), reglas }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfiles-admin'] });
      onCreated(`Perfil ${nombre} creado — ahora puedes configurarle sus accesos`);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'No se pudo crear el perfil'),
  });

  const handleGuardar = () => {
    if (!nombre.trim()) { setError('Ingresa el nombre del perfil.'); return; }
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo perfil</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Nombre *</label>
            <input style={styles.formInput} value={nombre} onChange={e => { setNombre(e.target.value); setError(null); }} autoFocus />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Reglas</label>
            <select style={styles.formInput} value={reglas} onChange={e => setReglas(e.target.value)}>
              {REGLAS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <p style={styles.hintText}>Al crearlo queda sin restricción de acceso — configúrale los módulos permitidos después, desde "Editar accesos".</p>
          {error && <span style={styles.errorText}>{error}</span>}
          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button style={styles.saveBtn} onClick={handleGuardar} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditarPerfilModal({
  item,
  catalogo,
  onClose,
  onSaved,
}: {
  item: PerfilAdminItem;
  catalogo: SubmoduleCatalogItem[];
  onClose: () => void;
  onSaved: (mensaje: string) => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(item.nombre);
  const [reglas, setReglas] = useState(item.reglas);
  const [accesoRestringido, setAccesoRestringido] = useState(item.accesoRestringido);
  const [vistasSeleccionadas, setVistasSeleccionadas] = useState<Set<string>>(new Set(item.vistas));
  const [error, setError] = useState<string | null>(null);

  const gruposCatalogo = catalogo.reduce<Record<string, { moduloLabel: string; items: SubmoduleCatalogItem[] }>>((acc, s) => {
    if (!acc[s.modulo]) acc[s.modulo] = { moduloLabel: s.moduloLabel, items: [] };
    acc[s.modulo].items.push(s);
    return acc;
  }, {});

  const toggleVista = (id: string) => {
    setVistasSeleccionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await perfilesAdminService.update(item.id, { nombre: nombre.trim(), reglas });
      return perfilesAdminService.updateAccesos(item.id, {
        accesoRestringido,
        // Siempre a Dashboard tras iniciar sesión — este campo no se usa desde la UI.
        vistaInicial: null,
        vistas: accesoRestringido ? Array.from(vistasSeleccionadas) : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfiles-admin'] });
      onSaved(`Perfil ${nombre} actualizado`);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'No se pudo guardar el perfil'),
  });

  const handleGuardar = () => {
    if (!nombre.trim()) { setError('Ingresa el nombre del perfil.'); return; }
    if (accesoRestringido && vistasSeleccionadas.size === 0) {
      setError('Marca al menos un submódulo, o desactiva la restricción de acceso.');
      return;
    }
    setError(null);
    saveMutation.mutate();
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Editar perfil</h2>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Nombre *</label>
            <input style={styles.formInput} value={nombre} onChange={e => { setNombre(e.target.value); setError(null); }} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Reglas</label>
            <select style={styles.formInput} value={reglas} onChange={e => setReglas(e.target.value)}>
              {REGLAS_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={accesoRestringido}
              onChange={e => setAccesoRestringido(e.target.checked)}
            />
            Restringir acceso a módulos específicos
          </label>

          {accesoRestringido && (
            <>
              <div style={styles.formGroup}>
                {Object.entries(gruposCatalogo).map(([modulo, grupo]) => (
                  <div key={modulo} style={{ marginBottom: '0.9rem' }}>
                    <span style={styles.grupoLabel}>{grupo.moduloLabel}</span>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.4rem', marginTop: '0.4rem' }}>
                      {grupo.items.map(s => (
                        <label key={s.id} style={styles.checkboxRow}>
                          <input type="checkbox" checked={vistasSeleccionadas.has(s.id)} onChange={() => toggleVista(s.id)} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

            </>
          )}

          {error && <span style={styles.errorText}>{error}</span>}

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button style={styles.saveBtn} onClick={handleGuardar} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PerfilCard = memo(({ item, onSelect }: { item: PerfilAdminItem; onSelect: (item: PerfilAdminItem) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardNombre}>{item.nombre}</span>
      <AccesoBadge restringido={item.accesoRestringido} cantidad={item.vistas.length} />
    </div>
    <div style={styles.mobileCardCorreo}>{reglaLabel(item.reglas)}</div>
  </div>
));

export default function PerfilesAdminPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selected, setSelected] = useState<PerfilAdminItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = (showCreateModal || selected) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showCreateModal, selected]);

  const { data: perfiles = [], isLoading } = useQuery({
    queryKey: ['perfiles-admin'],
    queryFn: () => perfilesAdminService.findAll(),
  });

  const { data: catalogo = [] } = useQuery({
    queryKey: ['perfiles-admin-catalogo-vistas'],
    queryFn: () => perfilesAdminService.findCatalogoVistas(),
  });

  const filtrados = perfiles.filter(p => !search.trim() || p.nombre.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <div style={styles.pageWrapper}>
        <div style={styles.contentCard}>
          <div style={styles.header}>
            <HeaderBackReveal
              onBack={() => navigate(-1)}
              icon={<MaterialIcon name="key" size={26} color="#4d7a13" />}
              size={50}
              badgeRadius={16}
              mobileIconAsBack={isMobile}
            >
              <h1 style={styles.title}>Perfiles</h1>
            </HeaderBackReveal>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar perfil..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.newBtn} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nuevo perfil
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${filtrados.length} perfiles`}</span>
          </div>
        </div>

        <div style={styles.tableWrap}>
          {isLoading ? (
            <div style={styles.empty}>Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : isMobile ? (
            <div style={styles.mobileCardList}>
              {filtrados.map(item => (
                <PerfilCard key={item.id} item={item} onSelect={setSelected} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['Nombre', 'Reglas', 'Acceso'].map((h, i) => (
                    <th key={i} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(item => (
                  <tr
                    key={item.id}
                    style={styles.tr}
                    onClick={() => setSelected(item)}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
                  >
                    <td style={{ ...styles.td, fontWeight: 600 }}>{item.nombre}</td>
                    <td style={styles.td}>{reglaLabel(item.reglas)}</td>
                    <td style={styles.td}><AccesoBadge restringido={item.accesoRestringido} cantidad={item.vistas.length} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && (
        <NuevoPerfilModal
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); }}
        />
      )}
      {selected && (
        <EditarPerfilModal
          item={selected}
          catalogo={catalogo}
          onClose={() => setSelected(null)}
          onSaved={msg => { setSelected(null); setToastMessage(msg); }}
        />
      )}
      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '280px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  newBtn: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  totalLabel: { fontSize: '0.8rem', color: '#999', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '16px', overflowX: 'auto' as const, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.875rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.7rem 0.875rem', textAlign: 'left' as const, fontWeight: 500, color: '#9ca3af', fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' as const, color: '#333' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#999' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' },
  mobileCardNombre: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardCorreo: { fontSize: '0.78rem', color: '#6b7280' },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  grupoLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#4d7a13', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  hintText: { fontSize: '0.75rem', color: '#6b7280', margin: 0 },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#374151', fontWeight: 600, cursor: 'pointer' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
};
