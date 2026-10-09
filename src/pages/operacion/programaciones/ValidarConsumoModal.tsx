import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { remisionesService, type ConsumoDetalle, type ProductoOption, type AlmacenOption, type LoteOption } from '../../../services/remisiones.service';
import { styles, formatMoney, formatDate } from './ProgramacionDetailPage';

const formatProductoLabel = (p: ProductoOption): string =>
  p.referencia ? `${p.referencia} / ${p.nombre}` : p.nombre ?? '-';

interface ValidarConsumoModalProps {
  consumoId: string;
  programacionId: string;
  onClose: () => void;
  onValidated: () => void;
}

interface LoteStaged {
  tempId: string;
  sedeId: string;
  sedeNombre: string;
  almacenId: string;
  almacenNombre: string;
  loteId: string;
  loteLabel: string;
  cantidad: number;
}

const loteStyles = {
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

// Replica el formulario "Validar Consumo" de AppSheet: tab "Datos Origen" (solo lectura, viene del
// Det_Consumo) y tab "Validación" (crea un ValConsumo nuevo, más los lotes consumidos que se agregan
// con "Nuevo" — se juntan en el navegador y se mandan al backend junto con el ValConsumo al Guardar,
// porque createValConsumoLote necesita el id del ValConsumo, que todavía no existe mientras se llena
// el formulario).
const getUsuarioActualSedeId = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem('usuario') ?? '{}')?.sedeId ?? null;
  } catch {
    return null;
  }
};

export default function ValidarConsumoModal({ consumoId, programacionId, onClose, onValidated }: ValidarConsumoModalProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'origen' | 'validacion'>('origen');
  const modalContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    modalContentRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const { data: detalle } = useQuery<ConsumoDetalle | null>({
    queryKey: ['consumo-detalle', consumoId],
    queryFn: () => remisionesService.getConsumoDetalle(consumoId),
  });

  const { data: sedes = [] } = useQuery<SedeOption[]>({
    queryKey: ['programaciones-sedes'],
    queryFn: () => programacionesService.getSedes(),
  });
  // Sede Global y Sede Vallarta no son opciones válidas para dónde se consumió el producto.
  const sedesConsumo = sedes.filter(s => s.nombre !== 'Sede Global' && s.nombre !== 'Sede Vallarta');

  const [sedeConsumoId, setSedeConsumoId] = useState<string | null>(getUsuarioActualSedeId);
  const [prodRealConsumido, setProdRealConsumido] = useState<boolean | null>(null);
  const [prodDeTspine, setProdDeTspine] = useState<boolean | null>(null);
  const [observacionesAlm, setObservacionesAlm] = useState('');
  const observacionesInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!error) return;
    document.getElementById(`validar-consumo-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const [productoId, setProductoId] = useState<string | null>(null);
  const [productoLabel, setProductoLabel] = useState<string | null>(null);
  const [productoSearch, setProductoSearch] = useState('');
  const [productoFocused, setProductoFocused] = useState(false);
  const [productoHighlighted, setProductoHighlighted] = useState(0);
  const productoInputRef = useRef<HTMLInputElement>(null);
  // Mismo buscador que "Agregar consumo" (todos los productos cotizables, sin filtrar por si
  // tienen precio o no) — la diferencia es que acá nunca se permite capturar el precio a mano: si
  // el producto elegido tiene precio cargado para la tarifa de la remisión (precioSugerido, aunque
  // sea $0), ese es el que se le asigna al consumo remisionado; si no tiene, se agrega igual pero
  // el precio remisionado no se toca.
  const { data: productoResults = [] } = useQuery<ProductoOption[]>({
    queryKey: ['validar-consumo-productos', productoSearch, detalle?.tarifaId],
    queryFn: () => remisionesService.searchProductos(productoSearch, detalle?.tarifaId ?? undefined, true),
    enabled: prodRealConsumido === false && productoFocused,
  });

  useEffect(() => {
    if (prodRealConsumido === false && !productoId) productoInputRef.current?.focus();
  }, [prodRealConsumido, productoId]);

  useEffect(() => {
    setProductoHighlighted(0);
  }, [productoResults]);

  // Solo informativo — para que se vea el precio del producto elegido. No se envía al backend ni
  // actualiza el consumo remisionado (ver createValConsumo: ese nunca cambia al validar).
  const [precioProductoElegido, setPrecioProductoElegido] = useState<number | null>(null);

  const selectProducto = (p: ProductoOption) => {
    setProductoId(p.id);
    setProductoLabel(formatProductoLabel(p));
    setProductoSearch('');
    setPrecioProductoElegido(p.precioSugerido);
    setError(null);
  };

  const [lotes, setLotes] = useState<LoteStaged[]>([]);
  const [showNuevoLote, setShowNuevoLote] = useState(false);
  const [loteSedeId, setLoteSedeId] = useState<string | null>(null);
  const [loteAlmacenId, setLoteAlmacenId] = useState<string | null>(null);
  const [loteLoteId, setLoteLoteId] = useState<string | null>(null);
  const [loteLoteLabel, setLoteLoteLabel] = useState<string | null>(null);
  const [loteLoteSearch, setLoteLoteSearch] = useState('');
  const [loteLoteFocused, setLoteLoteFocused] = useState(false);
  const loteInputRef = useRef<HTMLInputElement>(null);
  const [loteCantidad, setLoteCantidad] = useState('1');
  const cantidadInputRef = useRef<HTMLInputElement>(null);
  const [loteError, setLoteError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!loteError) return;
    document.getElementById(`nuevo-lote-field-${loteError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loteError]);

  const { data: loteAlmacenes = [] } = useQuery<AlmacenOption[]>({
    queryKey: ['remisiones-almacenes', loteSedeId],
    queryFn: () => remisionesService.findAlmacenes(loteSedeId ?? undefined),
    enabled: showNuevoLote && !!loteSedeId,
  });

  const [loteHighlighted, setLoteHighlighted] = useState(0);
  const { data: loteResults = [] } = useQuery<LoteOption[]>({
    queryKey: ['remisiones-lotes', loteLoteSearch, detalle?.productoId, loteSedeId],
    queryFn: () => remisionesService.searchLotes(loteLoteSearch, detalle?.productoId ?? undefined, loteSedeId ?? undefined),
    enabled: showNuevoLote && loteLoteFocused,
  });

  useEffect(() => {
    setLoteHighlighted(0);
  }, [loteResults]);

  const selectLote = (l: LoteOption) => {
    setLoteLoteId(l.id);
    setLoteLoteLabel(l.lote ?? '-');
    setLoteLoteSearch('');
    setLoteError(null);
    cantidadInputRef.current?.focus();
  };

  const canVal = lotes.reduce((sum, l) => sum + l.cantidad, 0);

  const resetNuevoLote = () => {
    setShowNuevoLote(false);
    setLoteSedeId(null);
    setLoteAlmacenId(null);
    setLoteLoteId(null);
    setLoteLoteLabel(null);
    setLoteLoteSearch('');
    setLoteCantidad('1');
    setLoteError(null);
  };

  const handleAgregarLote = () => {
    const cantidad = Number(loteCantidad);
    if (!loteSedeId) { setLoteError({ field: 'sede', message: 'Selecciona la sede.' }); return; }
    if (!loteAlmacenId) { setLoteError({ field: 'ubicacion', message: 'Selecciona la ubicación.' }); return; }
    if (!loteLoteId) { setLoteError({ field: 'lote', message: 'Selecciona el lote.' }); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { setLoteError({ field: 'cantidad', message: 'Ingresa una cantidad válida.' }); return; }
    const sede = sedes.find(s => s.id === loteSedeId);
    const almacen = loteAlmacenes.find(a => a.id === loteAlmacenId);
    setLotes(prev => [...prev, {
      tempId: crypto.randomUUID(),
      sedeId: loteSedeId,
      sedeNombre: sede?.nombre ?? '-',
      almacenId: loteAlmacenId,
      almacenNombre: almacen?.nombre ?? '-',
      loteId: loteLoteId,
      loteLabel: loteLoteLabel ?? '-',
      cantidad,
    }]);
    resetNuevoLote();
  };

  const removeLote = (tempId: string) => setLotes(prev => prev.filter(l => l.tempId !== tempId));

  const validarMutation = useMutation({
    mutationFn: async () => {
      const created = await remisionesService.createValConsumo(consumoId, {
        sedeConsumoId: sedeConsumoId!,
        prodRealConsumido: prodRealConsumido!,
        productoId: prodRealConsumido === false ? productoId! : undefined,
        prodDeTspine: prodDeTspine!,
        observacionesAlm: observacionesAlm.trim(),
      });
      for (const lote of lotes) {
        await remisionesService.createValConsumoLote({
          valConsumoId: created.id,
          sedeId: lote.sedeId,
          almacenId: lote.almacenId,
          loteId: lote.loteId,
          cantidad: lote.cantidad,
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remisiones-consumos', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['remisiones-validacion-consumos', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['programacion', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['consumo-detalle', consumoId] });
      if (detalle?.remisionId) queryClient.invalidateQueries({ queryKey: ['remision', detalle.remisionId] });
      onValidated();
    },
  });

  const handleGuardar = () => {
    setTab('validacion');
    if (!sedeConsumoId) { setError({ field: 'sedeConsumo', message: 'Selecciona la sede de consumo.' }); return; }
    if (prodRealConsumido === null) { setError({ field: 'prodRealConsumido', message: 'Indica si el producto real consumido es el mismo o diferente.' }); return; }
    if (prodRealConsumido === false && !productoId) { setError({ field: 'proVal', message: 'Selecciona el producto realmente consumido.' }); return; }
    if (prodDeTspine === null) { setError({ field: 'prodDeTspine', message: 'Indica si el producto es de TSpine.' }); return; }
    if (!observacionesAlm.trim()) { setError({ field: 'observacionesAlm', message: 'Ingresa las observaciones de almacén.' }); return; }
    setError(null);
    validarMutation.mutate();
  };

  const tagField = (label: string, value: string | null | undefined) => (
    <div style={styles.formGroup}>
      <label style={styles.remisionLabel}>{label}</label>
      <div style={styles.medicoTagsWrap}>
        <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>{value ?? '-'}</span>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay}>
      <div ref={modalContentRef} className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.editModalHeader}>
          <button style={styles.closeBtn} onClick={onClose}><X size={18} /></button>
          <h2 style={styles.modalTitle}>Validar consumo</h2>
        </div>

        <div style={styles.editModalBody}>
          {tab === 'origen' ? (
            <>
              {tagField('N° Programación', detalle?.numProgram)}
              {tagField('N° Remisión', detalle?.numRemision)}
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Fecha QX</label>
                <span style={{ ...styles.readOnlyField, ...styles.pickBtnActive, textAlign: 'center' as const }}>{detalle ? formatDate(detalle.fechaQx) : '-'}</span>
              </div>
              {tagField('Doctor', detalle?.doctor)}
              {tagField('Hospital', detalle?.hospital)}
              {tagField('Pro Rem', detalle?.descripcion)}
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Referencia</label><span style={styles.readOnlyField}>{detalle?.referencia ?? '-'}</span></div>
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Valor Unitario</label><span style={styles.readOnlyField}>{detalle ? formatMoney(detalle.valorUnitario) : '-'}</span></div>
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Valor</label><span style={styles.readOnlyField}>{detalle ? formatMoney(detalle.valor) : '-'}</span></div>
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Observaciones</label><span style={styles.readOnlyField}>{detalle?.observaciones ?? '-'}</span></div>
            </>
          ) : (
            <>
              <div style={styles.formGroup} id="validar-consumo-field-sedeConsumo">
                <label style={styles.remisionLabel}>Sede Consumo *</label>
                <div style={styles.pickBtnGrid}>
                  {sedesConsumo.map(s => (
                    <button key={s.id} type="button" style={{ ...styles.pickBtn, ...(sedeConsumoId === s.id ? styles.pickBtnActive : {}), ...(error?.field === 'sedeConsumo' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setSedeConsumoId(s.id); setError(null); }}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {error?.field === 'sedeConsumo' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              <div style={styles.formGroup} id="validar-consumo-field-prodRealConsumido">
                <label style={styles.remisionLabel}>Producto real consumido? *</label>
                <div style={styles.pickBtnGrid}>
                  <button type="button" style={{ ...styles.pickBtn, ...(prodRealConsumido === false ? styles.pickBtnActive : {}), ...(error?.field === 'prodRealConsumido' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setProdRealConsumido(false); setError(null); }}>Diferente</button>
                  <button type="button" style={{ ...styles.pickBtn, ...(prodRealConsumido === true ? styles.pickBtnActive : {}), ...(error?.field === 'prodRealConsumido' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setProdRealConsumido(true); setProductoId(null); setProductoLabel(null); setPrecioProductoElegido(null); setError(null); }}>Mismo Producto</button>
                </div>
                {error?.field === 'prodRealConsumido' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              {prodRealConsumido === true && (
                <div style={styles.formGroup} id="validar-consumo-field-proVal">
                  <label style={styles.remisionLabel}>Producto validado *</label>
                  <div style={styles.medicoTagsWrap}>
                    <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>{detalle?.descripcion ?? '-'}</span>
                  </div>
                </div>
              )}

              {prodRealConsumido === false && (
                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Producto remisionado</label>
                  <div style={styles.medicoTagsWrap}>
                    <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>{detalle?.descripcion ?? '-'}</span>
                  </div>
                </div>
              )}

              {prodRealConsumido === false && (
                <div style={styles.formGroup} id="validar-consumo-field-proVal">
                  <label style={styles.remisionLabel}>Producto validado *</label>
                  {productoId ? (
                    <div style={styles.medicoTagsWrap}>
                      <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>
                        {productoLabel}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setProductoId(null); setProductoLabel(null); setPrecioProductoElegido(null); }} />
                      </span>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' as const }}>
                      <input
                        ref={productoInputRef}
                        style={styles.input}
                        placeholder="Buscar producto..."
                        value={productoSearch}
                        onChange={e => setProductoSearch(e.target.value)}
                        onFocus={() => setProductoFocused(true)}
                        onBlur={() => setTimeout(() => setProductoFocused(false), 150)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setProductoHighlighted(i => Math.min(i + 1, productoResults.length - 1));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setProductoHighlighted(i => Math.max(i - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const p = productoResults[productoHighlighted];
                            if (p) selectProducto(p);
                          }
                        }}
                      />
                      {productoFocused && (
                        <div style={{ ...styles.medicoDropdown, left: 0, right: 0 }}>
                          {productoResults.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                          ) : (
                            productoResults.map((p, i) => (
                              <div
                                key={p.id}
                                style={{ ...styles.medicoDropdownItem, ...(i === productoHighlighted ? styles.pickBtnActive : {}) }}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => setProductoHighlighted(i)}
                                onClick={() => selectProducto(p)}
                              >
                                {formatProductoLabel(p)}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {error?.field === 'proVal' && <span style={styles.errorText}>{error.message}</span>}
                </div>
              )}

              {prodRealConsumido === false && productoId && (
                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Precio de este producto</label>
                  {precioProductoElegido !== null ? (
                    <>
                      <div style={styles.medicoTagsWrap}>
                        <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>{formatMoney(precioProductoElegido)}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Precio de referencia según la tarifa de esta remisión.</span>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Este producto no tiene un precio cargado para la tarifa de esta remisión.</span>
                  )}
                </div>
              )}

              <div style={styles.formGroup}><label style={styles.remisionLabel}>Cantidad Remisionada</label><span style={styles.readOnlyField}>{detalle ? detalle.cantidad : '-'}</span></div>
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Cantidad usada</label><span style={styles.readOnlyField}>{detalle ? detalle.productoValidado.reduce((sum, pv) => sum + pv.cantRealValidada, 0).toFixed(2) : '-'}</span></div>
              <div style={styles.formGroup}><label style={styles.remisionLabel}>Cantidad validada</label><span style={styles.readOnlyField}>{canVal}</span></div>

              <div style={styles.formGroup} id="validar-consumo-field-prodDeTspine">
                <label style={styles.remisionLabel}>Producto de Tspine? *</label>
                <div style={styles.pickBtnGrid}>
                  <button type="button" style={{ ...styles.pickBtn, ...(prodDeTspine === false ? styles.pickBtnActive : {}), ...(error?.field === 'prodDeTspine' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setProdDeTspine(false); setError(null); observacionesInputRef.current?.focus(); }}>No</button>
                  <button type="button" style={{ ...styles.pickBtn, ...(prodDeTspine === true ? styles.pickBtnActive : {}), ...(error?.field === 'prodDeTspine' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setProdDeTspine(true); setError(null); observacionesInputRef.current?.focus(); }}>Sí</button>
                </div>
                {error?.field === 'prodDeTspine' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              <div style={styles.formGroup} id="validar-consumo-field-observacionesAlm">
                <label style={styles.remisionLabel}>Observaciones de almacen *</label>
                <input ref={observacionesInputRef} style={{ ...styles.input, ...(error?.field === 'observacionesAlm' ? styles.inputError : {}) }} value={observacionesAlm} onChange={e => { setObservacionesAlm(e.target.value); setError(null); }} />
                {error?.field === 'observacionesAlm' && <span style={styles.errorText}>{error.message}</span>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Ingresa los lotes consumidos en esta validación</label>
                {lotes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
                    {lotes.map(l => (
                      <div key={l.tempId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.6rem 0.85rem', borderRadius: '10px', backgroundColor: '#f3faec', border: '1px solid #d9e8c2' }}>
                        <span style={{ color: '#3f6510', fontSize: '0.85rem', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const }}>
                          <span style={{ fontWeight: 700 }}>{l.loteLabel}</span> · {l.sedeNombre} · {l.almacenNombre} · Cant. {l.cantidad}
                        </span>
                        <X size={14} style={{ cursor: 'pointer', color: '#6b8c1f', flexShrink: 0 }} onClick={() => removeLote(l.tempId)} />
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" className="btn-press" style={{ ...styles.pickBtn, ...styles.pickBtnActive, width: '100%', justifyContent: 'center', padding: '0.65rem 1.5rem' }} onClick={() => { setLoteSedeId(sedeConsumoId); setShowNuevoLote(true); }}>Nuevo</button>
              </div>
            </>
          )}
        </div>

        <div style={styles.editModalFooter}>
          {tab === 'origen' ? (
            <>
              <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
              <button style={styles.saveBtn} onClick={() => setTab('validacion')}>Continuar</button>
            </>
          ) : (
            <>
              <button style={styles.cancelBtn} onClick={() => setTab('origen')}>Atrás</button>
              <button style={styles.saveBtn} onClick={handleGuardar} disabled={validarMutation.isPending}>
                {validarMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>

      {showNuevoLote && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={{ ...styles.editModalContent, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={resetNuevoLote}><X size={18} /></button>
              <h2 style={styles.modalTitle}>Nuevo lote</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Producto</label>
                <div style={styles.medicoTagsWrap}>
                  <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>{detalle?.descripcion ?? '-'}</span>
                </div>
              </div>

              <div style={styles.formGroup} id="nuevo-lote-field-sede">
                <label style={styles.remisionLabel}>Sede *</label>
                <div style={styles.pickBtnGrid}>
                  {sedesConsumo.map(s => (
                    <button key={s.id} type="button" style={{ ...styles.pickBtn, ...(loteSedeId === s.id ? styles.pickBtnActive : {}), ...(loteError?.field === 'sede' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setLoteSedeId(s.id); setLoteAlmacenId(null); setLoteError(null); }}>
                      {s.nombre}
                    </button>
                  ))}
                </div>
                {loteError?.field === 'sede' && <span style={styles.errorText}>{loteError.message}</span>}
              </div>

              {loteSedeId && (
                <div style={styles.formGroup} id="nuevo-lote-field-ubicacion">
                  <label style={styles.remisionLabel}>Ubicación *</label>
                  <div style={styles.pickBtnGrid}>
                    {loteAlmacenes.length === 0 ? (
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Sin ubicaciones para esta sede.</span>
                    ) : (
                      loteAlmacenes.map(a => (
                        <button key={a.id} type="button" style={{ ...styles.pickBtn, ...(loteAlmacenId === a.id ? styles.pickBtnActive : {}), ...(loteError?.field === 'ubicacion' ? styles.inputError : {}) }} onMouseDown={e => e.preventDefault()} onClick={() => { setLoteAlmacenId(a.id); setLoteError(null); loteInputRef.current?.focus(); }}>
                          {a.nombre ?? '-'}
                        </button>
                      ))
                    )}
                  </div>
                  {loteError?.field === 'ubicacion' && <span style={styles.errorText}>{loteError.message}</span>}
                </div>
              )}

              <div style={styles.formGroup} id="nuevo-lote-field-lote">
                <label style={styles.remisionLabel}>Lote *</label>
                {loteLoteId ? (
                  <div style={styles.medicoTagsWrap}>
                    <span style={{ ...styles.medicoTag, ...styles.pickBtnActive }}>
                      {loteLoteLabel}
                      <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setLoteLoteId(null); setLoteLoteLabel(null); }} />
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      ref={loteInputRef}
                      style={{ ...styles.input, ...(loteError?.field === 'lote' ? styles.inputError : {}) }}
                      placeholder="Buscar"
                      value={loteLoteSearch}
                      onChange={e => setLoteLoteSearch(e.target.value)}
                      onFocus={() => setLoteLoteFocused(true)}
                      onBlur={() => setTimeout(() => setLoteLoteFocused(false), 150)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setLoteHighlighted(i => Math.min(i + 1, loteResults.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setLoteHighlighted(i => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const l = loteResults[loteHighlighted];
                          if (l) selectLote(l);
                        }
                      }}
                    />
                    {loteLoteFocused && (
                      <div style={{ ...styles.medicoDropdown, left: 0, right: 0 }}>
                        {loteResults.length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          loteResults.map((l, i) => (
                            <div
                              key={l.id}
                              style={{ ...styles.medicoDropdownItem, ...(i === loteHighlighted ? styles.pickBtnActive : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setLoteHighlighted(i)}
                              onClick={() => selectLote(l)}
                            >
                              {l.lote ?? '-'}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {loteError?.field === 'lote' && <span style={styles.errorText}>{loteError.message}</span>}
              </div>

              <div style={styles.formGroup} id="nuevo-lote-field-cantidad">
                <label style={styles.remisionLabel}>Cantidad *</label>
                <div style={loteStyles.stepperWrap}>
                  <input
                    ref={cantidadInputRef}
                    style={{ ...styles.input, paddingRight: '5rem', ...(loteError?.field === 'cantidad' ? styles.inputError : {}) }}
                    type="number"
                    min={1}
                    value={loteCantidad}
                    onChange={e => { setLoteCantidad(e.target.value); setLoteError(null); }}
                  />
                  <div style={loteStyles.stepperBtns}>
                    <button type="button" style={loteStyles.stepperBtn} onClick={() => { setLoteCantidad(String(Math.max(1, (Number(loteCantidad) || 0) - 1))); setLoteError(null); }}>−</button>
                    <button type="button" style={loteStyles.stepperBtn} onClick={() => { setLoteCantidad(String((Number(loteCantidad) || 0) + 1)); setLoteError(null); }}>+</button>
                  </div>
                </div>
                {loteError?.field === 'cantidad' && <span style={styles.errorText}>{loteError.message}</span>}
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={resetNuevoLote}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleAgregarLote}>Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
