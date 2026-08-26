import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import {
  listasPrecioService,
  type ListaPrecioItem,
  type SubtarifaOption,
  type ProductoOption,
} from '../../../services/listasPrecio.service';

const FORMA_ACTUALIZACION_OPTIONS = ['N', 'Y'];

// El dato guardado es TRUE/FALSE (booleano exportado como texto); en la UI se muestra como Y/N.
const formaActualizacionToDisplay = (raw: string | null): string => {
  const v = (raw ?? '').trim().toUpperCase();
  if (v === 'TRUE' || v === 'Y') return 'Y';
  if (v === 'FALSE' || v === 'N') return 'N';
  return '';
};
const displayToFormaActualizacion = (display: string): string =>
  display === 'Y' ? 'TRUE' : display === 'N' ? 'FALSE' : '';

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

const formatPercent = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  return `${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const DEPENDE_DE_COLORS: Record<string, { bg: string; text: string }> = {
  'hospitales':   { bg: '#dbeafe', text: '#1e40af' },
  'particulares': { bg: '#dcfce7', text: '#166534' },
  'distribuidor': { bg: '#f3e8ff', text: '#6b21a8' },
  'aseguradora':  { bg: '#fef3c7', text: '#92400e' },
};

const getDependeDeColors = (nombre: string | null) => DEPENDE_DE_COLORS[(nombre ?? '').trim().toLowerCase()] ?? { bg: '#f4f4ee', text: '#6b6b60' };

function DependeDeBadge({ nombre }: { nombre: string | null }) {
  if (!nombre) return <span>-</span>;
  const c = getDependeDeColors(nombre);
  return <span style={{ ...styles.dependeBadge, backgroundColor: c.bg, color: c.text }}>{nombre}</span>;
}

function computeUtilidad(item: ListaPrecioItem) {
  const costo = item.costoUtilidad ?? 0;
  const precio = item.precio ?? 0;
  const monto = item.precio !== null && item.costoUtilidad !== null ? precio - costo : null;
  const pct = monto !== null && costo > 0 ? (monto / costo) * 100 : null;
  return { monto, pct };
}

const ListaPrecioRow = memo(({ item, rowNumber, onSelect }: { item: ListaPrecioItem; rowNumber: number; onSelect: (item: ListaPrecioItem) => void }) => {
  const { monto: utilidadMonto, pct: utilidadPct } = computeUtilidad(item);

  return (
    <tr
      style={styles.tr}
      onClick={() => onSelect(item)}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
    >
      <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{rowNumber}</td>
      <td style={styles.td}>
        <span style={styles.subtarifaCell}>{item.subtarifa ?? '-'}</span>
      </td>
      <td style={styles.td}>
        <span style={styles.productoCode}>{item.productoReferencia ?? '-'}</span>
        {item.productoNombre && <span style={styles.productoNombre}> / {item.productoNombre}</span>}
      </td>
      <td style={{ ...styles.td, textAlign: 'right' as const }}>{formatMoney(item.costoUtilidad)}</td>
      <td style={{ ...styles.td, textAlign: 'right' as const, color: '#9ca3af' }}>{formatPercent(item.porcentajeGanancia)}</td>
      <td style={{ ...styles.td, textAlign: 'right' as const, fontWeight: 700, color: utilidadPct !== null && utilidadPct >= 0 ? '#4d7a13' : '#a8503c' }}>
        {utilidadPct !== null ? formatPercent(utilidadPct) : '-'}
      </td>
      <td style={{ ...styles.td, textAlign: 'right' as const, fontWeight: 700, color: '#16170f' }}>{formatMoney(item.precio)}</td>
      <td style={styles.td}>
        <DependeDeBadge nombre={item.dependeDe} />
      </td>
      <td style={styles.td}>{formaActualizacionToDisplay(item.formaActualizacion) || '-'}</td>
      <td style={{ ...styles.td, textAlign: 'right' as const, fontWeight: 700, color: utilidadMonto !== null && utilidadMonto >= 0 ? '#4d7a13' : '#a8503c' }}>
        {utilidadMonto !== null ? formatMoney(utilidadMonto) : '-'}
      </td>
    </tr>
  );
});

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleRow}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

const productoLabelOf = (item: { productoReferencia: string | null; productoNombre: string | null }) =>
  [item.productoReferencia, item.productoNombre].filter(Boolean).join(' / ');

function SubtarifaPicker({ valueId, valueLabel, onSelect, id, error }: {
  valueId: string;
  valueLabel: string;
  onSelect: (opt: SubtarifaOption) => void;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<SubtarifaOption[]>({
    queryKey: ['listas-precio-subtarifas', search],
    queryFn: () => listasPrecioService.searchSubtarifas(search),
    enabled: !!search.trim(),
  });

  return (
    <div style={styles.formGroup} id={id}>
      <label style={styles.formLabel}>Subtarifa *</label>
      {valueId ? (
        <span style={styles.selectedTag}>
          {valueLabel}
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => onSelect({ id: '', nombre: '', dependeDe: null, formula: null })} />
        </span>
      ) : (
        <div style={{ position: 'relative' as const }}>
          <input
            style={{ ...styles.formInput, ...(error ? styles.inputError : {}) }}
            placeholder="Buscar subtarifa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search.trim() && (
            <div style={styles.dropdown}>
              {results.length === 0 ? (
                <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
              ) : (
                results.map(s => (
                  <div key={s.id} style={styles.dropdownItem} onClick={() => { onSelect(s); setSearch(''); }}>
                    {s.nombre}
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

function ProductoPicker({ valueId, valueLabel, onSelect, id, error }: {
  valueId: string;
  valueLabel: string;
  onSelect: (id: string, label: string) => void;
  id?: string;
  error?: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data: results = [] } = useQuery<ProductoOption[]>({
    queryKey: ['listas-precio-productos', search],
    queryFn: () => listasPrecioService.searchProductos(search),
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

function DetalleModal({ item, onClose, onUpdated, onDeleted }: {
  item: ListaPrecioItem;
  onClose: () => void;
  onUpdated: (message: string, updated: ListaPrecioItem) => void;
  onDeleted: (message: string) => void;
}) {
  const { monto: utilidadMonto, pct: utilidadPct } = computeUtilidad(item);
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

  const [subtarifaId, setSubtarifaId] = useState(item.subtarifaId ?? '');
  const [subtarifaLabel, setSubtarifaLabel] = useState(item.subtarifa ?? '');
  const [dependeDe, setDependeDe] = useState(item.dependeDe);
  const [formula, setFormula] = useState(item.formula);
  const [productoId, setProductoId] = useState(item.productoId ?? '');
  const [productoLabel, setProductoLabel] = useState(productoLabelOf(item));
  const [costoUtilidad, setCostoUtilidad] = useState(item.costoUtilidad !== null ? String(item.costoUtilidad) : '');
  const [porcentajeGanancia, setPorcentajeGanancia] = useState(item.porcentajeGanancia !== null ? String(item.porcentajeGanancia) : '');
  const [precio, setPrecio] = useState(item.precio !== null ? String(item.precio) : '');
  const [formaActualizacion, setFormaActualizacion] = useState(formaActualizacionToDisplay(item.formaActualizacion));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const startEditing = () => {
    setSubtarifaId(item.subtarifaId ?? '');
    setSubtarifaLabel(item.subtarifa ?? '');
    setDependeDe(item.dependeDe);
    setFormula(item.formula);
    setProductoId(item.productoId ?? '');
    setProductoLabel(productoLabelOf(item));
    setCostoUtilidad(item.costoUtilidad !== null ? String(item.costoUtilidad) : '');
    setPorcentajeGanancia(item.porcentajeGanancia !== null ? String(item.porcentajeGanancia) : '');
    setPrecio(item.precio !== null ? String(item.precio) : '');
    setFormaActualizacion(formaActualizacionToDisplay(item.formaActualizacion));
    setError(null);
    setEditing(true);
  };

  const utilidadPreview = (() => {
    const costo = Number(costoUtilidad) || 0;
    const pr = Number(precio) || 0;
    const monto = costoUtilidad !== '' && precio !== '' ? pr - costo : null;
    const pct = monto !== null && costo > 0 ? (monto / costo) * 100 : null;
    return { monto, pct };
  })();

  const updateMutation = useMutation({
    mutationFn: () => listasPrecioService.updateListaPrecio(item.id, {
      subtarifaId,
      productoId,
      costoUtilidad: Number(costoUtilidad),
      porcentajeGanancia: porcentajeGanancia ? Number(porcentajeGanancia) : undefined,
      precio: Number(precio),
      formaActualizacion: displayToFormaActualizacion(formaActualizacion) || undefined,
    }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['listas-precio'] });
      setEditing(false);
      onUpdated('Lista de precio actualizada', updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => listasPrecioService.deleteListaPrecio(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listas-precio'] });
      onDeleted('Lista de precio eliminada');
    },
  });

  const handleGuardar = () => {
    if (!subtarifaId) { setError({ field: 'subtarifa', message: 'Selecciona la subtarifa.' }); return; }
    if (!productoId) { setError({ field: 'producto', message: 'Selecciona el producto.' }); return; }
    if (!costoUtilidad || Number(costoUtilidad) < 0) { setError({ field: 'costoUtilidad', message: 'Ingresa el costo real.' }); return; }
    if (!precio || Number(precio) <= 0) { setError({ field: 'precio', message: 'Ingresa el precio de lista.' }); return; }
    setError(null);

    const sinCambios =
      subtarifaId === (item.subtarifaId ?? '') &&
      productoId === (item.productoId ?? '') &&
      Number(costoUtilidad) === Number(item.costoUtilidad ?? 0) &&
      Number(porcentajeGanancia || 0) === Number(item.porcentajeGanancia ?? 0) &&
      Number(precio) === Number(item.precio ?? 0) &&
      formaActualizacion === formaActualizacionToDisplay(item.formaActualizacion);

    if (sinCambios) {
      setEditing(false);
      return;
    }

    updateMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`lista-precio-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{editing ? 'Editar lista de Precio' : 'Lista de Precio'}</h2>
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
              <span style={{ fontWeight: 600, color: '#16170f' }}>
                ¿Eliminar el precio de lista de <strong>{productoLabelOf(item) || 'este producto'}</strong>? Esta acción no se puede deshacer.
              </span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : editing ? (
            <>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>IdListaPrecio</label>
                <input style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee' }} value={item.id} disabled />
              </div>

              <SubtarifaPicker
                id="lista-precio-field-subtarifa"
                error={error?.field === 'subtarifa'}
                valueId={subtarifaId}
                valueLabel={subtarifaLabel}
                onSelect={s => {
                  setSubtarifaId(s.id);
                  setSubtarifaLabel(s.nombre);
                  setDependeDe(s.dependeDe);
                  setFormula(s.formula);
                  setError(null);
                }}
              />
              {error?.field === 'subtarifa' && <span style={styles.errorText}>{error.message}</span>}

              <ProductoPicker
                id="lista-precio-field-producto"
                error={error?.field === 'producto'}
                valueId={productoId}
                valueLabel={productoLabel}
                onSelect={(id, label) => { setProductoId(id); setProductoLabel(label); setError(null); }}
              />
              {error?.field === 'producto' && <span style={styles.errorText}>{error.message}</span>}

              <div style={styles.formGroup} id="lista-precio-field-costoUtilidad">
                <label style={styles.formLabel}>Costo Real *</label>
                <div style={styles.stepperWrap}>
                  <span style={styles.pricePrefix}>$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={{ ...styles.formInput, ...(error?.field === 'costoUtilidad' ? styles.inputError : {}), paddingLeft: '1.5rem', paddingRight: '5rem' }}
                    placeholder="0,00"
                    value={costoUtilidad}
                    onChange={e => { setCostoUtilidad(sanitizeDecimal(e.target.value)); setError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => setCostoUtilidad(String(Math.max(0, (Number(costoUtilidad) || 0) - 100)))}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => setCostoUtilidad(String((Number(costoUtilidad) || 0) + 100))}>+</button>
                  </div>
                </div>
                {error?.field === 'costoUtilidad' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>% para Cálculo de Precio</label>
                <div style={styles.stepperWrap}>
                  <span style={styles.pricePrefix}>%</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    style={{ ...styles.formInput, paddingLeft: '1.5rem', paddingRight: '5rem' }}
                    placeholder="0,00"
                    value={porcentajeGanancia}
                    onChange={e => setPorcentajeGanancia(sanitizeDecimal(e.target.value))}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => setPorcentajeGanancia(String((Number(porcentajeGanancia) || 0) - 1))}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => setPorcentajeGanancia(String((Number(porcentajeGanancia) || 0) + 1))}>+</button>
                  </div>
                </div>
              </div>

              <div style={styles.formGroup} id="lista-precio-field-precio">
                <label style={styles.formLabel}>Precio de Lista *</label>
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
                <label style={styles.formLabel}>Forma de Actualización</label>
                <div style={styles.pickBtnGrid}>
                  {FORMA_ACTUALIZACION_OPTIONS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      style={{ ...styles.pickBtn, ...(formaActualizacion === opt ? styles.pickBtnActive : {}) }}
                      onClick={() => setFormaActualizacion(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Depende de</label>
                <div>
                  {dependeDe ? <DependeDeBadge nombre={dependeDe} /> : <span style={styles.readOnlyField}>Selecciona primero la subtarifa</span>}
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Tipo de Actualización</label>
                <span style={styles.readOnlyField}>{formula === null ? '-' : formula ? 'Automático' : 'Manual'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Utilidad $</label>
                <span style={styles.readOnlyField}>{utilidadPreview.monto !== null ? formatMoney(utilidadPreview.monto) : '-'}</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Utilidad %</label>
                <span style={styles.readOnlyField}>{utilidadPreview.pct !== null ? formatPercent(utilidadPreview.pct) : '-'}</span>
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
              <DetalleRow label="Subtarifa">{item.subtarifa ?? '-'}</DetalleRow>
              <DetalleRow label="Producto">
                <span style={styles.productoCode}>{item.productoReferencia ?? '-'}</span>
                {item.productoNombre && <> / {item.productoNombre}</>}
              </DetalleRow>
              <DetalleRow label="Costo Real">{formatMoney(item.costoUtilidad)}</DetalleRow>
              <DetalleRow label="% de Ganancia Estipulado por Tarifa">{formatPercent(item.porcentajeGanancia)}</DetalleRow>
              <DetalleRow label="Precio de Lista">
                <span style={{ fontWeight: 700 }}>{formatMoney(item.precio)}</span>
              </DetalleRow>
              <DetalleRow label="Utilidad $">
                <span style={{ color: utilidadMonto !== null && utilidadMonto >= 0 ? '#4d7a13' : '#a8503c', fontWeight: 700 }}>
                  {utilidadMonto !== null ? formatMoney(utilidadMonto) : '-'}
                </span>
              </DetalleRow>
              <DetalleRow label="Utilidad %">
                <span style={{ color: utilidadPct !== null && utilidadPct >= 0 ? '#4d7a13' : '#a8503c' }}>
                  {utilidadPct !== null ? formatPercent(utilidadPct) : '-'}
                </span>
              </DetalleRow>
              <DetalleRow label="Forma de Actualización">{formaActualizacionToDisplay(item.formaActualizacion) || '-'}</DetalleRow>
              <DetalleRow label="Depende de"><DependeDeBadge nombre={item.dependeDe} /></DetalleRow>
              <DetalleRow label="Tipo de Actualización">{item.formula ? 'Automático' : 'Manual'}</DetalleRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NuevaListaPrecioModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();

  const [subtarifaId, setSubtarifaId] = useState('');
  const [subtarifaLabel, setSubtarifaLabel] = useState('');
  const [dependeDe, setDependeDe] = useState<string | null>(null);
  const [formula, setFormula] = useState<boolean | null>(null);
  const [productoId, setProductoId] = useState('');
  const [productoLabel, setProductoLabel] = useState('');
  const [costoUtilidad, setCostoUtilidad] = useState('');
  const [porcentajeGanancia, setPorcentajeGanancia] = useState('');
  const [precio, setPrecio] = useState('');
  const [formaActualizacion, setFormaActualizacion] = useState('');
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const utilidadPreview = (() => {
    const costo = Number(costoUtilidad) || 0;
    const pr = Number(precio) || 0;
    const monto = costoUtilidad !== '' && precio !== '' ? pr - costo : null;
    const pct = monto !== null && costo > 0 ? (monto / costo) * 100 : null;
    return { monto, pct };
  })();

  const createMutation = useMutation({
    mutationFn: () => listasPrecioService.createListaPrecio({
      subtarifaId,
      productoId,
      costoUtilidad: Number(costoUtilidad),
      porcentajeGanancia: porcentajeGanancia ? Number(porcentajeGanancia) : undefined,
      precio: Number(precio),
      formaActualizacion: displayToFormaActualizacion(formaActualizacion) || undefined,
    }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['listas-precio'] });
      onCreated(`Lista de precio ${created.productoReferencia || created.id} creada`);
    },
  });

  const handleGuardar = () => {
    if (!subtarifaId) { setError({ field: 'subtarifa', message: 'Selecciona la subtarifa.' }); return; }
    if (!productoId) { setError({ field: 'producto', message: 'Selecciona el producto.' }); return; }
    if (!costoUtilidad || Number(costoUtilidad) < 0) { setError({ field: 'costoUtilidad', message: 'Ingresa el costo real.' }); return; }
    if (!precio || Number(precio) <= 0) { setError({ field: 'precio', message: 'Ingresa el precio de lista.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`lista-precio-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nueva lista de precio</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>IdListaPrecio</label>
            <input style={{ ...styles.formInput, color: '#9ca3af', backgroundColor: '#f4f4ee' }} placeholder="Se genera automáticamente" disabled />
          </div>

          <SubtarifaPicker
            id="lista-precio-field-subtarifa"
            error={error?.field === 'subtarifa'}
            valueId={subtarifaId}
            valueLabel={subtarifaLabel}
            onSelect={s => {
              setSubtarifaId(s.id);
              setSubtarifaLabel(s.nombre);
              setDependeDe(s.dependeDe);
              setFormula(s.formula);
              setError(null);
            }}
          />
          {error?.field === 'subtarifa' && <span style={styles.errorText}>{error.message}</span>}

          <ProductoPicker
            id="lista-precio-field-producto"
            error={error?.field === 'producto'}
            valueId={productoId}
            valueLabel={productoLabel}
            onSelect={(id, label) => { setProductoId(id); setProductoLabel(label); setError(null); }}
          />
          {error?.field === 'producto' && <span style={styles.errorText}>{error.message}</span>}

          <div style={styles.formGroup} id="lista-precio-field-costoUtilidad">
            <label style={styles.formLabel}>Costo Real *</label>
            <div style={styles.stepperWrap}>
              <span style={styles.pricePrefix}>$</span>
              <input
                type="text"
                inputMode="decimal"
                style={{ ...styles.formInput, ...(error?.field === 'costoUtilidad' ? styles.inputError : {}), paddingLeft: '1.5rem', paddingRight: '5rem' }}
                placeholder="0,00"
                value={costoUtilidad}
                onChange={e => { setCostoUtilidad(sanitizeDecimal(e.target.value)); setError(null); }}
              />
              <div style={styles.stepperBtns}>
                <button type="button" style={styles.stepperBtn} onClick={() => setCostoUtilidad(String(Math.max(0, (Number(costoUtilidad) || 0) - 100)))}>−</button>
                <button type="button" style={styles.stepperBtn} onClick={() => setCostoUtilidad(String((Number(costoUtilidad) || 0) + 100))}>+</button>
              </div>
            </div>
            {error?.field === 'costoUtilidad' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>% para Cálculo de Precio</label>
            <div style={styles.stepperWrap}>
              <span style={styles.pricePrefix}>%</span>
              <input
                type="text"
                inputMode="decimal"
                style={{ ...styles.formInput, paddingLeft: '1.5rem', paddingRight: '5rem' }}
                placeholder="0,00"
                value={porcentajeGanancia}
                onChange={e => setPorcentajeGanancia(sanitizeDecimal(e.target.value))}
              />
              <div style={styles.stepperBtns}>
                <button type="button" style={styles.stepperBtn} onClick={() => setPorcentajeGanancia(String((Number(porcentajeGanancia) || 0) - 1))}>−</button>
                <button type="button" style={styles.stepperBtn} onClick={() => setPorcentajeGanancia(String((Number(porcentajeGanancia) || 0) + 1))}>+</button>
              </div>
            </div>
          </div>

          <div style={styles.formGroup} id="lista-precio-field-precio">
            <label style={styles.formLabel}>Precio de Lista *</label>
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
            <label style={styles.formLabel}>Forma de Actualización</label>
            <div style={styles.pickBtnGrid}>
              {FORMA_ACTUALIZACION_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  style={{ ...styles.pickBtn, ...(formaActualizacion === opt ? styles.pickBtnActive : {}) }}
                  onClick={() => setFormaActualizacion(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Depende de</label>
            <div>
              {dependeDe ? <DependeDeBadge nombre={dependeDe} /> : <span style={styles.readOnlyField}>Selecciona primero la subtarifa</span>}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Tipo de Actualización</label>
            <span style={styles.readOnlyField}>{formula === null ? '-' : formula ? 'Automático' : 'Manual'}</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Utilidad $</label>
            <span style={styles.readOnlyField}>{utilidadPreview.monto !== null ? formatMoney(utilidadPreview.monto) : '-'}</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Utilidad %</label>
            <span style={styles.readOnlyField}>{utilidadPreview.pct !== null ? formatPercent(utilidadPreview.pct) : '-'}</span>
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

export default function ListasPrecioPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ListaPrecioItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = (selected || showCreateModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected, showCreateModal]);

  // Le da sombra a la tarjeta fija (título + toolbar) solo mientras está "pegada" arriba por el
  // scroll — mismo patrón que Remisiones / Cotizaciones.
  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const query = { page, limit: 300, search: search || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['listas-precio', query],
    queryFn: () => listasPrecioService.findAll(query),
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
            <h1 style={styles.title}>Listas de precio</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por producto o subtarifa..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nueva lista de precio
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${data?.total ?? 0} registros`}</span>
          </div>
        </div>

        <div ref={tableWrapRef} style={styles.tableWrap}>
          {isLoading && items.length === 0 ? (
            <div style={styles.empty}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'Subtarifa', 'Producto', 'Costo Real', '% Ganancia Estipulada', 'Utilidad %', 'Precio de Lista', 'Depende de', 'Forma de Actualización', 'Utilidad $'].map((h, i) => (
                    <th key={i} style={{ ...styles.th, textAlign: i >= 3 && i <= 6 ? 'right' as const : 'left' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <ListaPrecioRow key={item.id} item={item} rowNumber={(page - 1) * 300 + index + 1} onSelect={setSelected} />
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
        <NuevaListaPrecioModal
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
  subtarifaCell: { fontWeight: 600, color: '#16170f' },
  productoCode: { fontSize: '0.84375rem', fontWeight: 700, color: '#4d7a13' },
  productoNombre: { color: '#6b6b60' },
  dependeBadge: { display: 'inline-flex', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' as const },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
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
  selectedTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  dropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  dropdownItem: { padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  pricePrefix: { position: 'absolute' as const, left: '0.7rem', top: '50%', transform: 'translateY(-50%)', color: '#6b6b60', fontSize: '0.85rem', fontWeight: 600, pointerEvents: 'none' as const },
  pickBtnGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pickBtn: { padding: '0.5rem 0.9rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', outline: 'none' },
  pickBtnActive: { backgroundColor: '#6b8c1f', borderColor: '#6b8c1f', color: '#fff' },
  readOnlyField: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.85rem', color: '#6b7280', width: 'fit-content' as const },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
};
