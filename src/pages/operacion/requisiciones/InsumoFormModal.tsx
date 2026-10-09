import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { remisionesService, type LoteOption, type ProductoOption } from '../../../services/remisiones.service';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';

const formatProductoLabel = (p: ProductoOption): string =>
  p.referencia ? `${p.referencia} / ${p.nombre}` : p.nombre ?? '-';

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

const formatMoney = (value: number | null): string => {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  return Number.isNaN(num) ? '-' : `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PRECIO_POR_CUBRIMIENTO: Record<string, keyof ProductoOption> = {
  PARTICULARES: 'particulares',
  HOSPITALES: 'hospitales',
  DISTRIBUIDOR: 'distribuidor',
  ASEGURADORA: 'aseguradora',
};

export interface InsumoFormValues {
  lote: LoteOption | null;
  producto: ProductoOption;
  cantidad: number;
  precio: number;
}

interface InsumoFormModalProps {
  title: string;
  /** Si viene, se muestra el campo "Movimiento *" de solo lectura (caso Requisición ya existente). */
  movimientoId?: string;
  /** Filtra el buscador de producto por la tarifa vigente (misma tarifa usada para sugerir precio). */
  tarifaId?: string;
  /** Cubrimiento vigente, para el respaldo de precio por categoría cuando el producto no tiene precioSugerido. */
  cubrimientoNombre?: string | null;
  tarifaLabel: string;
  fecha: string | null;
  initialLote?: LoteOption | null;
  initialProducto?: ProductoOption | null;
  initialCantidad?: string;
  initialPrecio?: string;
  saveLabel?: string;
  savingLabel?: string;
  isSaving?: boolean;
  onSubmit: (data: InsumoFormValues) => void;
  onClose: () => void;
}

// Formulario "Nuevo insumo" / "Editar Insumo" compartido entre Programación (Agregar Requisición,
// donde se arma una lista en memoria antes de crear la requisición) y el detalle de una Requisición
// ya existente (donde cada insumo se guarda de inmediato vía mutación). El formulario solo valida y
// arma los valores; qué se hace con ellos (onSubmit) lo decide cada quien lo use.
export default function InsumoFormModal({
  title,
  movimientoId,
  tarifaId,
  cubrimientoNombre,
  tarifaLabel,
  fecha,
  initialLote = null,
  initialProducto = null,
  initialCantidad = '',
  initialPrecio = '',
  saveLabel = 'Guardar',
  savingLabel = 'Guardando...',
  isSaving = false,
  onSubmit,
  onClose,
}: InsumoFormModalProps) {
  const [insumoLote, setInsumoLote] = useState<LoteOption | null>(initialLote);
  const [loteSearch, setLoteSearch] = useState('');
  const [loteFocused, setLoteFocused] = useState(false);
  const [insumoProducto, setInsumoProducto] = useState<ProductoOption | null>(initialProducto);
  const [productoSearch, setProductoSearch] = useState('');
  const [productoFocused, setProductoFocused] = useState(false);
  const [productoHighlighted, setProductoHighlighted] = useState(0);
  const productoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [insumoCantidad, setInsumoCantidad] = useState(initialCantidad);
  const [insumoPrecio, setInsumoPrecio] = useState(initialPrecio);
  const [insumoError, setInsumoError] = useState<{ field: string; message: string } | null>(null);
  const cantidadInputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(true);

  const { data: loteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['lotes', loteSearch],
    queryFn: () => remisionesService.searchLotes(loteSearch),
    enabled: loteFocused,
  });

  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['productos', productoSearch, tarifaId],
    queryFn: () => remisionesService.searchProductos(productoSearch, tarifaId),
    enabled: productoFocused,
  });

  useEffect(() => { setProductoHighlighted(0); }, [productoResults.length, productoSearch]);
  useEffect(() => { productoOptionRefs.current[productoHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [productoHighlighted]);

  useEffect(() => {
    if (!insumoError) return;
    document.getElementById(`insumo-field-${insumoError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [insumoError]);

  const handleSelectProducto = (p: ProductoOption) => {
    setInsumoProducto(p);
    setProductoSearch('');
    setInsumoError(null);
    // Precio de la tarifa específica (ListaPrecio) si existe; si ese producto no tiene precio
    // cargado para esa tarifa puntual, se cae a la columna genérica por categoría de cubrimiento.
    const key = PRECIO_POR_CUBRIMIENTO[(cubrimientoNombre ?? '').trim().toUpperCase()];
    const precio = p.precioSugerido ?? (key ? p[key] : null);
    setInsumoPrecio(precio !== null && precio !== undefined ? String(precio) : '');
    setInsumoCantidad('1');
    // Cantidad solo se habilita una vez hay producto seleccionado — espera a que ese render
    // ocurra para poder enfocarlo (antes de eso el input ni existe en el DOM).
    setTimeout(() => { cantidadInputRef.current?.focus(); }, 0);
  };

  const handleGuardar = () => {
    if (!insumoProducto) { setInsumoError({ field: 'producto', message: 'Selecciona un producto válido de la lista.' }); return; }
    if (!insumoCantidad || Number(insumoCantidad) <= 0) { setInsumoError({ field: 'cantidad', message: 'La cantidad debe ser mayor a cero.' }); return; }
    setInsumoError(null);
    onSubmit({ lote: insumoLote, producto: insumoProducto, cantidad: Number(insumoCantidad), precio: Number(insumoPrecio) });
  };

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
          <h2 style={styles.modalTitle}>{title}</h2>
        </div>

        <div style={styles.modalBody}>
          {movimientoId && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Movimiento *</label>
              <span style={styles.readOnlyField}>{movimientoId}</span>
            </div>
          )}

          <div style={styles.formGroup} id="insumo-field-lote">
            <label style={styles.label}>Lote</label>
            {insumoLote ? (
              <div style={styles.tagsWrap}>
                <span style={styles.tag}>
                  {insumoLote.lote}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoLote(null)} />
                </span>
              </div>
            ) : (
              <div style={{ position: 'relative' as const }}>
                <input
                  style={{ ...styles.input, ...(insumoError?.field === 'lote' ? styles.inputError : {}) }}
                  placeholder="Buscar lote..."
                  value={loteSearch}
                  onChange={e => { setLoteSearch(e.target.value); setInsumoError(null); }}
                  onFocus={() => setLoteFocused(true)}
                  onBlur={() => setTimeout(() => setLoteFocused(false), 150)}
                />
                {loteFocused && (
                  <div style={styles.dropdown}>
                    {loteResults.length === 0 ? (
                      <div style={{ ...styles.dropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                    ) : (
                      loteResults.map(l => (
                        <div key={l.id} className="dropdown-item-hover" style={styles.dropdownItem} onMouseDown={e => e.preventDefault()} onClick={() => { setInsumoLote(l); setLoteSearch(''); }}>
                          <Plus size={14} /> {l.lote}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {insumoError?.field === 'lote' && <span style={styles.errorText}>{insumoError.message}</span>}
          </div>

          <div style={styles.formGroup} id="insumo-field-producto">
            <label style={styles.label}>Producto</label>
            {insumoProducto ? (
              <div style={styles.tagsWrap}>
                <span style={styles.tag}>
                  {formatProductoLabel(insumoProducto)}
                  <X size={12} style={{ cursor: 'pointer' }} onClick={() => setInsumoProducto(null)} />
                </span>
              </div>
            ) : (
              <div style={{ position: 'relative' as const }}>
                <input
                  style={{ ...styles.input, ...(insumoError?.field === 'producto' ? styles.inputError : {}) }}
                  placeholder="Buscar por clave, nombre o sistema..."
                  value={productoSearch}
                  onChange={e => { setProductoSearch(e.target.value); setInsumoError(null); }}
                  onFocus={() => setProductoFocused(true)}
                  onBlur={() => setTimeout(() => setProductoFocused(false), 150)}
                  onKeyDown={e => {
                    if (!productoFocused || productoResults.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setProductoHighlighted(i => Math.min(i + 1, productoResults.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setProductoHighlighted(i => Math.max(i - 1, 0));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      const p = productoResults[productoHighlighted];
                      if (p) handleSelectProducto(p);
                    }
                  }}
                />
                {productoFocused && (
                  <div style={styles.dropdown}>
                    {productoResults.length === 0 ? (
                      <div style={{ ...styles.dropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                    ) : (
                      productoResults.map((p, i) => (
                        <div
                          key={p.id}
                          ref={el => { productoOptionRefs.current[i] = el; }}
                          className="dropdown-item-hover"
                          style={{ ...styles.dropdownItem, justifyContent: 'space-between' as const, ...(i === productoHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                          onMouseDown={e => e.preventDefault()}
                          onMouseEnter={() => setProductoHighlighted(i)}
                          onClick={() => handleSelectProducto(p)}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            <Plus size={14} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                              {p.referencia && <span style={{ color: '#3f6510' }}>{p.referencia}</span>}
                              {p.referencia ? ' / ' : ''}{p.nombre}
                            </span>
                          </span>
                          {p.sistema && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{p.sistema}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {insumoError?.field === 'producto' && <span style={styles.errorText}>{insumoError.message}</span>}
          </div>

          {insumoProducto && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Sistema</label>
                <span style={styles.readOnlyField}>{insumoProducto.sistema || '-'}</span>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Referencia</label>
                <span style={styles.readOnlyField}>{insumoProducto.referencia || '-'}</span>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Descripción</label>
                <span style={styles.readOnlyField}>{insumoProducto.nombre || '-'}</span>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Categoría</label>
                <span style={styles.readOnlyField}>{insumoProducto.categoria || '-'}</span>
              </div>
            </>
          )}

          <div style={styles.formGroup} id="insumo-field-cantidad">
            <label style={styles.label}>Cantidad *</label>
            {!insumoProducto ? (
              <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero un producto</span>
            ) : (
              <div style={styles.stepperWrap}>
                <input
                  type="number"
                  ref={cantidadInputRef}
                  style={{ ...styles.input, paddingRight: '5rem', ...(insumoError?.field === 'cantidad' ? styles.inputError : {}) }}
                  placeholder="0"
                  value={insumoCantidad}
                  onChange={e => { setInsumoCantidad(e.target.value); setInsumoError(null); }}
                  onWheel={e => e.currentTarget.blur()}
                />
                <div style={styles.stepperBtns}>
                  <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) - 1)); setInsumoError(null); }}>−</button>
                  <button type="button" style={styles.stepperBtn} onClick={() => { setInsumoCantidad(String((Number(insumoCantidad) || 0) + 1)); setInsumoError(null); }}>+</button>
                </div>
              </div>
            )}
            {insumoError?.field === 'cantidad' && <span style={styles.errorText}>{insumoError.message}</span>}
          </div>

          <div style={styles.formGroup} id="insumo-field-precio">
            <label style={styles.label}>Precio *</label>
            <span style={styles.readOnlyField}>{insumoPrecio ? formatMoney(Number(insumoPrecio)) : '-'}</span>
            {insumoError?.field === 'precio' && <span style={styles.errorText}>{insumoError.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Tarifa Asociada</label>
            <span style={styles.readOnlyField}>{tarifaLabel || '-'}</span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Fecha</label>
            <span style={styles.readOnlyField}>{formatDate(fecha)}</span>
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          <button style={styles.saveBtn} onClick={handleGuardar} disabled={isSaving}>
            {isSaving ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10100 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1, borderTopLeftRadius: '12px', borderTopRightRadius: '12px' },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', justifyContent: 'flex-end' as const },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' },
  modalTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#333', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', border: 'none', backgroundColor: '#f3f4f6', borderRadius: '8px', cursor: 'pointer', color: '#666' },

  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  label: { fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  input: { padding: '0.75rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const },
  inputError: { border: '1.5px solid #dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  readOnlyField: { padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.875rem', color: '#6b7280' },

  tagsWrap: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#e9f2d8', border: '1px solid #dbe8c2', color: '#3f6510', fontSize: '0.8rem', fontWeight: 600 },

  dropdown: { position: 'absolute' as const, top: 'calc(100% + 0.35rem)', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.12)', maxHeight: '220px', overflowY: 'auto' as const, zIndex: 20 },
  dropdownItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.75rem', fontSize: '0.85rem', fontWeight: 600, color: '#333', cursor: 'pointer' },

  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },

  cancelBtn: { padding: '0.5rem 1.5rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.5rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem' },
};
