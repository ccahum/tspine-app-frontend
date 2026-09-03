import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';
import {
  preciosEspecialesService,
  type PrecioEspecialItem,
  type ProductoOption,
  type ContactoOption,
} from '../../../services/preciosEspeciales.service';

const productoLabelOf = (item: { productoReferencia: string | null; productoNombre: string | null }) =>
  [item.productoReferencia, item.productoNombre].filter(Boolean).join(' / ');

// No confiamos en el filtrado nativo de type="number" (algunos navegadores/webviews no lo aplican).
// Filtramos el valor explícitamente: solo dígitos y un único punto decimal.
const sanitizeDecimal = (value: string): string => {
  let cleaned = value.replace(/[^\d.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned;
};

const formatMoney = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PrecioEspecialRow = memo(({ item, rowNumber, onSelect }: { item: PrecioEspecialItem; rowNumber: number; onSelect: (item: PrecioEspecialItem) => void }) => (
  <tr
    style={styles.tr}
    onClick={() => onSelect(item)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{rowNumber}</td>
    <td style={styles.td}>
      <span style={styles.productoCode}>{item.productoReferencia ?? '-'}</span>
      {item.productoNombre && <span style={styles.productoNombre}> / {item.productoNombre}</span>}
    </td>
    <td style={styles.td}>{item.contacto ?? '-'}</td>
    <td style={{ ...styles.td, textAlign: 'right' as const, fontWeight: 700, color: '#16170f' }}>{formatMoney(item.precio)}</td>
    <td style={{ ...styles.td, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: '#6b6b60' }}>
      {item.notas || '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
      {item.buscable}
    </td>
  </tr>
));

const PrecioEspecialCard = memo(({ item, onSelect }: { item: PrecioEspecialItem; onSelect: (item: PrecioEspecialItem) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardId}>{item.productoReferencia ?? '-'}</span>
      {item.productoNombre && <span style={styles.mobileCardDate}>{item.productoNombre}</span>}
    </div>
    <div style={styles.mobileCardMainRow}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardConductor}>{item.contacto ?? 'Sin contacto'}</div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={styles.mobileCardField}>
        <span style={styles.mobileCardFieldLabel}>Precio</span>
        <span style={styles.mobileCardFieldValue}>{formatMoney(item.precio)}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Notas</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.notas || '-'}</span>
      </div>
    </div>
  </div>
));

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleRow}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

function DetalleModal({ item, onClose, onUpdated, onDeleted }: {
  item: PrecioEspecialItem;
  onClose: () => void;
  onUpdated: (message: string, updated: PrecioEspecialItem) => void;
  onDeleted: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMoreMenu]);

  const [productoId, setProductoId] = useState(item.productoId ?? '');
  const [productoLabel, setProductoLabel] = useState(productoLabelOf(item));
  const [contactoId, setContactoId] = useState(item.contactoId ?? '');
  const [contactoLabel, setContactoLabel] = useState(item.contacto ?? '');
  const [precio, setPrecio] = useState(item.precio !== null ? String(item.precio) : '');
  const [notas, setNotas] = useState(item.notas ?? '');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const startEditing = () => {
    setProductoId(item.productoId ?? '');
    setProductoLabel(productoLabelOf(item));
    setContactoId(item.contactoId ?? '');
    setContactoLabel(item.contacto ?? '');
    setPrecio(item.precio !== null ? String(item.precio) : '');
    setNotas(item.notas ?? '');
    setError(null);
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: () => preciosEspecialesService.updatePrecioEspecial(item.id, {
      productoId,
      contactoId,
      precio: Number(precio),
      notas: notas || undefined,
    }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['precios-especiales'] });
      setEditing(false);
      onUpdated('Precio especial actualizado', updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => preciosEspecialesService.deletePrecioEspecial(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-especiales'] });
      onDeleted('Precio especial eliminado');
    },
  });

  const handleGuardar = () => {
    if (!productoId) { setError({ field: 'producto', message: 'Selecciona el producto.' }); return; }
    if (!contactoId) { setError({ field: 'contacto', message: 'Selecciona el contacto.' }); return; }
    if (!precio || Number(precio) <= 0) { setError({ field: 'precio', message: 'Ingresa un precio mayor a cero.' }); return; }
    setError(null);

    const sinCambios =
      productoId === (item.productoId ?? '') &&
      contactoId === (item.contactoId ?? '') &&
      Number(precio) === Number(item.precio ?? 0) &&
      (notas.trim() || null) === item.notas;

    if (sinCambios) {
      setEditing(false);
      return;
    }

    updateMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`precio-especial-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Precio Especial</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!editing && !confirmDelete && (
              <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
                <button
                  className="btn-press header-btn-secondary"
                  style={styles.iconMenuBtn}
                  onClick={() => setShowMoreMenu(o => !o)}
                >
                  <MaterialIcon name="more_horiz" size={20} />
                </button>
                {showMoreMenu && (
                  <div style={styles.moreMenu}>
                    <button
                      style={styles.moreMenuItem}
                      onClick={() => { setShowMoreMenu(false); startEditing(); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="edit" size={17} />
                      Editar
                    </button>
                    <div style={styles.moreMenuDivider} />
                    <button
                      style={{ ...styles.moreMenuItem, ...styles.moreMenuItemDanger }}
                      onClick={() => { setShowMoreMenu(false); setConfirmDelete(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf0ec'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="delete" size={17} />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={styles.modalBody}>
          {confirmDelete ? (
            <div style={styles.confirmBox}>
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Eliminar el precio especial de <strong>{productoLabelOf(item) || 'este producto'}</strong>? Esta acción no se puede deshacer.</span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : editing ? (
            <>
              <ProductoPicker
                id="precio-especial-field-producto"
                error={error?.field === 'producto'}
                valueId={productoId}
                valueLabel={productoLabel}
                onSelect={(id, label) => { setProductoId(id); setProductoLabel(label); setError(null); }}
              />
              {error?.field === 'producto' && <span style={styles.errorText}>{error.message}</span>}

              <ContactoPicker
                id="precio-especial-field-contacto"
                error={error?.field === 'contacto'}
                valueId={contactoId}
                valueLabel={contactoLabel}
                onSelect={(id, label) => { setContactoId(id); setContactoLabel(label); setError(null); }}
              />
              {error?.field === 'contacto' && <span style={styles.errorText}>{error.message}</span>}

              <div style={styles.formGroup} id="precio-especial-field-precio">
                <label style={styles.formLabel}>Precio *</label>
                <div style={styles.stepperWrap}>
                  <span style={styles.pricePrefix}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={{ ...styles.formInput, ...(error?.field === 'precio' ? styles.inputError : {}), paddingLeft: '1.5rem', paddingRight: '5rem' }}
                    placeholder="0,00"
                    value={precio}
                    onChange={e => { setPrecio(sanitizeDecimal(e.target.value)); setError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => setPrecio(String(Math.max(0, (Number(precio) || 0) - 100)))}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => setPrecio(String((Number(precio) || 0) + 100))}>+</button>
                  </div>
                </div>
                {error?.field === 'precio' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Notas</label>
                <input style={styles.formInput} value={notas} onChange={e => setNotas(e.target.value)} />
              </div>

              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancelar</button>
                <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <DetalleRow label="ID">{item.id}</DetalleRow>
              <DetalleRow label="Producto">
                <span style={styles.productoCode}>{item.productoReferencia ?? '-'}</span>
                {item.productoNombre && <> / {item.productoNombre}</>}
              </DetalleRow>
              <DetalleRow label="Contacto">{item.contacto ?? '-'}</DetalleRow>
              <DetalleRow label="Precio">
                <span style={{ fontWeight: 700 }}>{formatMoney(item.precio)}</span>
              </DetalleRow>
              <DetalleRow label="Notas">
                <span style={{ fontWeight: 400, whiteSpace: 'pre-wrap' as const }}>{item.notas || '-'}</span>
              </DetalleRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductoPicker({ valueId, valueLabel, onSelect, id, error }: {
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<ProductoOption[]>({
    queryKey: ['precios-especiales-productos', search],
    queryFn: () => preciosEspecialesService.searchProductos(search),
    enabled: !!search.trim(),
  });

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>Producto *</label>
      {valueId ? (
        <span style={styles.selectedTag}>
          {valueLabel}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onSelect('', '')} />
        </span>
      ) : (
        <div style={{ position: 'relative' as const }}>
          <input
            style={{ ...styles.formInput, ...(error ? styles.inputError : {}) }}
            placeholder="Buscar producto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div style={styles.dropdown}>
              {results.length === 0 ? (
                <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
              ) : (
                results.map(p => (
                  <div
                    key={p.id}
                    style={styles.dropdownItem}
                    onClick={() => { onSelect(p.id, [p.referencia, p.nombre].filter(Boolean).join(' / ')); setSearch(''); }}
                  >
                    {p.referencia && <span style={styles.productoCode}>{p.referencia}</span>}
                    {p.nombre && <span style={{ marginLeft: p.referencia ? '0.4rem' : 0 }}>{p.nombre}</span>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContactoPicker({ valueId, valueLabel, onSelect, id, error }: {
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<ContactoOption[]>({
    queryKey: ['precios-especiales-contactos', search],
    queryFn: () => preciosEspecialesService.searchContactos(search),
    enabled: !!search.trim(),
  });

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>Contacto *</label>
      {valueId ? (
        <span style={styles.selectedTag}>
          {valueLabel}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onSelect('', '')} />
        </span>
      ) : (
        <div style={{ position: 'relative' as const }}>
          <input
            style={{ ...styles.formInput, ...(error ? styles.inputError : {}) }}
            placeholder="Buscar contacto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div style={styles.dropdown}>
              {results.length === 0 ? (
                <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
              ) : (
                results.map(c => (
                  <div key={c.id} style={styles.dropdownItem} onClick={() => { onSelect(c.id, c.nombreCompleto); setSearch(''); }}>
                    {c.nombreCompleto}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NuevoPrecioEspecialModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [productoId, setProductoId] = useState('');
  const [productoLabel, setProductoLabel] = useState('');
  const [contactoId, setContactoId] = useState('');
  const [contactoLabel, setContactoLabel] = useState('');
  const [precio, setPrecio] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => preciosEspecialesService.createPrecioEspecial({
      productoId,
      contactoId,
      precio: Number(precio),
      notas: notas || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['precios-especiales'] });
      onCreated('Precio especial creado');
    },
  });

  const handleGuardar = () => {
    if (!productoId) { setError({ field: 'producto', message: 'Selecciona el producto.' }); return; }
    if (!contactoId) { setError({ field: 'contacto', message: 'Selecciona el contacto.' }); return; }
    if (!precio || Number(precio) <= 0) { setError({ field: 'precio', message: 'Ingresa un precio mayor a cero.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`precio-especial-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo precio especial</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <ProductoPicker
            id="precio-especial-field-producto"
            error={error?.field === 'producto'}
            valueId={productoId}
            valueLabel={productoLabel}
            onSelect={(id, label) => { setProductoId(id); setProductoLabel(label); setError(null); }}
          />
          {error?.field === 'producto' && <span style={styles.errorText}>{error.message}</span>}

          <ContactoPicker
            id="precio-especial-field-contacto"
            error={error?.field === 'contacto'}
            valueId={contactoId}
            valueLabel={contactoLabel}
            onSelect={(id, label) => { setContactoId(id); setContactoLabel(label); setError(null); }}
          />
          {error?.field === 'contacto' && <span style={styles.errorText}>{error.message}</span>}

          <div style={styles.formGroup} id="precio-especial-field-precio">
            <label style={styles.formLabel}>Precio *</label>
            <div style={styles.stepperWrap}>
              <span style={styles.pricePrefix}>$</span>
              <input
                type="text"
                inputMode="decimal"
                style={{ ...styles.formInput, ...(error?.field === 'precio' ? styles.inputError : {}), paddingLeft: '1.5rem', paddingRight: '5rem' }}
                placeholder="0,00"
                value={precio}
                onChange={e => { setPrecio(sanitizeDecimal(e.target.value)); setError(null); }}
              />
              <div style={styles.stepperBtns}>
                <button type="button" style={styles.stepperBtn} onClick={() => setPrecio(String(Math.max(0, (Number(precio) || 0) - 100)))}>−</button>
                <button type="button" style={styles.stepperBtn} onClick={() => setPrecio(String((Number(precio) || 0) + 100))}>+</button>
              </div>
            </div>
            {error?.field === 'precio' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Notas</label>
            <input style={styles.formInput} value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

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

export default function PreciosEspecialesPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PrecioEspecialItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = (selected || showCreateModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected, showCreateModal]);

  // Le da sombra a la tarjeta fija (título + toolbar) solo mientras está "pegada" arriba por el
  // scroll — mismo patrón que Remisiones / Cotizaciones / Listas de Precio.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const query = { page, limit: 300, search: search || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['precios-especiales', query],
    queryFn: () => preciosEspecialesService.findAll(query),
    placeholderData: keepPreviousData,
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
            <h1 style={styles.title}>Precios especiales</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por producto o contacto..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nuevo precio especial
            </button>

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
                <PrecioEspecialCard key={item.id} item={item} onSelect={setSelected} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'Producto', 'Contacto', 'Precio', 'Notas', 'Buscable'].map((h, i) => (
                    <th key={i} style={{ ...styles.th, textAlign: i === 3 ? 'right' as const : 'left' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <PrecioEspecialRow key={item.id} item={item} rowNumber={(page - 1) * 300 + index + 1} onSelect={setSelected} />
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
              <MaterialIcon name="chevron_left" size={16} /> Anterior
            </button>
            <span style={styles.pageLabel}>Página {page} de {data.totalPages}</span>
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

      {selected && (
        <DetalleModal
          item={selected}
          onClose={() => setSelected(null)}
          onUpdated={(msg, updated) => { setSelected(updated); setToastMessage(msg); }}
          onDeleted={msg => { setSelected(null); setToastMessage(msg); }}
        />
      )}
      {showCreateModal && (
        <NuevoPrecioEspecialModal
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); }}
        />
      )}
      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '280px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  totalLabel: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '16px', overflowX: 'auto' as const, overflowY: 'auto' as const, maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84375rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.7rem 0.875rem', fontWeight: 500, color: '#9ca3af', fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f0', verticalAlign: 'middle' as const, color: '#33342a' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  productoCode: { fontSize: '0.84375rem', fontWeight: 700, color: '#4d7a13' },
  productoNombre: { color: '#6b6b60' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  mobileCardId: { fontSize: '0.8rem', fontWeight: 700, color: '#4d7a13' },
  mobileCardDate: { fontSize: '0.75rem', color: '#9ca3af' },
  mobileCardMainRow: { display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' },
  mobileCardConductor: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardFieldsRow: { display: 'flex', gap: '1.25rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f0' },
  mobileCardField: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  mobileCardFieldLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  detalleRow: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f' },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  deleteBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  confirmBox: { display: 'flex', flexDirection: 'column' as const, gap: '1rem', padding: '1rem', backgroundColor: '#fdf0ec', border: '1px solid #f3cfc2', borderRadius: '10px' },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  selectedTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  dropdownItem: { padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  pricePrefix: { position: 'absolute' as const, left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: '#6b6b60', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' as const },
};
