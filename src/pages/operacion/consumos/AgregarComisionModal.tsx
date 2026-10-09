import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, ChevronDown, Plus, Lock } from 'lucide-react';
import SuccessToast from '../../../components/SuccessToast';
import {
  remisionesService,
  CATEGORIAS_COMISION,
  TIPOS_COMISION,
  SELECCIONE_TIPO_COMISION,
  type RemisionItem,
  type ConsumoGrupo,
  type RemTecnicoItem,
  type TecnicoOption,
} from '../../../services/remisiones.service';
import { programacionesService, type ProgramacionDetail } from '../../../services/programaciones.service';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
// Reutiliza el mismo sistema de diseño que ya usa EditarRemisionModal.tsx — este formulario es el
// mismo "Agregar Comisión" que ya existía en ProgramacionDetailPage, extraído a un componente
// aparte para no mantener dos copias que terminan divergiendo (justo lo que pasó antes: la de
// Remisión se quedó con un formulario viejo mientras la de Programación se actualizaba).
import { styles, formatMoney, formatDate } from '../programaciones/ProgramacionDetailPage';

const toSentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

interface AgregarComisionModalProps {
  programacionId: string;
  // Si se da, bloquea la remisión (sin selector, ni en el formulario principal ni en el detalle de
  // inversionista) — para abrir el formulario desde el detalle de una remisión puntual en vez de
  // desde la programación, donde sí hace falta elegir entre varias.
  remisionId?: string;
  onClose: () => void;
  // Se llama una sola vez, justo después de guardar la comisión con éxito — el padre decide ahí
  // qué invalidar y cómo avisarle al usuario (este modal ya se encarga de cerrarse solo).
  onCreated: () => void;
}

export default function AgregarComisionModal({ programacionId, remisionId: remisionIdLocked, onClose, onCreated }: AgregarComisionModalProps) {
  useBodyScrollLock(true);
  const comisionModalContentRef = useRef<HTMLDivElement>(null);

  const { data: programacion } = useQuery<ProgramacionDetail>({
    queryKey: ['programacion', programacionId],
    queryFn: () => programacionesService.getById(programacionId),
  });
  const { data: remisiones = [] } = useQuery<RemisionItem[]>({
    queryKey: ['remisiones', programacionId],
    queryFn: () => remisionesService.findByProgramacion(programacionId),
  });
  const { data: consumoGrupos = [] } = useQuery<ConsumoGrupo[]>({
    queryKey: ['remisiones-consumos', programacionId],
    queryFn: () => remisionesService.findConsumosByProgramacion(programacionId),
  });
  // Para Categoría TÉCNICOS: el Nombre Contacto se limita a los técnicos ya asociados a la
  // remisión elegida (Rem_Tecnicos), en vez de una búsqueda abierta por clasificación.
  const { data: remTecnicos = [] } = useQuery<RemTecnicoItem[]>({
    queryKey: ['remisiones-tecnicos', programacionId],
    queryFn: () => remisionesService.findTecnicosByProgramacion(programacionId),
  });

  const [comisionForm, setComisionForm] = useState({
    categoria: '',
    tipo: '',
    remisionId: remisionIdLocked ?? '',
    vrComision: '',
    observaciones: '',
    agregarIva: false,
    cargarPorcentaje: '',
    quieresDesglosar: false,
    seleccioneTipo: '',
  });
  const [comisionTecnico, setComisionTecnico] = useState<TecnicoOption | null>(null);
  const [tecnicoSearch, setTecnicoSearch] = useState('');
  const [tecnicoFocused, setTecnicoFocused] = useState(false);
  const [inversionistaDetalles, setInversionistaDetalles] = useState<{ localId: string; remisionId: string; remisionLabel: string; productoId: string; productoLabel: string; valor: string }[]>([]);
  const [showDetalleInversionista, setShowDetalleInversionista] = useState(false);
  const [detalleForm, setDetalleForm] = useState({ remisionId: remisionIdLocked ?? '', productoId: '', valor: '' });
  const [detalleRemisionFocused, setDetalleRemisionFocused] = useState(false);
  const [detalleProductoFocused, setDetalleProductoFocused] = useState(false);
  const [detalleError, setDetalleError] = useState<{ field: string; message: string } | null>(null);
  const [showDetalleInversionistaSuccess, setShowDetalleInversionistaSuccess] = useState(false);
  const [hoveredDetalleRemisionId, setHoveredDetalleRemisionId] = useState<string | null>(null);
  const [hoveredDetalleProductoId, setHoveredDetalleProductoId] = useState<string | null>(null);
  const [detalleRemisionHighlighted, setDetalleRemisionHighlighted] = useState(0);
  const detalleRemisionBtnRef = useRef<HTMLButtonElement>(null);
  const detalleProductoBtnRef = useRef<HTMLButtonElement>(null);
  const detalleValorInputRef = useRef<HTMLInputElement>(null);
  const [detalleProductoHighlighted, setDetalleProductoHighlighted] = useState(0);
  const [remisionFocused, setRemisionFocused] = useState(false);
  const [comisionConsumoExpanded, setComisionConsumoExpanded] = useState(false);
  const tecnicoInputRef = useRef<HTMLInputElement>(null);
  const cargarPorcentajeRef = useRef<HTMLInputElement>(null);
  const [hoveredTecnicoOptionId, setHoveredTecnicoOptionId] = useState<string | null>(null);
  const [hoveredRemisionOptionId, setHoveredRemisionOptionId] = useState<string | null>(null);
  const [comisionError, setComisionError] = useState<{ field: string; message: string } | null>(null);
  const [showConfirmComision, setShowConfirmComision] = useState(false);

  useEffect(() => {
    setTimeout(() => { if (comisionModalContentRef.current) comisionModalContentRef.current.scrollTop = 0; }, 0);
  }, []);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const clasificacionPorCategoria: Record<string, string> = { 'TÉCNICOS': 'COMISIONISTA', 'INVERSIONISTAS': 'INVERSIONISTA' };
  const comisionClasificacion = clasificacionPorCategoria[comisionForm.categoria];

  const { data: tecnicoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', tecnicoSearch, comisionClasificacion],
    queryFn: () => remisionesService.searchTecnicos(tecnicoSearch, comisionClasificacion),
    // Categoría TÉCNICOS no usa esta búsqueda abierta — se limita a los técnicos ya asociados a
    // la remisión elegida (ver tecnicosDeRemisionSeleccionada más abajo).
    enabled: comisionForm.categoria !== 'TÉCNICOS',
  });

  const esCategoriaInversionistas = comisionForm.categoria === 'INVERSIONISTAS';
  const totalInversionistaDetalles = inversionistaDetalles.reduce((sum, d) => sum + (Number(d.valor) || 0), 0);

  // Técnicos ya asociados a la remisión elegida, sin duplicados — opciones de Nombre Contacto
  // cuando la categoría es TÉCNICOS.
  const esCategoriaTecnicos = comisionForm.categoria === 'TÉCNICOS';
  const tecnicosDeRemisionSeleccionada: TecnicoOption[] = Array.from(
    new Map(
      remTecnicos
        .filter(t => t.remision?.id === comisionForm.remisionId && t.tecnico)
        .map(t => [t.tecnico!.id, { id: t.tecnico!.id, nombreCompleto: t.tecnico!.nombreCompleto }]),
    ).values(),
  );
  const tecnicoOpciones = esCategoriaTecnicos
    ? tecnicosDeRemisionSeleccionada.filter(t => !tecnicoSearch.trim() || t.nombreCompleto.toLowerCase().includes(tecnicoSearch.trim().toLowerCase()))
    : tecnicoResults;

  const createComisionMutation = useMutation({
    mutationFn: () => remisionesService.createComision({
      programacionId,
      categoria: comisionForm.categoria,
      tipo: comisionForm.tipo || undefined,
      tecnicoId: comisionTecnico?.id,
      remisionId: comisionForm.remisionId || undefined,
      vrComision: esCategoriaInversionistas ? undefined : Number(comisionForm.vrComision),
      detalles: esCategoriaInversionistas
        ? inversionistaDetalles.map(d => ({ remisionId: d.remisionId, productoId: d.productoId, valor: Number(d.valor) }))
        : undefined,
      observaciones: comisionForm.observaciones || undefined,
      agregarIva: comisionForm.agregarIva,
      cargarPorcentaje: comisionForm.agregarIva && comisionForm.cargarPorcentaje ? Number(comisionForm.cargarPorcentaje) : undefined,
      quieresDesglosar: comisionForm.quieresDesglosar,
      seleccioneTipo: comisionForm.seleccioneTipo || undefined,
    }),
    onSuccess: () => {
      setShowConfirmComision(false);
      onCreated();
    },
  });

  // Validación secuencial: cada campo solo se habilita una vez que el anterior ya quedó lleno,
  // para que no se pueda "saltar" a llenar uno de más abajo.
  const comisionTipoReady = !!comisionForm.remisionId;
  const comisionCategoriaReady = comisionTipoReady && !!comisionForm.tipo;
  const comisionTecnicoReady = comisionCategoriaReady && !!comisionForm.categoria;
  const comisionValorReady = comisionTecnicoReady && !!comisionTecnico;
  const comisionValorCompleto = comisionValorReady && (esCategoriaInversionistas ? inversionistaDetalles.length > 0 : !!comisionForm.vrComision);

  const openDetalleInversionista = () => {
    setDetalleForm({ remisionId: remisionIdLocked ?? '', productoId: '', valor: '' });
    setDetalleRemisionFocused(!remisionIdLocked);
    setDetalleRemisionHighlighted(0);
    setDetalleProductoFocused(false);
    setDetalleError(null);
    setShowDetalleInversionista(true);
    setTimeout(() => (remisionIdLocked ? detalleProductoBtnRef : detalleRemisionBtnRef).current?.focus(), 0);
  };

  const selectDetalleRemision = (remisionId: string) => {
    setDetalleForm({ ...detalleForm, remisionId, productoId: '' });
    setDetalleRemisionFocused(false);
    setDetalleError(null);
    setDetalleProductoHighlighted(0);
    setDetalleProductoFocused(true);
    setTimeout(() => detalleProductoBtnRef.current?.focus(), 0);
  };

  const selectDetalleProducto = (productoId: string) => {
    setDetalleForm({ ...detalleForm, productoId });
    setDetalleProductoFocused(false);
    setDetalleError(null);
    setTimeout(() => detalleValorInputRef.current?.focus(), 0);
  };

  const handleGuardarDetalleInversionista = () => {
    if (!detalleForm.remisionId) { setDetalleError({ field: 'remisionId', message: 'Selecciona la remisión.' }); return; }
    if (!detalleForm.productoId) { setDetalleError({ field: 'productoId', message: 'Selecciona el producto.' }); return; }
    if (!detalleForm.valor || Number(detalleForm.valor) <= 0) { setDetalleError({ field: 'valor', message: 'El valor debe ser mayor a cero.' }); return; }
    const remisionSel = remisiones.find(r => r.id === detalleForm.remisionId);
    const grupoSel = consumoGrupos.find(g => g.remisionId === detalleForm.remisionId);
    const itemSel = grupoSel?.items.find(it => it.productoId === detalleForm.productoId);
    setInversionistaDetalles(prev => [...prev, {
      localId: `${Date.now()}-${Math.random()}`,
      remisionId: detalleForm.remisionId,
      remisionLabel: remisionSel?.numRemision || remisionSel?.id || '-',
      productoId: detalleForm.productoId,
      productoLabel: itemSel?.productoNombre || itemSel?.productoReferencia || '-',
      valor: detalleForm.valor,
    }]);
    setShowDetalleInversionista(false);
    setShowDetalleInversionistaSuccess(true);
    if (comisionError?.field === 'detalles') setComisionError(null);
  };

  // TOTAL FACTURA (preview) — misma fórmula que getDetTecnicoDetalle
  // Sub Total se redondea antes de usarse en los siguientes pasos (no solo al mostrarse) — mismo
  // criterio que el backend (getDetTecnicoDetalle), para que este preview coincida con el detalle
  // real que se ve después de guardar.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const comisionVrComision = esCategoriaInversionistas ? totalInversionistaDetalles : (Number(comisionForm.vrComision) || 0);
  const comisionSubTotal = round2(comisionForm.agregarIva ? comisionVrComision : comisionVrComision / 1.16);
  const comisionIva = comisionForm.quieresDesglosar ? round2(comisionSubTotal * 0.16) : 0;
  const comisionRetIva = comisionForm.quieresDesglosar ? round2(comisionSubTotal * 0.10667) : 0;
  const comisionEsActEmpresarial = comisionForm.seleccioneTipo.trim().toUpperCase() === 'ACTIVIDAD EMPRESARIAL';
  const comisionRetIsr = comisionForm.quieresDesglosar ? (comisionEsActEmpresarial ? 0 : round2(comisionSubTotal * 0.0125)) : 0;
  const comisionTotalFactura = round2(comisionSubTotal + comisionIva - comisionRetIva - comisionRetIsr);

  const comisionRemisionSeleccionada = remisiones.find(r => r.id === comisionForm.remisionId);

  const handleGuardarComision = () => {
    if (!comisionForm.remisionId) { setComisionError({ field: 'remisionId', message: 'Selecciona una remisión.' }); return; }
    if (!comisionForm.tipo) { setComisionError({ field: 'tipo', message: 'Selecciona el tipo de comisión.' }); return; }
    if (!comisionForm.categoria) { setComisionError({ field: 'categoria', message: 'Selecciona la categoría.' }); return; }
    if (!comisionTecnico) { setComisionError({ field: 'tecnico', message: 'Selecciona el nombre de contacto.' }); return; }
    if (esCategoriaInversionistas) {
      if (inversionistaDetalles.length === 0) { setComisionError({ field: 'detalles', message: 'Agrega al menos un detalle de inversionista.' }); return; }
    } else if (!comisionForm.vrComision || Number(comisionForm.vrComision) <= 0) {
      setComisionError({ field: 'vrComision', message: 'El valor de asignación debe ser mayor a cero.' }); return;
    }
    if (comisionForm.agregarIva && (!comisionForm.cargarPorcentaje || Number(comisionForm.cargarPorcentaje) < 1)) { setComisionError({ field: 'cargarPorcentaje', message: 'Ingresa el porcentaje de IVA a cargar.' }); return; }
    setComisionError(null);
    setShowConfirmComision(true);
  };

  useEffect(() => {
    if (!comisionError) return;
    document.getElementById(`comision-field-${comisionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [comisionError]);

  return (
    <>
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div ref={comisionModalContentRef} className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
          <div style={styles.editModalHeader}>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
            <h2 style={styles.modalTitle}>Agregar Comisión</h2>
          </div>

          <div style={styles.editModalBody}>
            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>N° Programación *</label>
              <span style={styles.readOnlyPill}>{programacionId}</span>
            </div>

            <div style={styles.formGroup} id="comision-field-remisionId">
              <label style={styles.remisionLabel}>No Remisión *</label>
              {comisionRemisionSeleccionada && (
                <div style={{ ...styles.readOnlyField, backgroundColor: '#f3faec', border: '1px solid #dbe8c2', color: '#3f6510', fontWeight: 600, position: 'relative' as const, textAlign: 'center' as const }}>
                  {comisionRemisionSeleccionada.numRemision || comisionRemisionSeleccionada.id}
                  {!remisionIdLocked && (
                    <X
                      size={14}
                      style={{ cursor: 'pointer', position: 'absolute' as const, right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
                      onClick={() => { setComisionForm({ ...comisionForm, remisionId: '' }); setRemisionFocused(true); }}
                    />
                  )}
                </div>
              )}
              {!comisionRemisionSeleccionada && !remisionIdLocked && (
                <div style={{ position: 'relative' as const }}>
                  <button
                    type="button"
                    style={{ ...styles.input, ...(comisionError?.field === 'remisionId' ? styles.inputError : {}), display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' as const, color: '#9ca3af', backgroundColor: '#fff', cursor: 'pointer' }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setRemisionFocused(f => !f)}
                    onBlur={() => setTimeout(() => setRemisionFocused(false), 150)}
                  >
                    Seleccionar remisión
                    <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0, transform: remisionFocused ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                  </button>
                  {remisionFocused && (
                    <div style={styles.medicoDropdown}>
                      {remisiones.length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        remisiones.map(r => (
                            <div
                              key={r.id}
                              style={{ ...styles.medicoDropdownItem, ...(hoveredRemisionOptionId === r.id ? styles.medicoDropdownItemHighlighted : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setHoveredRemisionOptionId(r.id)}
                              onMouseLeave={() => setHoveredRemisionOptionId(null)}
                              onClick={() => { setComisionForm({ ...comisionForm, remisionId: r.id }); setRemisionFocused(false); setComisionError(null); }}
                            >
                              {r.numRemision || r.id}
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {comisionError?.field === 'remisionId' && <span style={styles.errorText}>{comisionError.message}</span>}
            </div>

            {comisionForm.remisionId && (
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Paciente</label>
                <span style={styles.readOnlyField}>{comisionRemisionSeleccionada?.paciente || '-'}</span>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Fecha QX *</label>
              <span style={{ ...styles.readOnlyField, backgroundColor: '#f3faec', border: '1px solid #dbe8c2', color: '#3f6510', fontWeight: 600, textAlign: 'center' as const }}>{formatDate(programacion?.fechaQx ?? null)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Doctor *</label>
              <div style={styles.medicoTagsWrap}>
                {programacion?.medicos.length ? programacion.medicos.map(m => (
                  <span key={m.medico.id} style={styles.editMedicoTag}>{m.medico.nombreCompleto}</span>
                )) : <span style={styles.readOnlyField}>-</span>}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Hospital *</label>
              <span style={{ ...styles.editMedicoTag, alignSelf: 'flex-start' as const }}>{programacion?.hospital?.nombre ?? '-'}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Consumo *</label>
              <div style={{ ...styles.readOnlyField, whiteSpace: 'pre-wrap' as const, minHeight: '44px', display: 'block' }}>
                <span style={comisionConsumoExpanded ? undefined : styles.consumoClamp}>{programacion?.consumo || '-'}</span>
                {(programacion?.consumo?.length ?? 0) > 180 && (
                  <button type="button" style={{ ...styles.verMasBtn, display: 'block' }} onClick={() => setComisionConsumoExpanded(v => !v)}>
                    {comisionConsumoExpanded ? 'Ver menos' : 'Ver más'}
                  </button>
                )}
              </div>
            </div>

            <div style={styles.formGroup} id="comision-field-tipo">
              <label style={styles.remisionLabel}>Tipo</label>
              {!comisionTipoReady ? (
                <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero la remisión</span>
              ) : (
                <div style={styles.pickBtnGrid}>
                  {TIPOS_COMISION.map(t => (
                    <button
                      key={t}
                      type="button"
                      style={{ ...styles.pickBtn, ...(comisionForm.tipo === t ? styles.pickBtnActive : {}), ...(comisionError?.field === 'tipo' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        // Bono solo aplica a técnicos — se autoselecciona la categoría y se
                        // ocultan Inversionistas/Plus (ver categoriasVisibles más abajo).
                        setComisionForm({
                          ...comisionForm,
                          tipo: t,
                          categoria: t === 'Bono' ? 'TÉCNICOS' : '',
                          vrComision: '',
                          observaciones: '',
                          agregarIva: false,
                          cargarPorcentaje: '',
                          quieresDesglosar: false,
                          seleccioneTipo: '',
                        });
                        setComisionTecnico(null);
                        setTecnicoSearch('');
                        setInversionistaDetalles([]);
                        setComisionError(null);
                        e.currentTarget.blur();
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {comisionError?.field === 'tipo' && <span style={styles.errorText}>{comisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="comision-field-categoria">
              <label style={styles.remisionLabel}>Categoría *</label>
              {!comisionCategoriaReady ? (
                <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero el tipo</span>
              ) : (
                <div style={styles.pickBtnGrid}>
                  {/* Bono solo aplica a técnicos — Inversionistas y Plus quedan ocultas. */}
                  {(comisionForm.tipo === 'Bono' ? CATEGORIAS_COMISION.filter(c => c === 'TÉCNICOS') : CATEGORIAS_COMISION).map(c => (
                    <button
                      key={c}
                      type="button"
                      style={{ ...styles.pickBtn, ...(comisionForm.categoria === c ? styles.pickBtnActive : {}), ...(comisionError?.field === 'categoria' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => {
                        const cambioCategoria = comisionForm.categoria !== c;
                        setComisionForm({
                          ...comisionForm,
                          categoria: c,
                          ...(cambioCategoria ? {
                            vrComision: '',
                            observaciones: '',
                            agregarIva: false,
                            cargarPorcentaje: '',
                            quieresDesglosar: false,
                            seleccioneTipo: '',
                          } : {}),
                        });
                        setComisionTecnico(null);
                        setTecnicoSearch('');
                        if (cambioCategoria) setInversionistaDetalles([]);
                        setComisionError(null);
                        e.currentTarget.blur();
                        setTimeout(() => tecnicoInputRef.current?.focus(), 0);
                      }}
                    >
                      {toSentenceCase(c)}
                    </button>
                  ))}
                </div>
              )}
              {comisionError?.field === 'categoria' && <span style={styles.errorText}>{comisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="comision-field-tecnico">
              <label style={styles.remisionLabel}>Nombre Contacto *</label>
              {!comisionTecnicoReady ? (
                <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero la categoría</span>
              ) : (
                <>
                  {comisionTecnico && (
                    <div style={styles.medicoTagsWrap}>
                      <span style={styles.editMedicoTag}>
                        {comisionTecnico.nombreCompleto}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => setComisionTecnico(null)} />
                      </span>
                    </div>
                  )}
                  {!comisionTecnico && (
                    <div style={{ position: 'relative' as const }}>
                      <input
                        ref={tecnicoInputRef}
                        style={{ ...styles.input, ...(comisionError?.field === 'tecnico' ? styles.inputError : {}) }}
                        placeholder={esCategoriaTecnicos ? 'Buscar entre los técnicos de esta remisión...' : 'Buscar técnico o contacto...'}
                        value={tecnicoSearch}
                        onChange={e => { setTecnicoSearch(e.target.value); setComisionError(null); }}
                        onFocus={() => setTecnicoFocused(true)}
                        onBlur={() => setTimeout(() => setTecnicoFocused(false), 150)}
                      />
                      {tecnicoFocused && (
                        <div style={styles.medicoDropdown}>
                          {tecnicoOpciones.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>
                              {esCategoriaTecnicos ? 'Esta remisión no tiene técnicos asociados' : 'Sin resultados'}
                            </div>
                          ) : (
                            tecnicoOpciones.map(t => (
                              <div
                                key={t.id}
                                style={{ ...styles.medicoDropdownItem, ...(hoveredTecnicoOptionId === t.id ? styles.medicoDropdownItemHighlighted : {}) }}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => setHoveredTecnicoOptionId(t.id)}
                                onMouseLeave={() => setHoveredTecnicoOptionId(null)}
                                onClick={() => { setComisionTecnico(t); setTecnicoSearch(''); setComisionError(null); }}
                              >
                                {t.nombreCompleto}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {comisionError?.field === 'tecnico' && <span style={styles.errorText}>{comisionError.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Base Ingreso</label>
              <span style={styles.readOnlyField}>{formatMoney(programacion?.baseIngreso ?? null)}</span>
            </div>

            {!esCategoriaInversionistas && (
              <div style={styles.formGroup} id="comision-field-vrComision">
                <label style={styles.remisionLabel}>Valor Asignación *</label>
                {!comisionValorReady ? (
                  <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero el nombre de contacto</span>
                ) : (
                  <div style={styles.stepperWrap}>
                    <input
                      type="number"
                      step="0.01"
                      style={{ ...styles.input, paddingRight: '5rem', ...(comisionError?.field === 'vrComision' ? styles.inputError : {}) }}
                      placeholder="$ 0.00"
                      value={comisionForm.vrComision}
                      onChange={e => { setComisionForm({ ...comisionForm, vrComision: e.target.value }); setComisionError(null); }}
                    />
                    <div style={styles.stepperBtns}>
                      <button type="button" style={styles.stepperBtn} onClick={() => { setComisionForm({ ...comisionForm, vrComision: String((Number(comisionForm.vrComision) || 0) - 100) }); setComisionError(null); }}>−</button>
                      <button type="button" style={styles.stepperBtn} onClick={() => { setComisionForm({ ...comisionForm, vrComision: String((Number(comisionForm.vrComision) || 0) + 100) }); setComisionError(null); }}>+</button>
                    </div>
                  </div>
                )}
                {comisionError?.field === 'vrComision' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>
            )}

            {esCategoriaInversionistas && (
              <div style={styles.formGroup} id="comision-field-detalles">
                <label style={styles.remisionLabel}>Detalle de inversionistas *{inversionistaDetalles.length > 0 ? ` · Total ${formatMoney(totalInversionistaDetalles)}` : ''}</label>
                {!comisionValorReady && (
                  <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero el nombre de contacto</span>
                )}
                {comisionValorReady && inversionistaDetalles.length > 0 && (
                  <div style={styles.consumosTableWrap}>
                    <table style={styles.consumosTable}>
                      <thead>
                        <tr>
                          <th style={styles.consumosTh}>No Programación</th>
                          <th style={styles.consumosTh}>No Remisión</th>
                          <th style={styles.consumosTh}>Producto</th>
                          <th style={{ ...styles.consumosTh, textAlign: 'right' as const }}>Valor</th>
                          <th style={styles.consumosTh}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inversionistaDetalles.map(d => (
                          <tr key={d.localId}>
                            <td style={styles.consumosTd}>{programacionId}</td>
                            <td style={styles.consumosTd}>{d.remisionLabel}</td>
                            <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={d.productoLabel}>{d.productoLabel}</td>
                            <td style={{ ...styles.consumosTd, textAlign: 'right' as const, fontWeight: 700 }}>{formatMoney(Number(d.valor))}</td>
                            <td style={styles.consumosTd}>
                              <X size={14} style={{ cursor: 'pointer', color: '#9ca3af' }} onClick={() => setInversionistaDetalles(prev => prev.filter(x => x.localId !== d.localId))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {comisionValorReady && inversionistaDetalles.length === 0 && (
                  <div style={{ ...styles.emptyState, backgroundColor: '#f9fafb' }}>No hay datos relacionados</div>
                )}
                {comisionValorReady && (
                  <button type="button" className="btn-press" style={styles.nuevoDetalleBtn} onClick={openDetalleInversionista}>
                    <Plus size={14} /> Nuevo
                  </button>
                )}
                {comisionError?.field === 'detalles' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>
            )}

            {esCategoriaInversionistas && (
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Valor de Comisiones o Bonificaciones</label>
                <span style={styles.readOnlyField}>{formatMoney(totalInversionistaDetalles)}</span>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Observaciones</label>
              {!comisionValorCompleto ? (
                <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Completa el valor de la comisión</span>
              ) : (
                <textarea
                  ref={autoResizeTextarea}
                  style={{ ...styles.input, minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const }}
                  value={comisionForm.observaciones}
                  onChange={e => { setComisionForm({ ...comisionForm, observaciones: e.target.value }); autoResizeTextarea(e.target); }}
                />
              )}
            </div>

            {comisionValorCompleto && (
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>¿Agregar IVA?</label>
                <div style={styles.pickBtnGrid}>
                  <button
                    type="button"
                    style={{ ...styles.pickBtn, ...(!comisionForm.agregarIva ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, agregarIva: false }); e.currentTarget.blur(); }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.pickBtn, ...(comisionForm.agregarIva ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, agregarIva: true, cargarPorcentaje: comisionForm.cargarPorcentaje || '16' }); e.currentTarget.blur(); setTimeout(() => cargarPorcentajeRef.current?.focus(), 0); }}
                  >
                    Sí
                  </button>
                </div>
              </div>
            )}

            {comisionValorCompleto && comisionForm.agregarIva && (
              <div style={styles.formGroup} id="comision-field-cargarPorcentaje">
                <label style={styles.remisionLabel}>Porcentaje de IVA a Cargar *</label>
                <div style={{ position: 'relative' as const }}>
                  <input
                    ref={cargarPorcentajeRef}
                    type="number"
                    min={1}
                    max={100}
                    step="0.01"
                    style={{ ...styles.input, paddingRight: '2.5rem', ...(comisionError?.field === 'cargarPorcentaje' ? styles.inputError : {}) }}
                    placeholder="16.00"
                    value={comisionForm.cargarPorcentaje}
                    onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/[^0-9.]/g, '');
                      const value = Number(cleaned) > 100 ? '100' : cleaned;
                      setComisionForm({ ...comisionForm, cargarPorcentaje: value });
                      setComisionError(null);
                    }}
                    onBlur={e => {
                      if (!e.target.value) return;
                      const num = Number(e.target.value);
                      if (Number.isNaN(num) || num < 1) setComisionForm(f => ({ ...f, cargarPorcentaje: '1' }));
                    }}
                  />
                  <span style={styles.percentSuffix}>%</span>
                </div>
                {comisionError?.field === 'cargarPorcentaje' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>
            )}

            {comisionValorCompleto && (
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>¿Quieres Desglosar?</label>
                <div style={styles.pickBtnGrid}>
                  <button
                    type="button"
                    style={{ ...styles.pickBtn, ...(!comisionForm.quieresDesglosar ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, quieresDesglosar: false }); e.currentTarget.blur(); }}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.pickBtn, ...(comisionForm.quieresDesglosar ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { setComisionForm({ ...comisionForm, quieresDesglosar: true }); e.currentTarget.blur(); }}
                  >
                    Sí
                  </button>
                </div>
              </div>
            )}

            {comisionValorCompleto && (
              <div style={styles.formGroup} id="comision-field-seleccioneTipo">
                <label style={styles.remisionLabel}>Seleccione Tipo</label>
                <div style={styles.pickBtnGrid}>
                  {SELECCIONE_TIPO_COMISION.map(t => (
                    <button
                      key={t}
                      type="button"
                      style={{ ...styles.pickBtn, ...(comisionForm.seleccioneTipo === t ? styles.pickBtnActive : {}), ...(comisionError?.field === 'seleccioneTipo' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setComisionForm({ ...comisionForm, seleccioneTipo: comisionForm.seleccioneTipo === t ? '' : t }); setComisionError(null); e.currentTarget.blur(); }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {comisionError?.field === 'seleccioneTipo' && <span style={styles.errorText}>{comisionError.message}</span>}
              </div>
            )}

            {comisionForm.quieresDesglosar && (
              <>
                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Sub Total</label>
                  <span style={styles.readOnlyField}>{formatMoney(comisionSubTotal)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>IVA</label>
                  <span style={styles.readOnlyField}>{formatMoney(comisionIva)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Retención IVA</label>
                  <span style={styles.readOnlyField}>{formatMoney(comisionRetIva)}</span>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Retención ISR</label>
                  <span style={styles.readOnlyField}>{formatMoney(comisionRetIsr)}</span>
                </div>
              </>
            )}

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Total Factura</label>
              <span style={styles.readOnlyField}>{formatMoney(comisionTotalFactura)}</span>
            </div>
          </div>

          <div style={styles.editModalFooter}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button
              style={styles.saveBtn}
              onClick={handleGuardarComision}
              disabled={createComisionMutation.isPending}
            >
              {createComisionMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {showConfirmComision && (
        <div className="modal-overlay-anim" style={styles.modalOverlay}>
          <div className="modal-content-anim" style={styles.confirmModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowConfirmComision(false)}><X size={18} /></button>
              <h2 style={styles.modalTitle}>Confirmar Comisión</h2>
            </div>
            <div style={styles.confirmBody}>
              <p style={styles.confirmIntro}>¿Deseas agregar esta comisión con los siguientes datos?</p>

              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Remisión</span>
                <span style={styles.confirmValue}>{comisionRemisionSeleccionada?.numRemision || comisionRemisionSeleccionada?.id}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Tipo</span>
                <span style={styles.confirmValue}>{comisionForm.tipo}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Categoría</span>
                <span style={styles.confirmValue}>{comisionForm.categoria}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Contacto</span>
                <span style={styles.confirmValue}>{comisionTecnico?.nombreCompleto}</span>
              </div>
              <div style={styles.confirmRow}>
                <span style={styles.confirmLabel}>Valor Asignación</span>
                <span style={styles.confirmValue}>{formatMoney(comisionVrComision)}</span>
              </div>

              {comisionForm.quieresDesglosar && (
                <>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Sub Total</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionSubTotal)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>IVA</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionIva)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Retención IVA</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionRetIva)}</span>
                  </div>
                  <div style={styles.confirmRow}>
                    <span style={styles.confirmLabel}>Retención ISR</span>
                    <span style={styles.confirmValue}>{formatMoney(comisionRetIsr)}</span>
                  </div>
                </>
              )}

              <div style={styles.confirmRowTotal}>
                <span style={styles.confirmLabel}>Total Factura</span>
                <span style={styles.confirmValueTotal}>{formatMoney(comisionTotalFactura)}</span>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowConfirmComision(false)}>Cancelar</button>
              <button
                style={styles.saveBtn}
                onClick={() => createComisionMutation.mutate()}
                disabled={createComisionMutation.isPending}
              >
                {createComisionMutation.isPending ? 'Guardando...' : 'Sí, agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetalleInversionista && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={styles.editModalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={() => setShowDetalleInversionista(false)}><X size={18} /></button>
              <h2 style={styles.modalTitle}>Detalle de Inversionista</h2>
            </div>
            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>No Programación</label>
                <span style={styles.readOnlyPill}><Lock size={12} /> {programacionId}</span>
              </div>

              <div style={styles.formGroup} id="detalle-field-remisionId">
                <label style={styles.remisionLabel}>No Remisión *</label>
                {(() => {
                  const remisionSel = remisiones.find(r => r.id === detalleForm.remisionId);
                  if (remisionSel) {
                    return (
                      <div style={{ ...styles.readOnlyField, backgroundColor: '#f3faec', border: '1px solid #dbe8c2', color: '#3f6510', fontWeight: 600, position: 'relative' as const, textAlign: 'center' as const }}>
                        {remisionSel.numRemision || remisionSel.id}
                        {!remisionIdLocked && (
                          <X
                            size={14}
                            style={{ cursor: 'pointer', position: 'absolute' as const, right: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
                            onClick={() => { setDetalleForm({ ...detalleForm, remisionId: '', productoId: '' }); setDetalleRemisionFocused(true); }}
                          />
                        )}
                      </div>
                    );
                  }
                  if (remisionIdLocked) return <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Cargando...</span>;
                  return (
                    <div style={{ position: 'relative' as const }}>
                      <button
                        ref={detalleRemisionBtnRef}
                        type="button"
                        style={{ ...styles.input, ...(detalleError?.field === 'remisionId' ? styles.inputError : {}), display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' as const, color: '#9ca3af', backgroundColor: '#fff', cursor: 'pointer' }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setDetalleRemisionFocused(f => !f)}
                        onBlur={() => setTimeout(() => setDetalleRemisionFocused(false), 150)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown' && remisiones.length > 0) {
                            e.preventDefault();
                            setDetalleRemisionFocused(true);
                            setDetalleRemisionHighlighted(i => Math.min(i + 1, remisiones.length - 1));
                          } else if (e.key === 'ArrowUp' && remisiones.length > 0) {
                            e.preventDefault();
                            setDetalleRemisionFocused(true);
                            setDetalleRemisionHighlighted(i => Math.max(i - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const r = remisiones[detalleRemisionHighlighted];
                            if (r) selectDetalleRemision(r.id);
                          }
                        }}
                      >
                        Seleccionar remisión
                        <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0, transform: detalleRemisionFocused ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                      </button>
                      {detalleRemisionFocused && (
                        <div style={styles.medicoDropdown}>
                          {remisiones.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                          ) : (
                            remisiones.map((r, i) => (
                              <div
                                key={r.id}
                                style={{ ...styles.medicoDropdownItem, ...(hoveredDetalleRemisionId === r.id || i === detalleRemisionHighlighted ? styles.medicoDropdownItemHighlighted : {}) }}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => { setHoveredDetalleRemisionId(r.id); setDetalleRemisionHighlighted(i); }}
                                onMouseLeave={() => setHoveredDetalleRemisionId(null)}
                                onClick={() => selectDetalleRemision(r.id)}
                              >
                                {r.numRemision || r.id}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {detalleError?.field === 'remisionId' && <span style={styles.errorText}>{detalleError.message}</span>}
              </div>

              <div style={styles.formGroup} id="detalle-field-productoId">
                <label style={styles.remisionLabel}>Producto *</label>
                {(() => {
                  const grupoSel = consumoGrupos.find(g => g.remisionId === detalleForm.remisionId);
                  const productosDisponibles = Array.from(
                    new Map((grupoSel?.items ?? []).filter(it => it.productoId).map(it => [it.productoId as string, it])).values(),
                  );
                  const productoSel = productosDisponibles.find(it => it.productoId === detalleForm.productoId);
                  if (!detalleForm.remisionId) {
                    return <span style={{ ...styles.readOnlyField, color: '#9ca3af' }}>Selecciona primero la remisión</span>;
                  }
                  return productoSel ? (
                    <div style={styles.medicoTagsWrap}>
                      <span style={styles.editMedicoTag}>
                        {productoSel.productoNombre || productoSel.productoReferencia}
                        <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setDetalleForm({ ...detalleForm, productoId: '' }); setDetalleProductoFocused(true); }} />
                      </span>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' as const }}>
                      <button
                        ref={detalleProductoBtnRef}
                        type="button"
                        style={{ ...styles.input, ...(detalleError?.field === 'productoId' ? styles.inputError : {}), display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' as const, color: '#9ca3af', backgroundColor: '#fff', cursor: 'pointer' }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setDetalleProductoFocused(f => !f)}
                        onBlur={() => setTimeout(() => setDetalleProductoFocused(false), 150)}
                        onKeyDown={e => {
                          if (e.key === 'ArrowDown' && productosDisponibles.length > 0) {
                            e.preventDefault();
                            setDetalleProductoFocused(true);
                            setDetalleProductoHighlighted(i => Math.min(i + 1, productosDisponibles.length - 1));
                          } else if (e.key === 'ArrowUp' && productosDisponibles.length > 0) {
                            e.preventDefault();
                            setDetalleProductoFocused(true);
                            setDetalleProductoHighlighted(i => Math.max(i - 1, 0));
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            const p = productosDisponibles[detalleProductoHighlighted];
                            if (p) selectDetalleProducto(p.productoId as string);
                          }
                        }}
                      >
                        Seleccionar producto
                        <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0, transform: detalleProductoFocused ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                      </button>
                      {detalleProductoFocused && (
                        <div style={styles.medicoDropdown}>
                          {productosDisponibles.length === 0 ? (
                            <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                          ) : (
                            productosDisponibles.map((it, i) => (
                              <div
                                key={it.productoId}
                                style={{ ...styles.medicoDropdownItem, ...(hoveredDetalleProductoId === it.productoId || i === detalleProductoHighlighted ? styles.medicoDropdownItemHighlighted : {}) }}
                                onMouseDown={e => e.preventDefault()}
                                onMouseEnter={() => { setHoveredDetalleProductoId(it.productoId); setDetalleProductoHighlighted(i); }}
                                onMouseLeave={() => setHoveredDetalleProductoId(null)}
                                onClick={() => selectDetalleProducto(it.productoId as string)}
                              >
                                {it.productoNombre || it.productoReferencia}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {detalleError?.field === 'productoId' && <span style={styles.errorText}>{detalleError.message}</span>}
              </div>

              <div style={styles.formGroup} id="detalle-field-valor">
                <label style={styles.remisionLabel}>Valor *</label>
                <div style={styles.stepperWrap}>
                  <input
                    ref={detalleValorInputRef}
                    type="number"
                    step="0.01"
                    style={{ ...styles.input, paddingRight: '5rem', ...(detalleError?.field === 'valor' ? styles.inputError : {}) }}
                    placeholder="$ 0.00"
                    value={detalleForm.valor}
                    onKeyDown={e => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                    onChange={e => { setDetalleForm({ ...detalleForm, valor: e.target.value.replace(/[^0-9.]/g, '') }); setDetalleError(null); }}
                  />
                  <div style={styles.stepperBtns}>
                    <button type="button" style={styles.stepperBtn} onClick={() => setDetalleForm({ ...detalleForm, valor: String((Number(detalleForm.valor) || 0) - 100) })}>−</button>
                    <button type="button" style={styles.stepperBtn} onClick={() => setDetalleForm({ ...detalleForm, valor: String((Number(detalleForm.valor) || 0) + 100) })}>+</button>
                  </div>
                </div>
                {detalleError?.field === 'valor' && <span style={styles.errorText}>{detalleError.message}</span>}
              </div>
            </div>
            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={() => setShowDetalleInversionista(false)}>Cancelar</button>
              <button style={styles.saveBtn} onClick={handleGuardarDetalleInversionista}>Agregar</button>
            </div>
          </div>
        </div>
      )}

      <SuccessToast show={showDetalleInversionistaSuccess} message="Detalle de inversionista agregado" onClose={() => setShowDetalleInversionistaSuccess(false)} />
    </>
  );
}
