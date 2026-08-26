import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, X } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import {
  usuariosAdminService,
  type UsuarioAdminItem,
  type PerfilOption,
} from '../../../services/usuariosAdmin.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';

const EMAIL_DOMAIN = 'tecnologiaspine.com';

function EstadoBadge({ activo }: { activo: boolean }) {
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
        backgroundColor: activo ? '#dcfce7' : '#f3f4f6',
        color: activo ? '#166534' : '#6b7280',
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: activo ? '#16a34a' : '#9ca3af', flexShrink: 0 }} />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function TotpBadge({ activado }: { activado: boolean }) {
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
        backgroundColor: activado ? '#e9f2d8' : '#fef3c7',
        color: activado ? '#3f6510' : '#92400e',
      }}
    >
      {activado ? '2FA activo' : 'Sin configurar'}
    </span>
  );
}

function NuevoUsuarioModal({
  perfiles,
  sedes,
  onClose,
  onCreated,
}: {
  perfiles: PerfilOption[];
  sedes: SedeOption[];
  onClose: () => void;
  onCreated: (mensaje: string) => void;
}) {
  const queryClient = useQueryClient();
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [perfilId, setPerfilId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      usuariosAdminService.create({
        nombreCompleto: nombreCompleto.trim(),
        usuario: usuario.trim(),
        password,
        perfilId,
        sedeId: sedeId || undefined,
      }),
    onSuccess: (creado) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-admin'] });
      onCreated(`Usuario ${creado.nombreCompleto} creado`);
    },
    onError: (err: any) => {
      setError({ field: 'usuario', message: err?.response?.data?.message ?? 'No se pudo crear el usuario' });
    },
  });

  const handleGuardar = () => {
    if (!nombreCompleto.trim()) { setError({ field: 'nombreCompleto', message: 'Ingresa el nombre completo.' }); return; }
    if (!usuario.trim()) { setError({ field: 'usuario', message: 'Ingresa el nombre de usuario.' }); return; }
    if (!password || password.length < 8) { setError({ field: 'password', message: 'La contraseña debe tener al menos 8 caracteres.' }); return; }
    if (!perfilId) { setError({ field: 'perfilId', message: 'Selecciona un perfil.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo usuario</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Nombre completo *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'nombreCompleto' ? styles.inputError : {}) }}
              value={nombreCompleto}
              onChange={e => { setNombreCompleto(e.target.value); setError(null); }}
              placeholder="Juan Pérez"
            />
            {error?.field === 'nombreCompleto' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Usuario *</label>
            <div style={styles.usuarioInputWrap}>
              <input
                style={{ ...styles.formInput, ...(error?.field === 'usuario' ? styles.inputError : {}) }}
                value={usuario}
                onChange={e => { setUsuario(e.target.value.trim()); setError(null); }}
                placeholder="jperez"
              />
              <span style={styles.usuarioDomain}>@{EMAIL_DOMAIN}</span>
            </div>
            {error?.field === 'usuario' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Contraseña inicial *</label>
            <input
              type="text"
              style={{ ...styles.formInput, ...(error?.field === 'password' ? styles.inputError : {}) }}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              placeholder="Mínimo 8 caracteres"
            />
            {error?.field === 'password' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Perfil *</label>
            <select
              style={{ ...styles.formInput, ...(error?.field === 'perfilId' ? styles.inputError : {}) }}
              value={perfilId}
              onChange={e => { setPerfilId(e.target.value); setError(null); }}
            >
              <option value="">Selecciona un perfil</option>
              {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {error?.field === 'perfilId' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Sede</label>
            <select style={styles.formInput} value={sedeId} onChange={e => setSedeId(e.target.value)}>
              <option value="">Sin sede asignada</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>

          <p style={styles.helpText}>
            El usuario deberá configurar su verificación en dos pasos (2FA) obligatoriamente la primera vez que inicie sesión.
          </p>

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button style={styles.saveBtn} onClick={handleGuardar} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditarUsuarioModal({
  item,
  perfiles,
  sedes,
  onClose,
  onSaved,
}: {
  item: UsuarioAdminItem;
  perfiles: PerfilOption[];
  sedes: SedeOption[];
  onClose: () => void;
  onSaved: (mensaje: string) => void;
}) {
  const queryClient = useQueryClient();
  const [nombreCompleto, setNombreCompleto] = useState(item.nombreCompleto);
  const [perfilId, setPerfilId] = useState(item.perfilId ?? '');
  const [sedeId, setSedeId] = useState(item.sedeId ?? '');
  const [activo, setActivo] = useState(item.activo);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const updateMutation = useMutation({
    mutationFn: () =>
      usuariosAdminService.update(item.id, {
        nombreCompleto: nombreCompleto.trim(),
        perfilId: perfilId || undefined,
        sedeId: sedeId || undefined,
        activo,
        password: nuevaPassword || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios-admin'] });
      onSaved(`Usuario ${nombreCompleto} actualizado`);
    },
    onError: (err: any) => {
      setError({ field: 'general', message: err?.response?.data?.message ?? 'No se pudo actualizar el usuario' });
    },
  });

  const handleGuardar = () => {
    if (!nombreCompleto.trim()) { setError({ field: 'nombreCompleto', message: 'Ingresa el nombre completo.' }); return; }
    if (nuevaPassword && nuevaPassword.length < 8) { setError({ field: 'password', message: 'La contraseña debe tener al menos 8 caracteres.' }); return; }
    setError(null);
    updateMutation.mutate();
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Editar usuario</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Correo</label>
            <span style={styles.readOnlyField}>{item.correo}</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Nombre completo *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'nombreCompleto' ? styles.inputError : {}) }}
              value={nombreCompleto}
              onChange={e => { setNombreCompleto(e.target.value); setError(null); }}
            />
            {error?.field === 'nombreCompleto' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Perfil</label>
            <select style={styles.formInput} value={perfilId} onChange={e => setPerfilId(e.target.value)}>
              {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Sede</label>
            <select style={styles.formInput} value={sedeId} onChange={e => setSedeId(e.target.value)}>
              <option value="">Sin sede asignada</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Restablecer contraseña</label>
            <input
              type="text"
              style={{ ...styles.formInput, ...(error?.field === 'password' ? styles.inputError : {}) }}
              value={nuevaPassword}
              onChange={e => { setNuevaPassword(e.target.value); setError(null); }}
              placeholder="Dejar en blanco para no cambiarla"
            />
            {error?.field === 'password' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <label style={styles.checkboxRow}>
            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />
            Usuario activo (puede iniciar sesión)
          </label>

          {item.totpActivado && (
            <p style={styles.helpText}>Este usuario ya tiene la verificación en dos pasos configurada.</p>
          )}

          {error?.field === 'general' && <span style={styles.errorText}>{error.message}</span>}

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UsuariosAdminPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selected, setSelected] = useState<UsuarioAdminItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = (showCreateModal || selected) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showCreateModal, selected]);

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios-admin'],
    queryFn: () => usuariosAdminService.findAll(),
  });

  const { data: perfiles = [] } = useQuery({
    queryKey: ['usuarios-admin-perfiles'],
    queryFn: () => usuariosAdminService.findPerfiles(),
  });

  const { data: sedes = [] } = useQuery({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
  });

  const filtrados = usuarios.filter(u =>
    !search.trim()
    || u.nombreCompleto.toLowerCase().includes(search.trim().toLowerCase())
    || (u.correo ?? '').toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Layout>
      <div style={styles.pageWrapper}>
        <button
          type="button"
          onClick={() => navigate('/administracion')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={styles.contentCard}>
          <div style={styles.header}>
            <h1 style={styles.title}>Usuarios</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por nombre o usuario..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.newBtn} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nuevo usuario
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${filtrados.length} usuarios`}</span>
          </div>
        </div>

        <div style={styles.tableWrap}>
          {isLoading ? (
            <div style={styles.empty}>Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['Nombre', 'Usuario', 'Perfil', 'Sede', '2FA', 'Estado'].map((h, i) => (
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
                    <td style={{ ...styles.td, fontWeight: 600 }}>{item.nombreCompleto}</td>
                    <td style={styles.td}>{item.correo}</td>
                    <td style={styles.td}>{item.perfilNombre ?? '-'}</td>
                    <td style={styles.td}>{item.sedeNombre ?? '-'}</td>
                    <td style={styles.td}><TotpBadge activado={item.totpActivado} /></td>
                    <td style={styles.td}><EstadoBadge activo={item.activo} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreateModal && (
        <NuevoUsuarioModal
          perfiles={perfiles}
          sedes={sedes}
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); }}
        />
      )}
      {selected && (
        <EditarUsuarioModal
          item={selected}
          perfiles={perfiles}
          sedes={sedes}
          onClose={() => setSelected(null)}
          onSaved={msg => { setSelected(null); setToastMessage(msg); }}
        />
      )}
      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
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
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  readOnlyField: { fontSize: '0.85rem', color: '#6b7280' },
  usuarioInputWrap: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  usuarioDomain: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' as const },
  helpText: { fontSize: '0.78rem', color: '#92400e', backgroundColor: '#fef3c7', padding: '0.6rem 0.75rem', borderRadius: '8px', margin: 0, lineHeight: 1.4 },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#374151', fontWeight: 600, cursor: 'pointer' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
};
