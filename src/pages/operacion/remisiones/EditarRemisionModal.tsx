import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, FileText, Trash2, ChevronDown } from 'lucide-react';
import { cotizacionesService, type PaqueteOption } from '../../../services/cotizaciones.service';
import { AddStagedItemForm, StagedItemDetailModal, type StagedItem } from '../cotizaciones/CotizacionesPage';
import { focusNextInEnterNavRoot } from '../../../lib/keyboardNav.utils';
import type { RemisionDetail } from '../../../services/remisiones.service';
import {
  remisionesService,
  IMPUESTOS_REMISION,
  type CubrimientoOption,
  type TecnicoOption,
} from '../../../services/remisiones.service';
import { styles, formatMoney } from '../programaciones/ProgramacionDetailPage';

// Mismas constantes que AgregarRemisionModal.tsx — este modal reproduce su mismo formato/campos,
// adaptado para editar una remisión que ya existe (técnicos/consumos se persisten de inmediato,
// en vez de armarse en memoria para enviarse todos juntos al guardar).
const HOSPITALES_CUBRIMIENTO_ID = 'Zd5c45';

const CUBRIMIENTO_TO_CLASIFICACION: Record<string, string> = {
  '1A15': 'PARTICULAR',
  [HOSPITALES_CUBRIMIENTO_ID]: 'HOSPITAL',
  '1A17': 'DISTRIBUIDOR',
  '1A18': 'ASEGURADORA',
};

const REMISION_NIVEL_OPTIONS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6'];

const normalizeSearch = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const consumoToStagedItem = (c: RemisionDetail['consumos'][number]): StagedItem => ({
  localId: c.id,
  productoId: c.productoId ?? '',
  productoLabel: `${c.productoReferencia ?? ''} / ${c.productoNombre ?? ''}`.replace(/^ \/ /, ''),
  cantidad: String(c.cantidad),
  valorUnitario: String(c.valorUnitario),
  valor: String(c.valor),
  observaciones: '',
});

interface EditarRemisionModalProps {
  remision: RemisionDetail;
  remisionId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditarRemisionModal({ remision, remisionId, onClose, onUpdated }: EditarRemisionModalProps) {
  const queryClient = useQueryClient();
  const invalidateRemision = () => queryClient.invalidateQueries({ queryKey: ['remision', remisionId] });

  const [editForm, setEditForm] = useState({
    paciente: remision.paciente ?? '',
    cirugiaRealizada: remision.cirugiaRealizada ?? '',
    anestesiologo: remision.anestesiologo ?? '',
    impuestos: remision.impuestos ?? '',
    tieneDcto: remision.tieneDcto,
    porcentajeDcto: remision.porcentajeDcto != null ? String(remision.porcentajeDcto) : '',
    vrDctoPesos: remision.vrDctoPesos != null ? String(remision.vrDctoPesos) : '',
  });

  const [editCubrimiento, setEditCubrimiento] = useState<CubrimientoOption | null>(remision.cubrimiento);
  const [editEmpresa, setEditEmpresa] = useState<TecnicoOption | null>(remision.empresa ? { id: remision.empresa.id, nombreCompleto: remision.empresa.nombreCompleto } : null);
  const [editResponsable, setEditResponsable] = useState<TecnicoOption | null>(remision.responsableEconomico);
  const [responsableSearch, setResponsableSearch] = useState('');
  const [responsableHighlighted, setResponsableHighlighted] = useState(0);
  const responsableOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const responsableInputRef = useRef<HTMLInputElement>(null);

  const [anestesiologoSearch, setAnestesiologoSearch] = useState('');
  const [anestesiologoFocused, setAnestesiologoFocused] = useState(false);
  const [anestesiologoHighlighted, setAnestesiologoHighlighted] = useState(0);
  const anestesiologoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const anestesiologoInputRef = useRef<HTMLInputElement>(null);

  const [editError, setEditError] = useState<{ field: string; message: string } | null>(null);
  const [tecnicoApiError, setTecnicoApiError] = useState<string | null>(null);
  const [consumoApiError, setConsumoApiError] = useState<string | null>(null);

  // Avisos de técnicos/consumos (ej. "no se puede quitar el último") son transitorios — se
  // autodesaparecen igual que las notas de importación, en vez de quedarse fijos en el formulario.
  useEffect(() => {
    if (!tecnicoApiError) return;
    const timer = setTimeout(() => setTecnicoApiError(null), 4000);
    return () => clearTimeout(timer);
  }, [tecnicoApiError]);
  useEffect(() => {
    if (!consumoApiError) return;
    const timer = setTimeout(() => setConsumoApiError(null), 4000);
    return () => clearTimeout(timer);
  }, [consumoApiError]);

  // Bloqueo adicional en el cliente — el backend ya rechaza estos cambios si la remisión tiene
  // factura asociada (rompería el cálculo de facturado/por facturar), pero conviene no ofrecer los
  // controles como si funcionaran.
  const puedeEditarTecnicosConsumos = remision.facturas.length === 0;

  // Técnicos asociados (Rem_Tecnicos) — a diferencia de Agregar Remisión (donde se arman en
  // memoria y se envían de una sola vez al crear), aquí la remisión ya existe: cada alta/baja se
  // persiste de inmediato contra el servidor y la lista se refleja siempre desde `remision.tecnicos`
  // (prop que se refresca solo al invalidar la query 'remision' en el padre).
  const [editTecnicoSearch, setEditTecnicoSearch] = useState('');
  const [editTecnicoFocused, setEditTecnicoFocused] = useState(false);
  const [editTecnicoHighlighted, setEditTecnicoHighlighted] = useState(0);
  const editTecnicoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const addTecnicoMutation = useMutation({
    mutationFn: (tecnicoId: string) => remisionesService.addRemTecnico(remisionId, tecnicoId),
    onSuccess: () => { invalidateRemision(); setTecnicoApiError(null); },
    onError: () => setTecnicoApiError('No se pudo agregar el técnico.'),
  });
  const removeTecnicoMutation = useMutation({
    mutationFn: (relId: string) => remisionesService.removeRemTecnico(relId),
    onSuccess: () => { invalidateRemision(); setTecnicoApiError(null); },
    onError: () => setTecnicoApiError('No se pudo quitar el técnico.'),
  });

  // Consumos (Det_Consumo) — mismo criterio: cada alta/edición/baja se persiste de inmediato,
  // reflejado siempre desde `remision.consumos`.
  const [showAddConsumoModal, setShowAddConsumoModal] = useState(false);
  const [selectedStagedItem, setSelectedStagedItem] = useState<StagedItem | null>(null);
  const editConsumosStaged = remision.consumos.map(consumoToStagedItem);

  const [editImportNotaQueue, setEditImportNotaQueue] = useState<string[]>([]);
  const pushEditImportNota = (msg: string) => setEditImportNotaQueue(prev => [...prev, msg]);
  const editImportNotaActual = editImportNotaQueue[0];
  useEffect(() => {
    if (!editImportNotaActual) return;
    const timer = setTimeout(() => setEditImportNotaQueue(prev => prev.slice(1)), 5500);
    return () => clearTimeout(timer);
  }, [editImportNotaActual]);

  const [editPaquetePanelOpen, setEditPaquetePanelOpen] = useState(false);
  const [editPaqueteId, setEditPaqueteId] = useState('');
  const [editPaqueteLabel, setEditPaqueteLabel] = useState('');
  const [editPaqueteSearch, setEditPaqueteSearch] = useState('');
  const [editPaqueteHighlighted, setEditPaqueteHighlighted] = useState(0);
  const [editPaqueteNivel, setEditPaqueteNivel] = useState('');
  const [editPaqueteNivelOpen, setEditPaqueteNivelOpen] = useState(false);
  const [importandoEditPaquete, setImportandoEditPaquete] = useState(false);

  const addConsumoMutation = useMutation({
    mutationFn: (payload: { productoId: string; cantidad: number; valorUnitario: number; observaciones?: string }) =>
      remisionesService.addDetConsumo(remisionId, payload),
    onSuccess: () => { invalidateRemision(); setConsumoApiError(null); },
    onError: () => setConsumoApiError('No se pudo agregar el consumo.'),
  });
  const updateConsumoMutation = useMutation({
    mutationFn: ({ consumoId, payload }: { consumoId: string; payload: { cantidad: number; valorUnitario: number; observaciones?: string } }) =>
      remisionesService.updateDetConsumo(consumoId, payload),
    onSuccess: () => { invalidateRemision(); setConsumoApiError(null); },
    onError: () => setConsumoApiError('No se pudo editar el consumo.'),
  });
  const removeConsumoMutation = useMutation({
    mutationFn: (consumoId: string) => remisionesService.removeDetConsumo(consumoId),
    onSuccess: () => { invalidateRemision(); setConsumoApiError(null); },
    onError: () => setConsumoApiError('No se pudo eliminar el consumo.'),
  });

  const searchEditProductosConPrecio = (search: string, tarifaId?: string) =>
    cotizacionesService.searchProductos(search, undefined, tarifaId);

  const { data: cubrimientosEdit = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
  });

  const { data: responsableResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', responsableSearch, editCubrimiento?.id],
    queryFn: () => remisionesService.searchTecnicos(responsableSearch, editCubrimiento ? CUBRIMIENTO_TO_CLASIFICACION[editCubrimiento.id] : undefined),
    enabled: !!editCubrimiento,
  });
  useEffect(() => { setResponsableHighlighted(0); }, [responsableResults.length, responsableSearch]);
  useEffect(() => { responsableOptionRefs.current[responsableHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [responsableHighlighted]);

  const { data: empresaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['empresas'],
    queryFn: () => remisionesService.searchEmpresas(),
    enabled: !!editCubrimiento,
    select: results => results.filter(t => !t.nombreCompleto?.toLowerCase().includes('yucamark')),
  });

  const { data: anestesiologoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['remision-anestesiologos', anestesiologoSearch],
    queryFn: () => remisionesService.searchTecnicos(anestesiologoSearch, 'DOCTOR'),
    enabled: anestesiologoFocused,
  });
  useEffect(() => { setAnestesiologoHighlighted(0); }, [anestesiologoResults.length, anestesiologoSearch]);
  useEffect(() => { anestesiologoOptionRefs.current[anestesiologoHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [anestesiologoHighlighted]);

  // Tarifa: si el responsable económico tiene tarifa propia asignada se usa esa; si no, cae al
  // cubrimiento general seleccionado — misma lógica que AgregarRemisionModal.
  const { data: editTerceroTarifa, isLoading: editTarifaLoading } = useQuery({
    queryKey: ['remision-tercero-tarifa', editResponsable?.id],
    queryFn: () => remisionesService.getTerceroTarifa(editResponsable!.id),
    enabled: !!editResponsable?.id,
  });
  const editTarifaId = editResponsable?.id && editTarifaLoading
    ? undefined
    : (editTerceroTarifa?.tarifaId || editCubrimiento?.id);
  const editTarifaLabel = editTerceroTarifa?.tarifaNombre || editCubrimiento?.nombre || '';

  // Al cambiar de tarifa (por cambio de Cubrimiento o de Responsable Económico), los consumos ya
  // agregados deben recalcular su valor unitario según la tarifa nueva — mismo endpoint que usa
  // Nueva Cotización para recalcular sus ítems en memoria al cambiar de tarifa, aquí aplicado de
  // inmediato a los Det_Consumo ya guardados. Arranca en la tarifa original de la remisión para no
  // disparar una actualización espuria al abrir el modal sin haber cambiado nada.
  const consumosTarifaSyncRef = useRef<string | null>(remision.tarifa?.id ?? null);
  const [actualizandoPreciosTarifa, setActualizandoPreciosTarifa] = useState(false);
  useEffect(() => {
    if (!editTarifaId || editTarifaId === consumosTarifaSyncRef.current) return;
    consumosTarifaSyncRef.current = editTarifaId;
    if (!puedeEditarTecnicosConsumos) return;
    const productoIds = [...new Set(remision.consumos.map(c => c.productoId).filter((id): id is string => !!id))];
    if (productoIds.length === 0) return;
    setActualizandoPreciosTarifa(true);
    cotizacionesService.getPreciosPorProductos(productoIds, editTarifaId)
      .then(async precios => {
        const precioPorProducto = new Map(precios.map(p => [p.productoId, p.precio]));
        const aActualizar = remision.consumos.filter(c => {
          if (!c.productoId) return false;
          const nuevoPrecio = precioPorProducto.get(c.productoId);
          return nuevoPrecio != null && Number(nuevoPrecio) !== Number(c.valorUnitario);
        });
        if (aActualizar.length === 0) return;
        await Promise.all(aActualizar.map(c =>
          remisionesService.updateDetConsumo(c.id, { valorUnitario: Number(precioPorProducto.get(c.productoId!)) }),
        ));
        pushEditImportNota(`Se actualizó el precio de ${aActualizar.length} consumo${aActualizar.length === 1 ? '' : 's'} según la nueva tarifa.`);
        invalidateRemision();
      })
      .catch(() => setConsumoApiError('No se pudieron actualizar los precios de los consumos con la nueva tarifa.'))
      .finally(() => setActualizandoPreciosTarifa(false));
  }, [editTarifaId]);

  const { data: editTecnicoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['remision-tecnicos-comisionistas', editTecnicoSearch],
    queryFn: () => remisionesService.searchTecnicosComisionistas(editTecnicoSearch),
    enabled: editTecnicoFocused,
  });
  useEffect(() => { setEditTecnicoHighlighted(0); }, [editTecnicoResults.length, editTecnicoSearch]);
  useEffect(() => { editTecnicoOptionRefs.current[editTecnicoHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [editTecnicoHighlighted]);

  const { data: editPaqueteOptions = [] } = useQuery<PaqueteOption[]>({
    queryKey: ['remision-paquetes'],
    queryFn: () => cotizacionesService.getPaquetes(),
    enabled: editPaquetePanelOpen,
  });
  const editPaqueteOptionsFiltrados = editPaqueteSearch.trim()
    ? editPaqueteOptions.filter(p => p.nombre && normalizeSearch(p.nombre).includes(normalizeSearch(editPaqueteSearch.trim())))
    : editPaqueteOptions;

  // Al cambiar de Cubrimiento se limpia el Responsable Económico elegido — pertenecía a la
  // clasificación del cubrimiento anterior (ej. el hospital, bajo "Hospitales") y no tiene sentido
  // seguir usándolo bajo uno distinto (Particulares/Distribuidor/Aseguradora); se obliga a elegir
  // uno nuevo, que a su vez recalcula la tarifa (la propia del tercero si tiene, si no la base del
  // cubrimiento elegido). Si el cubrimiento nuevo es "Hospitales", se autoselecciona el Tercero del
  // hospital de la programación — mismo criterio que AgregarRemisionModal.
  const selectEditCubrimiento = (c: CubrimientoOption) => {
    if (editCubrimiento?.id !== c.id) {
      const hospitalTercero = remision.programacion?.hospital?.tercero ?? null;
      setEditResponsable(c.id === HOSPITALES_CUBRIMIENTO_ID && hospitalTercero ? hospitalTercero : null);
      setResponsableSearch('');
    }
    setEditCubrimiento(c);
    setEditError(null);
  };

  const closeEditPaquetePanel = () => {
    setEditPaquetePanelOpen(false);
    setEditPaqueteId('');
    setEditPaqueteLabel('');
    setEditPaqueteSearch('');
    setEditPaqueteNivel('');
    setEditPaqueteNivelOpen(false);
  };

  const handleImportarEditPaquete = async () => {
    if (!editPaqueteId || !editPaqueteNivel || importandoEditPaquete) return;
    setImportandoEditPaquete(true);
    try {
      const { items, excluidosPorDenegado } = await cotizacionesService.getPaqueteConsumos(editPaqueteId, editPaqueteNivel, editTarifaId);
      if (items.length > 0) {
        await remisionesService.createDetConsumosBulk(remisionId, items.map(p => ({
          productoId: p.id,
          cantidad: p.cantidad,
          valorUnitario: p.precioSugerido ?? 0,
        })));
        invalidateRemision();
      }
      const partes: string[] = [];
      if (items.length > 0) partes.push(`se agregaron ${items.length} producto${items.length === 1 ? '' : 's'}`);
      if (excluidosPorDenegado > 0) partes.push(`se omitieron ${excluidosPorDenegado} denegado${excluidosPorDenegado === 1 ? '' : 's'} para la tarifa actual`);
      if (partes.length > 0) pushEditImportNota(partes.join(', ').replace(/^./, c => c.toUpperCase()) + '.');
      closeEditPaquetePanel();
    } catch {
      setConsumoApiError('No se pudo importar el paquete.');
    } finally {
      setImportandoEditPaquete(false);
    }
  };

  const updateRemisionMutation = useMutation({
    mutationFn: () => remisionesService.updateRemision(remisionId, {
      paciente: editForm.paciente,
      cirugiaRealizada: editForm.cirugiaRealizada,
      cubrimientoId: editCubrimiento?.id,
      tarifaId: editTarifaId,
      empresaId: editEmpresa?.id,
      responsableEconomicoId: editResponsable?.id,
      anestesiologo: editForm.anestesiologo,
      impuestos: editForm.impuestos || undefined,
      tieneDcto: editForm.tieneDcto,
      porcentajeDcto: editForm.tieneDcto && editForm.porcentajeDcto ? Number(editForm.porcentajeDcto) : undefined,
      vrDctoPesos: editForm.tieneDcto && editForm.vrDctoPesos ? Number(editForm.vrDctoPesos) : undefined,
    }),
    onSuccess: () => {
      invalidateRemision();
      onUpdated();
    },
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const editSubtotal = remision.consumos.reduce((sum, c) => sum + (Number(c.valor) || 0), 0);
  const editDescuentos = editForm.tieneDcto
    ? editSubtotal * (Number(editForm.porcentajeDcto || 0) / 100) + Number(editForm.vrDctoPesos || 0)
    : 0;
  const editTotalAntesImp = round2(editSubtotal - editDescuentos);
  const editIva = round2((editForm.impuestos === 'I.V.A.' || editForm.impuestos === 'Todos') ? editTotalAntesImp * 0.16 : 0);
  const editRetencion = round2((editForm.impuestos === 'Retención' || editForm.impuestos === 'Todos') ? editTotalAntesImp * 0.106667 : 0);
  const editTotalPagar = round2(editTotalAntesImp + editIva - editRetencion);

  const handleGuardarEdit = () => {
    if (!editForm.paciente.trim()) { setEditError({ field: 'paciente', message: 'Ingresa el nombre del paciente.' }); return; }
    if (!editCubrimiento) { setEditError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!editEmpresa) { setEditError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!editResponsable) { setEditError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (!editTarifaId) { setEditError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    if (!editForm.anestesiologo.trim()) { setEditError({ field: 'anestesiologo', message: 'Ingresa el anestesiólogo.' }); return; }
    if (!editForm.cirugiaRealizada.trim()) { setEditError({ field: 'cirugiaRealizada', message: 'Ingresa la cirugía realizada.' }); return; }
    if (remision.tecnicos.length === 0) { setEditError({ field: 'tecnicos', message: 'Debe haber al menos un técnico asociado.' }); return; }
    if (remision.consumos.length === 0) { setEditError({ field: 'consumos', message: 'Debe haber al menos un consumo.' }); return; }
    if (editForm.tieneDcto && !editForm.porcentajeDcto.trim() && !editForm.vrDctoPesos.trim()) { setEditError({ field: 'porcentajeDcto', message: 'Ingresa el porcentaje y/o el valor del descuento.' }); return; }
    if (!editForm.impuestos) { setEditError({ field: 'impuestos', message: 'Selecciona los impuestos.' }); return; }
    setEditError(null);
    updateRemisionMutation.mutate();
  };

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`remision-edit-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  return (
    <>
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div className="modal-content-anim" style={styles.editModalContent} data-enter-nav-root onClick={e => e.stopPropagation()}>
          <div style={styles.editModalHeader}>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
            <h2 style={styles.modalTitle}>Editar Remisión</h2>
          </div>

          <div style={styles.editModalBody}>
            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Programación *</label>
              <span style={styles.readOnlyPill}>{remision.programacion?.numProgram ?? remision.programacion?.id ?? '-'}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Sede</label>
              <span style={styles.readOnlyField}>{remision.programacion?.sede?.nombre ?? '-'}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Usuario *</label>
              <span style={styles.readOnlyField}>{remision.usuario?.nombreCompleto ?? '-'}</span>
            </div>

            <div style={styles.formGroup} id="remision-edit-field-paciente">
              <label style={styles.remisionLabel}>Paciente *</label>
              <input
                style={{ ...styles.input, ...(editError?.field === 'paciente' ? styles.inputError : {}) }}
                value={editForm.paciente}
                onChange={e => { setEditForm({ ...editForm, paciente: e.target.value }); setEditError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextInEnterNavRoot(e.currentTarget); } }}
              />
              {editError?.field === 'paciente' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-cubrimiento">
              <label style={styles.remisionLabel}>Cubrimiento *</label>
              <div style={styles.pickBtnGrid}>
                {cubrimientosEdit.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className="pick-btn-focus"
                    style={{ ...styles.pickBtn, ...(editCubrimiento?.id === c.id ? styles.pickBtnActive : {}), ...(editError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => { selectEditCubrimiento(c); e.currentTarget.blur(); }}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
              {editError?.field === 'cubrimiento' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-empresa">
              <label style={styles.remisionLabel}>Empresa *</label>
              {!editCubrimiento ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero el cubrimiento</span>
              ) : (
                <div style={styles.pickBtnGrid}>
                  {empresaResults.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="pick-btn-focus"
                      style={{ ...styles.pickBtn, ...(editEmpresa?.id === t.id ? styles.pickBtnActive : {}), ...(editError?.field === 'empresa' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setEditEmpresa(t); setEditError(null); e.currentTarget.blur(); }}
                    >
                      {t.nombreCompleto}
                    </button>
                  ))}
                </div>
              )}
              {editError?.field === 'empresa' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-responsable">
              <label style={styles.remisionLabel}>Responsable Económico *</label>
              {editResponsable ? (
                <div style={styles.medicoTagsWrap}>
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    {editResponsable.nombreCompleto}
                    <X
                      size={12}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setEditResponsable(null); setTimeout(() => responsableInputRef.current?.focus(), 0); }}
                    />
                  </span>
                </div>
              ) : !editCubrimiento ? (
                <span style={styles.readOnlyField}>Selecciona primero el cubrimiento</span>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    ref={responsableInputRef}
                    style={{ ...styles.input, ...(editError?.field === 'responsable' ? styles.inputError : {}) }}
                    placeholder="Buscar tercero..."
                    value={responsableSearch}
                    onChange={e => { setResponsableSearch(e.target.value); setEditError(null); }}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown' && responsableResults.length > 0) {
                        e.preventDefault();
                        setResponsableHighlighted(i => Math.min(i + 1, responsableResults.length - 1));
                      } else if (e.key === 'ArrowUp' && responsableResults.length > 0) {
                        e.preventDefault();
                        setResponsableHighlighted(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const t = responsableResults[responsableHighlighted];
                        if (t) { setEditResponsable(t); setResponsableSearch(''); setEditError(null); }
                      }
                    }}
                  />
                  {responsableSearch.trim() && (
                    <div style={styles.medicoDropdown}>
                      {responsableResults.length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        responsableResults.map((t, i) => (
                          <div
                            key={t.id}
                            ref={el => { responsableOptionRefs.current[i] = el; }}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === responsableHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setResponsableHighlighted(i)}
                            onClick={() => { setEditResponsable(t); setResponsableSearch(''); setEditError(null); }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {editError?.field === 'responsable' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-tarifa">
              <label style={styles.remisionLabel}>Tarifa *</label>
              {editCubrimiento ? (
                <span style={styles.readOnlyField}>{editTarifaLabel || 'Se selecciona automáticamente al seleccionar el cubrimiento'}</span>
              ) : (
                <span style={styles.readOnlyField}>Selecciona primero un cubrimiento</span>
              )}
              {editError?.field === 'tarifa' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-anestesiologo">
              <label style={styles.remisionLabel}>Anestesiólogo *</label>
              {editForm.anestesiologo ? (
                <div style={styles.medicoTagsWrap}>
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    {editForm.anestesiologo}
                    <X
                      size={12}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setEditForm({ ...editForm, anestesiologo: '' }); setAnestesiologoSearch(''); setTimeout(() => anestesiologoInputRef.current?.focus(), 0); }}
                    />
                  </span>
                </div>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    ref={anestesiologoInputRef}
                    style={{ ...styles.input, ...(editError?.field === 'anestesiologo' ? styles.inputError : {}) }}
                    placeholder="Buscar anestesiólogo..."
                    value={anestesiologoSearch}
                    onChange={e => setAnestesiologoSearch(e.target.value)}
                    onFocus={() => setAnestesiologoFocused(true)}
                    onBlur={() => setTimeout(() => setAnestesiologoFocused(false), 150)}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown' && anestesiologoResults.length > 0) {
                        e.preventDefault();
                        setAnestesiologoHighlighted(i => Math.min(i + 1, anestesiologoResults.length - 1));
                      } else if (e.key === 'ArrowUp' && anestesiologoResults.length > 0) {
                        e.preventDefault();
                        setAnestesiologoHighlighted(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const t = anestesiologoResults[anestesiologoHighlighted];
                        if (t) { setEditForm({ ...editForm, anestesiologo: t.nombreCompleto }); setAnestesiologoSearch(''); setEditError(null); focusNextInEnterNavRoot(e.currentTarget); }
                      }
                    }}
                  />
                  {anestesiologoFocused && (
                    <div style={styles.medicoDropdown}>
                      {anestesiologoResults.length === 0 ? (
                        <div style={{ padding: '0.6rem 0.75rem', color: '#9ca3af', fontSize: '0.85rem' }}>Sin resultados</div>
                      ) : (
                        anestesiologoResults.map((t, i) => (
                          <div
                            key={t.id}
                            ref={el => { anestesiologoOptionRefs.current[i] = el; }}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === anestesiologoHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setAnestesiologoHighlighted(i)}
                            onClick={() => { setEditForm({ ...editForm, anestesiologo: t.nombreCompleto }); setAnestesiologoSearch(''); setEditError(null); if (anestesiologoInputRef.current) focusNextInEnterNavRoot(anestesiologoInputRef.current); }}
                          >
                            {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {editError?.field === 'anestesiologo' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-cirugiaRealizada">
              <label style={styles.remisionLabel}>Cirugía Realizada *</label>
              <input
                style={{ ...styles.input, ...(editError?.field === 'cirugiaRealizada' ? styles.inputError : {}) }}
                value={editForm.cirugiaRealizada}
                onChange={e => { setEditForm({ ...editForm, cirugiaRealizada: e.target.value }); setEditError(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextInEnterNavRoot(e.currentTarget); } }}
              />
              {editError?.field === 'cirugiaRealizada' && <span style={styles.errorText}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-tecnicos">
              <label style={styles.remisionLabel}>Técnicos Asociados *</label>
              {!puedeEditarTecnicosConsumos && (
                <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginBottom: '0.4rem' }}>Esta remisión ya tiene factura asociada — no se pueden editar sus técnicos.</span>
              )}
              {remision.tecnicos.length > 0 && (
                <div style={styles.medicoTagsWrap}>
                  {remision.tecnicos.map(t => (
                    <span key={t.id} style={styles.editMedicoTag}>
                      {t.tecnico?.nombreCompleto ?? '-'}
                      {puedeEditarTecnicosConsumos && (
                        <X
                          size={12}
                          style={{ cursor: removeTecnicoMutation.isPending ? 'default' : 'pointer' }}
                          onClick={() => {
                            if (removeTecnicoMutation.isPending) return;
                            if (remision.tecnicos.length <= 1) { setTecnicoApiError('Debe haber al menos un técnico asociado.'); return; }
                            removeTecnicoMutation.mutate(t.id);
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}
              {puedeEditarTecnicosConsumos && (
                <div style={{ position: 'relative' as const }}>
                  <input
                    style={styles.input}
                    placeholder="Buscar técnico..."
                    value={editTecnicoSearch}
                    onChange={e => setEditTecnicoSearch(e.target.value)}
                    onFocus={() => setEditTecnicoFocused(true)}
                    onBlur={() => setTimeout(() => setEditTecnicoFocused(false), 150)}
                    onKeyDown={e => {
                      const disponibles = editTecnicoResults.filter(t => !remision.tecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto));
                      if (e.key === 'ArrowDown' && disponibles.length > 0) {
                        e.preventDefault();
                        setEditTecnicoHighlighted(i => Math.min(i + 1, disponibles.length - 1));
                      } else if (e.key === 'ArrowUp' && disponibles.length > 0) {
                        e.preventDefault();
                        setEditTecnicoHighlighted(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const t = disponibles[editTecnicoHighlighted];
                        if (t) { addTecnicoMutation.mutate(t.id); setEditTecnicoSearch(''); }
                      }
                    }}
                  />
                  {editTecnicoFocused && (
                    <div style={styles.medicoDropdown}>
                      {editTecnicoResults.filter(t => !remision.tecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        editTecnicoResults.filter(t => !remision.tecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto)).map((t, i) => (
                          <div
                            key={t.id}
                            ref={el => { editTecnicoOptionRefs.current[i] = el; }}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === editTecnicoHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setEditTecnicoHighlighted(i)}
                            onClick={() => { addTecnicoMutation.mutate(t.id); setEditTecnicoSearch(''); }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {tecnicoApiError && <span style={{ ...styles.errorText, display: 'block', marginTop: '0.3rem' }}>{tecnicoApiError}</span>}
              {editError?.field === 'tecnicos' && <span style={{ ...styles.errorText, display: 'block', marginTop: '0.3rem' }}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-edit-field-consumos">
              <div style={styles.consumoSectionHeader}>
                <label style={styles.remisionLabel}>Consumos *</label>
                <span style={styles.consumoCountBadge}>{remision.consumos.length}</span>
              </div>

              {actualizandoPreciosTarifa && (
                <span style={{ fontSize: '0.78rem', color: '#6b8c1f', display: 'block', margin: '0.3rem 0' }}>Actualizando precios según la nueva tarifa...</span>
              )}

              {!puedeEditarTecnicosConsumos && (
                <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', margin: '0.3rem 0' }}>Esta remisión ya tiene factura asociada — no se pueden editar sus consumos.</span>
              )}

              {puedeEditarTecnicosConsumos && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, alignItems: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-press"
                    disabled={!editTarifaId}
                    style={{ ...styles.addFromCatalogBtn, whiteSpace: 'nowrap' as const, flexShrink: 0, ...(!editTarifaId ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}) }}
                    onClick={() => setEditPaquetePanelOpen(true)}
                  >
                    <FileText size={12} /> Importar por paquete
                  </button>
                </div>
              )}

              {remision.consumos.length > 0 && editTarifaLabel && (
                <div style={{ ...styles.tarifaHint, marginTop: '0.5rem', marginBottom: 0 }}>
                  El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{editTarifaLabel}</strong>.
                </div>
              )}

              {remision.consumos.length === 0 ? (
                <div style={{ ...styles.emptySection, marginTop: '0.5rem' }}>No hay consumos</div>
              ) : (
                <div style={styles.consumosTableWrap}>
                  <table style={styles.consumosTable}>
                    <thead>
                      <tr>
                        {['Cant.', 'Producto', 'Valor Unit.', 'Valor', ''].map((h, i) => (
                          <th key={i} style={styles.consumosTh}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editConsumosStaged.map(it => (
                        <tr
                          key={it.localId}
                          style={{ cursor: puedeEditarTecnicosConsumos ? 'pointer' : 'default' }}
                          onClick={() => { if (puedeEditarTecnicosConsumos) setSelectedStagedItem(it); }}
                        >
                          <td style={styles.consumosTd}>{it.cantidad}</td>
                          <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.productoLabel}>{it.productoLabel}</td>
                          <td style={styles.consumosTd}>{formatMoney(Number(it.valorUnitario) || 0)}</td>
                          <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{formatMoney(Number(it.valor) || 0)}</td>
                          <td style={styles.consumosTd} onClick={e => e.stopPropagation()}>
                            {puedeEditarTecnicosConsumos && (
                              <button
                                type="button"
                                style={styles.rowDeleteBtn}
                                title="Eliminar"
                                disabled={removeConsumoMutation.isPending}
                                onClick={() => {
                                  if (remision.consumos.length <= 1) { setConsumoApiError('Debe haber al menos un consumo.'); return; }
                                  removeConsumoMutation.mutate(it.localId);
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {puedeEditarTecnicosConsumos && (
                <>
                  <button
                    type="button"
                    className="btn-press header-btn-primary"
                    disabled={!editTarifaId}
                    style={{ ...styles.pillBtnPrimary, marginTop: '0.75rem', justifyContent: 'center' as const, ...(!editTarifaId ? styles.pickBtnDisabled : {}) }}
                    onClick={() => setShowAddConsumoModal(true)}
                  >
                    <Plus size={14} /> Agregar consumos
                  </button>
                  {!editTarifaId && (
                    <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginTop: '0.3rem' }}>Debes tener seleccionada una tarifa para agregar consumos</span>
                  )}
                </>
              )}
              {consumoApiError && <span style={{ ...styles.errorText, display: 'block', marginTop: '0.3rem' }}>{consumoApiError}</span>}
              {editError?.field === 'consumos' && <span style={{ ...styles.errorText, display: 'block', marginTop: '0.3rem' }}>{editError.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Subtotal</label>
              <span style={styles.readOnlyField}>{formatMoney(editSubtotal)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>¿Tiene Descuento?</label>
              <div style={styles.pickBtnGrid}>
                <button
                  type="button"
                  className="pick-btn-focus"
                  disabled={editSubtotal <= 0}
                  style={{ ...styles.pickBtn, ...(!editForm.tieneDcto ? styles.pickBtnActive : {}), ...(editSubtotal <= 0 ? styles.pickBtnDisabled : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { setEditForm({ ...editForm, tieneDcto: false }); e.currentTarget.blur(); }}
                >
                  No
                </button>
                <button
                  type="button"
                  className="pick-btn-focus"
                  disabled={editSubtotal <= 0}
                  style={{ ...styles.pickBtn, ...(editForm.tieneDcto ? styles.pickBtnActive : {}), ...(editSubtotal <= 0 ? styles.pickBtnDisabled : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { setEditForm({ ...editForm, tieneDcto: true }); e.currentTarget.blur(); }}
                >
                  Sí
                </button>
              </div>
              {editSubtotal <= 0 && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Agrega consumos con un valor mayor a $0.00 para poder elegir.</span>}
            </div>

            {editForm.tieneDcto && (
              <>
                <div style={styles.formGroup} id="remision-edit-field-porcentajeDcto">
                  <label style={styles.remisionLabel}>Porcentaje de descuento</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    style={{ ...styles.input, ...(editError?.field === 'porcentajeDcto' ? styles.inputError : {}) }}
                    value={editForm.porcentajeDcto}
                    onChange={e => { setEditForm({ ...editForm, porcentajeDcto: e.target.value }); setEditError(null); }}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Valor de descuento ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ ...styles.input, ...(editError?.field === 'porcentajeDcto' ? styles.inputError : {}) }}
                    value={editForm.vrDctoPesos}
                    onChange={e => { setEditForm({ ...editForm, vrDctoPesos: e.target.value }); setEditError(null); }}
                  />
                </div>

                {editError?.field === 'porcentajeDcto' && <span style={styles.errorText}>{editError.message}</span>}

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Total descuento</label>
                  <span style={styles.readOnlyField}>{formatMoney(editDescuentos)}</span>
                </div>
              </>
            )}

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Total Antes Impuestos</label>
              <span style={styles.readOnlyField}>{formatMoney(editTotalAntesImp)}</span>
            </div>

            <div style={styles.formGroup} id="remision-edit-field-impuestos">
              <label style={styles.remisionLabel}>Impuestos *</label>
              <div style={styles.pickBtnGrid}>
                <button
                  type="button"
                  className="pick-btn-focus"
                  style={{ ...styles.pickBtn, ...(!editForm.impuestos ? styles.pickBtnActive : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setEditForm({ ...editForm, impuestos: '' })}
                >
                  Ninguno
                </button>
                {IMPUESTOS_REMISION.map(t => (
                  <button
                    key={t}
                    type="button"
                    className="pick-btn-focus"
                    style={{ ...styles.pickBtn, ...(editForm.impuestos === t ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setEditForm({ ...editForm, impuestos: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>I.V.A.</label>
              <span style={styles.readOnlyField}>{formatMoney(editIva)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Retención</label>
              <span style={styles.readOnlyField}>{formatMoney(editRetencion)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Total</label>
              <span style={{ ...styles.readOnlyField, fontWeight: 700 }}>{formatMoney(editTotalPagar)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Saldo</label>
              <span style={styles.readOnlyField}>{formatMoney(remision.saldo)}</span>
            </div>
          </div>

          <div style={styles.editModalFooter}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button
              style={styles.saveBtn}
              onClick={handleGuardarEdit}
              disabled={updateRemisionMutation.isPending}
            >
              {updateRemisionMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {editPaquetePanelOpen && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={{ ...styles.editModalContent, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={closeEditPaquetePanel}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Importar por paquete</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Paquete</label>
                {editPaqueteLabel ? (
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600, borderRadius: '10px', alignItems: 'flex-start' as const }}>
                    {editPaqueteLabel}
                    <X size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => { setEditPaqueteId(''); setEditPaqueteLabel(''); }} />
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      autoFocus
                      style={{ ...styles.input, width: '100%' }}
                      placeholder="Buscar paquete..."
                      value={editPaqueteSearch}
                      onChange={e => setEditPaqueteSearch(e.target.value)}
                    />
                    <div style={{ ...styles.medicoDropdown, position: 'static' as const, marginTop: '0.35rem', maxHeight: '220px' }}>
                      {editPaqueteOptionsFiltrados.length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        editPaqueteOptionsFiltrados.map((p, i) => (
                          <div
                            key={p.id}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === editPaqueteHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setEditPaqueteHighlighted(i)}
                            onClick={() => { setEditPaqueteId(p.id); setEditPaqueteLabel(p.nombre ?? ''); setEditPaqueteSearch(''); }}
                          >
                            {p.nombre}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Nivel</label>
                <div style={{ position: 'relative' as const }}>
                  <button
                    type="button"
                    style={{ ...styles.input, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', cursor: 'pointer', color: editPaqueteNivel ? '#333' : '#9ca3af' }}
                    onClick={() => setEditPaqueteNivelOpen(!editPaqueteNivelOpen)}
                  >
                    {editPaqueteNivel || 'Selecciona el nivel'}
                    <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0, transform: editPaqueteNivelOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                  </button>
                  {editPaqueteNivelOpen && (
                    <div className="dropdown-anim" style={{ ...styles.medicoDropdown, transformOrigin: 'top' }}>
                      {REMISION_NIVEL_OPTIONS.map(n => (
                        <div
                          key={n}
                          className="dropdown-item-hover"
                          style={{ ...styles.medicoDropdownItem, ...(n === editPaqueteNivel ? { backgroundColor: '#e9f2d8' } : {}) }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setEditPaqueteNivel(n); setEditPaqueteNivelOpen(false); }}
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.editModalFooter}>
              <button style={styles.cancelBtn} onClick={closeEditPaquetePanel}>Cerrar</button>
              <button
                style={styles.saveBtn}
                disabled={!editPaqueteId || !editPaqueteNivel || importandoEditPaquete}
                onClick={handleImportarEditPaquete}
              >
                {importandoEditPaquete ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddConsumoModal && (
        <AddStagedItemForm
          tarifaId={editTarifaId}
          tarifaLabel={editTarifaLabel}
          items={editConsumosStaged}
          searchProductos={searchEditProductosConPrecio}
          onSelectItem={setSelectedStagedItem}
          onAdd={item => {
            addConsumoMutation.mutate({
              productoId: item.productoId,
              cantidad: Number(item.cantidad),
              valorUnitario: Number(item.valorUnitario),
              observaciones: item.observaciones || undefined,
            });
          }}
          onDone={() => setShowAddConsumoModal(false)}
        />
      )}

      {selectedStagedItem && (
        <StagedItemDetailModal
          item={selectedStagedItem}
          tarifaId={editTarifaId}
          searchProductos={searchEditProductosConPrecio}
          onClose={() => setSelectedStagedItem(null)}
          onSave={updated => {
            updateConsumoMutation.mutate({
              consumoId: updated.localId,
              payload: {
                cantidad: Number(updated.cantidad),
                valorUnitario: Number(updated.valorUnitario),
                observaciones: updated.observaciones || undefined,
              },
            });
            setSelectedStagedItem(null);
          }}
          onDelete={() => {
            if (remision.consumos.length <= 1) { setConsumoApiError('Debe haber al menos un consumo.'); setSelectedStagedItem(null); return; }
            removeConsumoMutation.mutate(selectedStagedItem.localId);
            setSelectedStagedItem(null);
          }}
        />
      )}

      {editImportNotaQueue.length > 0 && (
        <div
          key={editImportNotaQueue[0]}
          style={{
            position: 'fixed' as const,
            top: '76px',
            left: '50%',
            zIndex: 10100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.65rem 0.9rem',
            backgroundColor: '#6b8c1f',
            borderLeft: '5px solid #3f6510',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(107,140,31,0.35), 0 2px 8px rgba(0,0,0,0.1)',
            maxWidth: '90vw',
            animation: 'toast-slide-in 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{editImportNotaQueue[0]}</span>
          <X
            size={17}
            style={{ cursor: 'pointer', color: '#fff', flexShrink: 0 }}
            onClick={() => setEditImportNotaQueue(prev => prev.slice(1))}
          />
        </div>
      )}
    </>
  );
}
