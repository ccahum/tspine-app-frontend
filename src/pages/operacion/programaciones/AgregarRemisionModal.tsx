import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Plus, FileText, Trash2, ChevronDown, AlertCircle } from 'lucide-react';
import SignaturePad from '../../../components/SignaturePad';
import { cotizacionesService, type PaqueteOption } from '../../../services/cotizaciones.service';
import { AddStagedItemForm, StagedItemDetailModal, type StagedItem } from '../cotizaciones/CotizacionesPage';
import { focusNextInEnterNavRoot } from '../../../lib/keyboardNav.utils';
import type { ProgramacionDetail } from '../../../services/programaciones.service';
import {
  remisionesService,
  IMPUESTOS_REMISION,
  type CubrimientoOption,
  type TecnicoOption,
  type CreateDetConsumoPayload,
} from '../../../services/remisiones.service';
import { styles, formatMoney } from './ProgramacionDetailPage';

// ID de Tarifa/Cubrimiento "Hospitales" (ver prisma/seed-catalogos.ts) — usado para autoseleccionar
// el Tercero del Hospital de la programación como Responsable Económico en Agregar Remisión.
const HOSPITALES_CUBRIMIENTO_ID = 'Zd5c45';

// Misma tabla de Cubrimiento que usa Cotizaciones (CotizacionesPage.tsx) — clasificación de Tercero
// que se debe buscar para el Responsable Económico según el cubrimiento elegido en Agregar Remisión.
const CUBRIMIENTO_TO_CLASIFICACION: Record<string, string> = {
  '1A15': 'PARTICULAR',
  [HOSPITALES_CUBRIMIENTO_ID]: 'HOSPITAL',
  '1A17': 'DISTRIBUIDOR',
  '1A18': 'ASEGURADORA',
};

const REMISION_NIVEL_OPTIONS = ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 'Nivel 5', 'Nivel 6'];

// Quita acentos y pasa a minúsculas — para filtrar el catálogo de paquetes (ya cargado completo en
// el cliente) sin importar mayúsculas/minúsculas ni acentos.
const normalizeSearch = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface AgregarRemisionModalProps {
  programacion: ProgramacionDetail;
  programacionId: string;
  onClose: () => void;
  onCreated: (createdId: string) => void;
}

// Extraído de ProgramacionDetailPage como componente propio: todo el estado de este formulario
// (typing, selección de campos, navegación con teclado) vivía antes en el mismo componente gigante
// de la página de detalle (134 useState en un solo archivo), así que cada tecla re-renderizaba toda
// la página (todas las pestañas) además del modal. Al vivir en su propio componente, escribir aquí
// solo re-renderiza este modal.
export default function AgregarRemisionModal({ programacion, programacionId, onClose, onCreated }: AgregarRemisionModalProps) {
  const queryClient = useQueryClient();

  const usuarioActual = (() => {
    try {
      return JSON.parse(localStorage.getItem('usuario') ?? '{}');
    } catch {
      return {};
    }
  })();

  const [remisionForm, setRemisionForm] = useState({
    paciente: '',
    cirugiaRealizada: '',
    anestesiologo: '',
    impuestos: '',
    tieneDcto: false,
    porcentajeDcto: '',
    vrDctoPesos: '',
    firma: null as string | null,
  });
  const [remisionCubrimiento, setRemisionCubrimiento] = useState<CubrimientoOption | null>(null);
  const [remisionEmpresa, setRemisionEmpresa] = useState<TecnicoOption | null>(null);
  const [remisionResponsable, setRemisionResponsable] = useState<TecnicoOption | null>(null);
  const [responsableSearch, setResponsableSearch] = useState('');
  const [responsableHighlighted, setResponsableHighlighted] = useState(0);
  const responsableOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [anestesiologoSearch, setAnestesiologoSearch] = useState('');
  const [anestesiologoFocused, setAnestesiologoFocused] = useState(false);
  const [anestesiologoHighlighted, setAnestesiologoHighlighted] = useState(0);
  const anestesiologoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const anestesiologoInputRef = useRef<HTMLInputElement>(null);
  const responsableInputRef = useRef<HTMLInputElement>(null);
  const [remisionError, setRemisionError] = useState<{ field: string; message: string } | null>(null);

  // Técnicos asociados (Rem_Tecnicos) armados en memoria mientras se llena "Agregar remisión" — se
  // guardan de una sola vez (tecnicos/bulk) recién creada la remisión, mismo patrón que Consumos.
  const [remisionTecnicos, setRemisionTecnicos] = useState<TecnicoOption[]>([]);
  const [remisionTecnicoSearch, setRemisionTecnicoSearch] = useState('');
  const [remisionTecnicoFocused, setRemisionTecnicoFocused] = useState(false);
  const [remisionTecnicoHighlighted, setRemisionTecnicoHighlighted] = useState(0);
  const remisionTecnicoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Consumos (Det_Consumo) armados en memoria mientras se llena "Agregar remisión" — se guardan
  // de una sola vez (consumos/bulk) recién creada la remisión, igual que Cotizaciones con sus
  // StagedItem/items-bulk.
  const [remisionConsumos, setRemisionConsumos] = useState<StagedItem[]>([]);
  const [showRemisionAddConsumoModal, setShowRemisionAddConsumoModal] = useState(false);
  const [selectedRemisionStagedItem, setSelectedRemisionStagedItem] = useState<StagedItem | null>(null);
  // Notas de las importaciones (por paquete / de cotizaciones asociadas) — se muestran arriba del
  // recuadro de Consumos, una a la vez, y el usuario las cierra con "Aceptar" (no se autodesaparecen
  // ni se pisan entre sí). Si dos imports dejan nota casi al mismo tiempo, la segunda espera en la
  // cola hasta que se cierre la primera.
  const [remisionImportNotaQueue, setRemisionImportNotaQueue] = useState<string[]>([]);
  const pushRemisionImportNota = (msg: string) => setRemisionImportNotaQueue(prev => [...prev, msg]);
  // Autodesaparece a los 5.5s (además de la X manual) — el mismo mensaje visible se identifica
  // por su texto, así que el timer solo se reinicia cuando de verdad cambia lo que se muestra.
  const remisionImportNotaActual = remisionImportNotaQueue[0];
  useEffect(() => {
    if (!remisionImportNotaActual) return;
    const timer = setTimeout(() => setRemisionImportNotaQueue(prev => prev.slice(1)), 5500);
    return () => clearTimeout(timer);
  }, [remisionImportNotaActual]);

  const [remisionPaquetePanelOpen, setRemisionPaquetePanelOpen] = useState(false);
  const [remisionPaqueteId, setRemisionPaqueteId] = useState('');
  const [remisionPaqueteLabel, setRemisionPaqueteLabel] = useState('');
  const [remisionPaqueteSearch, setRemisionPaqueteSearch] = useState('');
  const [remisionPaqueteHighlighted, setRemisionPaqueteHighlighted] = useState(0);
  const [remisionPaqueteNivel, setRemisionPaqueteNivel] = useState('');
  const [remisionPaqueteNivelOpen, setRemisionPaqueteNivelOpen] = useState(false);
  const [importandoRemisionPaquete, setImportandoRemisionPaquete] = useState(false);
  const [importandoRemisionCotizaciones, setImportandoRemisionCotizaciones] = useState(false);

  const searchRemisionProductosConPrecio = (search: string, tarifaId?: string) =>
    cotizacionesService.searchProductos(search, undefined, tarifaId, programacion.hospital?.tercero?.id);

  const { data: cubrimientosRemision = [] } = useQuery<CubrimientoOption[]>({
    queryKey: ['cubrimientos'],
    queryFn: () => remisionesService.findCubrimientos(),
  });

  const { data: responsableResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['comisiones-tecnicos', responsableSearch, remisionCubrimiento?.id],
    queryFn: () => remisionesService.searchTecnicos(responsableSearch, remisionCubrimiento ? CUBRIMIENTO_TO_CLASIFICACION[remisionCubrimiento.id] : undefined),
    enabled: !!remisionCubrimiento,
  });
  useEffect(() => { setResponsableHighlighted(0); }, [responsableResults.length, responsableSearch]);
  useEffect(() => { responsableOptionRefs.current[responsableHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [responsableHighlighted]);

  const { data: empresaResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['empresas'],
    queryFn: () => remisionesService.searchEmpresas(),
    enabled: !!remisionCubrimiento,
    // Yucamark no debe poder elegirse como Empresa en una remisión (mismo criterio que Cotizaciones).
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
  // cubrimiento general seleccionado — misma lógica que Nueva/Editar Cotización.
  const { data: remisionTerceroTarifa, isLoading: remisionTarifaLoading } = useQuery({
    queryKey: ['remision-tercero-tarifa', remisionResponsable?.id],
    queryFn: () => remisionesService.getTerceroTarifa(remisionResponsable!.id),
    enabled: !!remisionResponsable?.id,
  });
  const remisionTarifaId = remisionResponsable?.id && remisionTarifaLoading
    ? undefined
    : (remisionTerceroTarifa?.tarifaId || remisionCubrimiento?.id);
  const remisionTarifaLabel = remisionTerceroTarifa?.tarifaNombre || remisionCubrimiento?.nombre || '';

  const selectRemisionCubrimiento = (c: CubrimientoOption) => {
    setRemisionCubrimiento(c);
    setRemisionResponsable(c.id === HOSPITALES_CUBRIMIENTO_ID && programacion.hospital?.tercero ? programacion.hospital.tercero : null);
    setRemisionError(null);
  };

  // Compartida entre el clic y el Enter sobre Cubrimiento — ambos deben avanzar a Empresa
  // autoseleccionando su primera opción disponible, no solo Enter. Hace su propio fetch (en vez
  // de usar empresaResults, que puede no haberse refrescado todavía para el cubrimiento recién
  // elegido) — mismo criterio que avanzarAEmpresa en Cotizaciones.
  const avanzarARemisionEmpresa = () => {
    remisionesService.searchEmpresas().then(results => {
      const primera = results.find(t => !t.nombreCompleto?.toLowerCase().includes('yucamark'));
      if (primera) setRemisionEmpresa(primera);
      setTimeout(() => {
        document.querySelector<HTMLButtonElement>('#remision-field-empresa button:not([disabled])')?.focus();
      }, 0);
    });
  };

  // Compartida entre el clic y el Enter sobre ¿Tiene Descuento? — si es Sí, salta al campo
  // Porcentaje de descuento; si es No, salta directo a Impuestos.
  const avanzarDesdeRemisionTieneDcto = (valor?: boolean) => {
    const tieneDcto = valor !== undefined ? valor : remisionForm.tieneDcto;
    setTimeout(() => {
      if (tieneDcto) {
        document.querySelector<HTMLInputElement>('#remision-field-porcentajeDcto input')?.focus();
      } else {
        document.querySelector<HTMLButtonElement>('#remision-field-impuestos button:not([disabled])')?.focus();
      }
    }, 0);
  };

  // Compartida entre el clic y el Enter sobre Empresa — si Responsable Económico ya quedó
  // autocompletado (Hospitales), se salta directo a Anestesiólogo; si no, foco al buscador de
  // Responsable Económico. Mismo criterio que el onConfirm de Empresa en Cotizaciones.
  const avanzarARemisionResponsableOAnestesiologo = () => {
    setTimeout(() => {
      if (remisionResponsable) {
        document.querySelector<HTMLInputElement>('#remision-field-anestesiologo input')?.focus();
      } else {
        document.querySelector<HTMLInputElement>('#remision-field-responsable input')?.focus();
      }
    }, 0);
  };

  // Compartida entre el clic y el Enter sobre Impuestos — Firma es un canvas (SignaturePad), no un
  // input/button enfocable, así que en vez de .focus() se hace scroll hasta ese campo.
  const avanzarARemisionFirma = () => {
    setTimeout(() => {
      document.getElementById('remision-field-firma')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const closeRemisionPaquetePanel = () => {
    setRemisionPaquetePanelOpen(false);
    setRemisionPaqueteId('');
    setRemisionPaqueteLabel('');
    setRemisionPaqueteSearch('');
    setRemisionPaqueteNivel('');
    setRemisionPaqueteNivelOpen(false);
  };

  const { data: remisionPaqueteOptions = [] } = useQuery<PaqueteOption[]>({
    queryKey: ['remision-paquetes'],
    queryFn: () => cotizacionesService.getPaquetes(),
    enabled: remisionPaquetePanelOpen,
  });
  const remisionPaqueteOptionsFiltrados = remisionPaqueteSearch.trim()
    ? remisionPaqueteOptions.filter(p => p.nombre && normalizeSearch(p.nombre).includes(normalizeSearch(remisionPaqueteSearch.trim())))
    : remisionPaqueteOptions;

  const { data: remisionTecnicoResults = [] } = useQuery<TecnicoOption[]>({
    queryKey: ['remision-tecnicos-comisionistas', remisionTecnicoSearch],
    queryFn: () => remisionesService.searchTecnicosComisionistas(remisionTecnicoSearch),
    enabled: remisionTecnicoFocused,
  });
  useEffect(() => { setRemisionTecnicoHighlighted(0); }, [remisionTecnicoResults.length, remisionTecnicoSearch]);
  useEffect(() => { remisionTecnicoOptionRefs.current[remisionTecnicoHighlighted]?.scrollIntoView({ block: 'nearest' }); }, [remisionTecnicoHighlighted]);

  // Compartida por los 3 puntos donde se pueden agregar consumos a una remisión (Agregar consumo,
  // Importar por paquete, Importar de cotizaciones asociadas): si el producto ya está en la lista,
  // no se duplica la fila — se le suma la cantidad nueva (con el valor unitario que ya tenía esa
  // fila), igual que ya hace AddStagedItemForm/onAdd al agregar manualmente un producto repetido.
  const mergeConsumosSinDuplicar = (
    existentes: StagedItem[],
    nuevos: { productoId: string; productoLabel: string; cantidad: number; valorUnitario: number; observaciones?: string }[],
  ): { merged: StagedItem[]; agregados: number; actualizados: number } => {
    const merged = [...existentes];
    let agregados = 0;
    let actualizados = 0;
    for (const it of nuevos) {
      const idx = merged.findIndex(x => x.productoId === it.productoId);
      if (idx === -1) {
        merged.push({
          localId: crypto.randomUUID(),
          productoId: it.productoId,
          productoLabel: it.productoLabel,
          cantidad: String(it.cantidad),
          valorUnitario: String(it.valorUnitario),
          valor: String(it.cantidad * it.valorUnitario),
          observaciones: it.observaciones ?? '',
        });
        agregados++;
      } else {
        const existente = merged[idx];
        const nuevaCantidad = String((Number(existente.cantidad) || 0) + (Number(it.cantidad) || 0));
        merged[idx] = {
          ...existente,
          cantidad: nuevaCantidad,
          valor: String((Number(nuevaCantidad) || 0) * (Number(existente.valorUnitario) || 0)),
          observaciones: it.observaciones || existente.observaciones,
        };
        actualizados++;
      }
    }
    return { merged, agregados, actualizados };
  };

  const handleImportarRemisionPaquete = async () => {
    if (!remisionPaqueteId || !remisionPaqueteNivel || importandoRemisionPaquete) return;
    setImportandoRemisionPaquete(true);
    try {
      const { items, excluidosPorDenegado } = await cotizacionesService.getPaqueteConsumos(remisionPaqueteId, remisionPaqueteNivel, remisionTarifaId);
      const { merged, agregados, actualizados } = mergeConsumosSinDuplicar(remisionConsumos, items.map(p => ({
        productoId: p.id,
        productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
        cantidad: p.cantidad,
        valorUnitario: p.precioSugerido ?? 0,
      })));
      setRemisionConsumos(merged);
      const partes: string[] = [];
      if (agregados > 0) partes.push(`se agregaron ${agregados} producto${agregados === 1 ? '' : 's'}`);
      if (actualizados > 0) partes.push(`se sumó la cantidad de ${actualizados} que ya estaba${actualizados === 1 ? '' : 'n'} agregado${actualizados === 1 ? '' : 's'}`);
      if (excluidosPorDenegado > 0) partes.push(`se omitieron ${excluidosPorDenegado} denegado${excluidosPorDenegado === 1 ? '' : 's'} para la tarifa actual`);
      if (partes.length > 0) pushRemisionImportNota(partes.join(', ').replace(/^./, c => c.toUpperCase()) + '.');
      closeRemisionPaquetePanel();
    } finally {
      setImportandoRemisionPaquete(false);
    }
  };

  const handleImportarRemisionConsumosCotizaciones = async () => {
    const cotizaciones = programacion.cotizaciones ?? [];
    if (cotizaciones.length === 0 || importandoRemisionCotizaciones) return;
    setImportandoRemisionCotizaciones(true);
    try {
      const detalles = await Promise.all(cotizaciones.map(c => cotizacionesService.getById(c.id)));
      const itemsCotizaciones = detalles.flatMap(d => d.items).filter(it => !!it.productoId);
      if (itemsCotizaciones.length === 0) {
        pushRemisionImportNota('Las cotizaciones asociadas no tienen consumos para importar.');
        return;
      }
      const { merged, agregados, actualizados } = mergeConsumosSinDuplicar(remisionConsumos, itemsCotizaciones.map(it => ({
        productoId: it.productoId!,
        productoLabel: `${it.referencia ?? ''} / ${it.descripcion ?? ''}`.replace(/^ \/ /, ''),
        cantidad: it.cantidad ?? 0,
        valorUnitario: it.valorUnitario ?? 0,
        observaciones: it.observaciones ?? '',
      })));
      setRemisionConsumos(merged);
      const partes: string[] = [];
      if (agregados > 0) partes.push(`se agregaron ${agregados} producto${agregados === 1 ? '' : 's'}`);
      if (actualizados > 0) partes.push(`se sumó la cantidad de ${actualizados} que ya estaba${actualizados === 1 ? '' : 'n'} agregado${actualizados === 1 ? '' : 's'}`);
      if (partes.length > 0) pushRemisionImportNota(partes.join(', ').replace(/^./, c => c.toUpperCase()) + '.');
    } finally {
      setImportandoRemisionCotizaciones(false);
    }
  };

  const createRemisionMutation = useMutation({
    mutationFn: () => remisionesService.createRemision({
      programacionId,
      paciente: remisionForm.paciente,
      cirugiaRealizada: remisionForm.cirugiaRealizada,
      cubrimientoId: remisionCubrimiento!.id,
      tarifaId: remisionTarifaId!,
      empresaId: remisionEmpresa!.id,
      responsableEconomicoId: remisionResponsable!.id,
      anestesiologo: remisionForm.anestesiologo,
      impuestos: remisionForm.impuestos || undefined,
      tieneDcto: remisionForm.tieneDcto,
      porcentajeDcto: remisionForm.tieneDcto && remisionForm.porcentajeDcto ? Number(remisionForm.porcentajeDcto) : undefined,
      vrDctoPesos: remisionForm.tieneDcto && remisionForm.vrDctoPesos ? Number(remisionForm.vrDctoPesos) : undefined,
      firma: remisionForm.firma!,
    }),
    onSuccess: async (created) => {
      if (remisionConsumos.length > 0) {
        const items: CreateDetConsumoPayload[] = remisionConsumos.map(it => ({
          productoId: it.productoId,
          cantidad: Number(it.cantidad),
          valorUnitario: Number(it.valorUnitario),
          observaciones: it.observaciones || undefined,
        }));
        await remisionesService.createDetConsumosBulk(created.id, items);
      }
      if (remisionTecnicos.length > 0) {
        await remisionesService.createRemTecnicosBulk(created.id, remisionTecnicos.map(t => t.id));
      }
      queryClient.invalidateQueries({ queryKey: ['remisiones', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['programacion', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['remisiones-consumos', programacionId] });
      queryClient.invalidateQueries({ queryKey: ['remisiones-tecnicos', programacionId] });
      onClose();
      onCreated(created.id);
    },
  });

  // Preview financiero — misma fórmula que remisiones.repository.service.ts (getById) y que
  // computeTotales de Cotizaciones. Subtotal se calcula en vivo sumando el valor de los consumos
  // armados en memoria (remisionConsumos), igual que Cotizaciones suma sus stagedItems.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const remisionSubtotal = remisionConsumos.reduce((sum, it) => sum + (Number(it.valor) || 0), 0);
  const remisionDescuentos = remisionForm.tieneDcto
    ? remisionSubtotal * (Number(remisionForm.porcentajeDcto || 0) / 100) + Number(remisionForm.vrDctoPesos || 0)
    : 0;
  const remisionTotalAntesImp = round2(remisionSubtotal - remisionDescuentos);
  const remisionIva = round2((remisionForm.impuestos === 'I.V.A.' || remisionForm.impuestos === 'Todos') ? remisionTotalAntesImp * 0.16 : 0);
  const remisionRetencion = round2((remisionForm.impuestos === 'Retención' || remisionForm.impuestos === 'Todos') ? remisionTotalAntesImp * 0.106667 : 0);
  const remisionTotalPagar = round2(remisionTotalAntesImp + remisionIva - remisionRetencion);

  const handleGuardarRemision = () => {
    if (!remisionForm.paciente.trim()) { setRemisionError({ field: 'paciente', message: 'Ingresa el nombre del paciente.' }); return; }
    if (!remisionCubrimiento) { setRemisionError({ field: 'cubrimiento', message: 'Selecciona el cubrimiento.' }); return; }
    if (!remisionTarifaId) { setRemisionError({ field: 'tarifa', message: 'Selecciona la tarifa.' }); return; }
    if (!remisionEmpresa) { setRemisionError({ field: 'empresa', message: 'Selecciona la empresa.' }); return; }
    if (!remisionResponsable) { setRemisionError({ field: 'responsable', message: 'Selecciona el responsable económico.' }); return; }
    if (!remisionForm.anestesiologo.trim()) { setRemisionError({ field: 'anestesiologo', message: 'Ingresa el anestesiólogo.' }); return; }
    if (!remisionForm.cirugiaRealizada.trim()) { setRemisionError({ field: 'cirugiaRealizada', message: 'Ingresa la cirugía realizada.' }); return; }
    if (remisionTecnicos.length === 0) { setRemisionError({ field: 'tecnicos', message: 'Agrega al menos un técnico asociado.' }); return; }
    if (remisionConsumos.length === 0) { setRemisionError({ field: 'consumos', message: 'Agrega al menos un consumo.' }); return; }
    if (remisionForm.tieneDcto && !remisionForm.porcentajeDcto.trim() && !remisionForm.vrDctoPesos.trim()) { setRemisionError({ field: 'porcentajeDcto', message: 'Ingresa el porcentaje y/o el valor del descuento.' }); return; }
    if (!remisionForm.firma) { setRemisionError({ field: 'firma', message: 'La firma es obligatoria.' }); return; }
    setRemisionError(null);
    createRemisionMutation.mutate();
  };

  useEffect(() => {
    if (!remisionError) return;
    document.getElementById(`remision-field-${remisionError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [remisionError]);

  return (
    <>
      <div className="modal-overlay-anim" style={styles.modalOverlay}>
        <div className="modal-content-anim" style={{ ...styles.editModalContent, maxHeight: '80dvh' }} data-enter-nav-root onClick={e => e.stopPropagation()}>
          <div style={styles.editModalHeader}>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
            <h2 style={styles.modalTitle}>Agregar remisión</h2>
          </div>

          <div style={styles.editModalBody}>
            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Programación *</label>
              <span style={styles.readOnlyPill}>{programacion.id}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Sede</label>
              <span style={styles.readOnlyField}>{programacion.sede?.nombre ?? '-'}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Usuario *</label>
              <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>{usuarioActual?.nombreCompleto ?? '-'}</span>
            </div>

            <div style={styles.formGroup} id="remision-field-paciente">
              <label style={styles.remisionLabel}>Paciente *</label>
              <input
                style={{ ...styles.input, ...(remisionError?.field === 'paciente' ? styles.inputError : {}) }}
                value={remisionForm.paciente}
                onChange={e => { setRemisionForm({ ...remisionForm, paciente: e.target.value }); setRemisionError(null); }}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (remisionForm.paciente.trim() && cubrimientosRemision.length > 0) {
                    selectRemisionCubrimiento(cubrimientosRemision[0]);
                    setTimeout(() => {
                      document.querySelector<HTMLButtonElement>('#remision-field-cubrimiento button:not([disabled])')?.focus();
                    }, 0);
                  } else {
                    focusNextInEnterNavRoot(e.currentTarget);
                  }
                }}
              />
              {remisionError?.field === 'paciente' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-cubrimiento">
              <label style={styles.remisionLabel}>Cubrimiento *</label>
              {!remisionForm.paciente.trim() ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Ingresa primero el paciente</span>
              ) : (
                <div
                  style={styles.pickBtnGrid}
                  onKeyDown={e => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const idx = cubrimientosRemision.findIndex(c => c.id === remisionCubrimiento?.id);
                      if (idx < 0) return;
                      const nextIdx = e.key === 'ArrowRight' ? Math.min(idx + 1, cubrimientosRemision.length - 1) : Math.max(idx - 1, 0);
                      if (nextIdx === idx) return;
                      selectRemisionCubrimiento(cubrimientosRemision[nextIdx]);
                      e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')[nextIdx]?.focus();
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
                      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      if (idx >= 0) selectRemisionCubrimiento(cubrimientosRemision[idx]);
                      // La opción ya quedó elegida (por clic o flechas) — Enter confirma y salta a
                      // Empresa, seleccionando de una vez su primera opción disponible.
                      avanzarARemisionEmpresa();
                    }
                  }}
                >
                  {cubrimientosRemision.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="pick-btn-focus"
                      style={{ ...styles.pickBtn, ...(remisionCubrimiento?.id === c.id ? styles.pickBtnActive : {}), ...(remisionError?.field === 'cubrimiento' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { selectRemisionCubrimiento(c); e.currentTarget.blur(); avanzarARemisionEmpresa(); }}
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
              )}
              {remisionError?.field === 'cubrimiento' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-empresa">
              <label style={styles.remisionLabel}>Empresa *</label>
              {!remisionCubrimiento ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero el cubrimiento</span>
              ) : (
                <div
                  style={styles.pickBtnGrid}
                  onKeyDown={e => {
                    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const idx = empresaResults.findIndex(t => t.id === remisionEmpresa?.id);
                      if (idx < 0) return;
                      const nextIdx = e.key === 'ArrowRight' ? Math.min(idx + 1, empresaResults.length - 1) : Math.max(idx - 1, 0);
                      if (nextIdx === idx) return;
                      setRemisionEmpresa(empresaResults[nextIdx]);
                      setRemisionError(null);
                      e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')[nextIdx]?.focus();
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
                      const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      if (idx >= 0) { setRemisionEmpresa(empresaResults[idx]); setRemisionError(null); }
                      avanzarARemisionResponsableOAnestesiologo();
                    }
                  }}
                >
                  {empresaResults.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="pick-btn-focus"
                      style={{ ...styles.pickBtn, ...(remisionEmpresa?.id === t.id ? styles.pickBtnActive : {}), ...(remisionError?.field === 'empresa' ? styles.inputError : {}) }}
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { setRemisionEmpresa(t); setRemisionError(null); e.currentTarget.blur(); avanzarARemisionResponsableOAnestesiologo(); }}
                    >
                      {t.nombreCompleto}
                    </button>
                  ))}
                </div>
              )}
              {remisionError?.field === 'empresa' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-responsable">
              <label style={styles.remisionLabel}>Responsable Económico *</label>
              {remisionResponsable ? (
                <div style={styles.medicoTagsWrap}>
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    {remisionResponsable.nombreCompleto}
                    <X
                      size={12}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setRemisionResponsable(null);
                        setTimeout(() => responsableInputRef.current?.focus(), 0);
                      }}
                    />
                  </span>
                </div>
              ) : !remisionCubrimiento ? (
                <span style={styles.readOnlyField}>Selecciona primero el cubrimiento</span>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    ref={responsableInputRef}
                    style={{ ...styles.input, ...(remisionError?.field === 'responsable' ? styles.inputError : {}) }}
                    placeholder="Buscar tercero..."
                    value={responsableSearch}
                    onChange={e => { setResponsableSearch(e.target.value); setRemisionError(null); }}
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
                        if (t) {
                          setRemisionResponsable(t); setResponsableSearch(''); setRemisionError(null);
                          setTimeout(() => document.querySelector<HTMLInputElement>('#remision-field-anestesiologo input')?.focus(), 0);
                        }
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
                            onClick={() => {
                              setRemisionResponsable(t); setResponsableSearch(''); setRemisionError(null);
                              setTimeout(() => document.querySelector<HTMLInputElement>('#remision-field-anestesiologo input')?.focus(), 0);
                            }}
                          >
                            <Plus size={14} /> {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {remisionError?.field === 'responsable' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-tarifa">
              <label style={styles.remisionLabel}>Tarifa *</label>
              {remisionCubrimiento ? (
                <span style={styles.readOnlyField}>{remisionTarifaLabel || 'Se selecciona automáticamente al seleccionar el cubrimiento'}</span>
              ) : (
                <span style={styles.readOnlyField}>Selecciona primero un cubrimiento</span>
              )}
              {remisionError?.field === 'tarifa' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-anestesiologo">
              <label style={styles.remisionLabel}>Anestesiólogo *</label>
              {!remisionResponsable ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero el responsable económico</span>
              ) : remisionForm.anestesiologo ? (
                <div style={styles.medicoTagsWrap}>
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600 }}>
                    {remisionForm.anestesiologo}
                    <X
                      size={12}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setRemisionForm({ ...remisionForm, anestesiologo: '' });
                        setAnestesiologoSearch('');
                        setTimeout(() => anestesiologoInputRef.current?.focus(), 0);
                      }}
                    />
                  </span>
                </div>
              ) : (
                <div style={{ position: 'relative' as const }}>
                  <input
                    ref={anestesiologoInputRef}
                    style={{ ...styles.input, ...(remisionError?.field === 'anestesiologo' ? styles.inputError : {}) }}
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
                        if (t) { setRemisionForm({ ...remisionForm, anestesiologo: t.nombreCompleto }); setAnestesiologoSearch(''); setRemisionError(null); focusNextInEnterNavRoot(e.currentTarget); }
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
                            onClick={() => { setRemisionForm({ ...remisionForm, anestesiologo: t.nombreCompleto }); setAnestesiologoSearch(''); setRemisionError(null); if (anestesiologoInputRef.current) focusNextInEnterNavRoot(anestesiologoInputRef.current); }}
                          >
                            {t.nombreCompleto}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              {remisionError?.field === 'anestesiologo' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-cirugiaRealizada">
              <label style={styles.remisionLabel}>Cirugía Realizada *</label>
              {!remisionForm.anestesiologo ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Selecciona primero el anestesiólogo</span>
              ) : (
                <input
                  style={{ ...styles.input, ...(remisionError?.field === 'cirugiaRealizada' ? styles.inputError : {}) }}
                  value={remisionForm.cirugiaRealizada}
                  onChange={e => { setRemisionForm({ ...remisionForm, cirugiaRealizada: e.target.value }); setRemisionError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextInEnterNavRoot(e.currentTarget); } }}
                />
              )}
              {remisionError?.field === 'cirugiaRealizada' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-tecnicos">
              <label style={styles.remisionLabel}>Técnicos Asociados *</label>
              {!remisionForm.cirugiaRealizada.trim() ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Ingresa primero la cirugía realizada</span>
              ) : (
                <>
                  {remisionTecnicos.length > 0 && (
                    <div style={styles.medicoTagsWrap}>
                      {remisionTecnicos.map(t => (
                        <span key={t.id} style={styles.editMedicoTag}>
                          {t.nombreCompleto}
                          <X size={12} style={{ cursor: 'pointer' }} onClick={() => setRemisionTecnicos(remisionTecnicos.filter(x => x.id !== t.id))} />
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ position: 'relative' as const }}>
                    <input
                      style={styles.input}
                      placeholder="Buscar técnico..."
                      value={remisionTecnicoSearch}
                      onChange={e => setRemisionTecnicoSearch(e.target.value)}
                      onFocus={() => setRemisionTecnicoFocused(true)}
                      onBlur={() => setTimeout(() => setRemisionTecnicoFocused(false), 150)}
                      onKeyDown={e => {
                        const disponibles = remisionTecnicoResults.filter(t => !remisionTecnicos.some(x => x.id === t.id));
                        if (e.key === 'Tab') setRemisionTecnicoFocused(false);
                        if (e.key === 'ArrowDown' && disponibles.length > 0) {
                          e.preventDefault();
                          setRemisionTecnicoHighlighted(i => Math.min(i + 1, disponibles.length - 1));
                        } else if (e.key === 'ArrowUp' && disponibles.length > 0) {
                          e.preventDefault();
                          setRemisionTecnicoHighlighted(i => Math.max(i - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          const t = disponibles[remisionTecnicoHighlighted];
                          if (t) {
                            // Se agrega y el campo se queda enfocado para poder seguir agregando
                            // más técnicos — solo salta al siguiente campo cuando ya no hay más.
                            setRemisionTecnicos([...remisionTecnicos, t]);
                            setRemisionTecnicoSearch('');
                          } else {
                            focusNextInEnterNavRoot(e.currentTarget);
                          }
                        }
                      }}
                    />
                    {remisionTecnicoFocused && (
                      <div style={styles.medicoDropdown}>
                        {remisionTecnicoResults.filter(t => !remisionTecnicos.some(x => x.id === t.id)).length === 0 ? (
                          <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                        ) : (
                          remisionTecnicoResults.filter(t => !remisionTecnicos.some(x => x.id === t.id)).map((t, i) => (
                            <div
                              key={t.id}
                              ref={el => { remisionTecnicoOptionRefs.current[i] = el; }}
                              className="dropdown-item-hover"
                              style={{ ...styles.medicoDropdownItem, ...(i === remisionTecnicoHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                              onMouseDown={e => e.preventDefault()}
                              onMouseEnter={() => setRemisionTecnicoHighlighted(i)}
                              onClick={() => { setRemisionTecnicos([...remisionTecnicos, t]); setRemisionTecnicoSearch(''); }}
                            >
                              <Plus size={14} /> {t.nombreCompleto}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              {remisionError?.field === 'tecnicos' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup} id="remision-field-consumos">
              <div style={styles.consumoSectionHeader}>
                <label style={styles.remisionLabel}>Consumos *</label>
                <span style={styles.consumoCountBadge}>{remisionConsumos.length}</span>
              </div>

              {remisionTecnicos.length === 0 ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>Agrega primero un técnico asociado</span>
              ) : (
              <>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, alignItems: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-press"
                    style={{ ...styles.addFromCatalogBtn, whiteSpace: 'nowrap' as const, flexShrink: 0, ...((programacion.cotizaciones?.length ?? 0) === 0 || !remisionTarifaId ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}) }}
                    disabled={(programacion.cotizaciones?.length ?? 0) === 0 || !remisionTarifaId || importandoRemisionCotizaciones}
                    title={(programacion.cotizaciones?.length ?? 0) === 0 ? 'No hay cotizaciones relacionadas' : undefined}
                    onClick={handleImportarRemisionConsumosCotizaciones}
                  >
                    <FileText size={12} /> {importandoRemisionCotizaciones ? 'Importando...' : 'Importar de cotizaciones asociadas'}
                  </button>
                  <button
                    type="button"
                    className="btn-press"
                    disabled={!remisionTarifaId}
                    style={{ ...styles.addFromCatalogBtn, whiteSpace: 'nowrap' as const, flexShrink: 0, ...(!remisionTarifaId ? { opacity: 0.5, cursor: 'not-allowed' as const } : {}) }}
                    onClick={() => setRemisionPaquetePanelOpen(true)}
                  >
                    <FileText size={12} /> Importar por paquete
                  </button>
                {remisionConsumos.length > 0 && (
                  <button
                    type="button"
                    style={{ ...styles.rowDeleteBtn, marginLeft: 'auto' }}
                    title="Limpiar consumos"
                    onClick={() => setRemisionConsumos([])}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {remisionConsumos.length > 0 && remisionTarifaLabel && (
                <div style={{ ...styles.tarifaHint, marginTop: '0.5rem', marginBottom: 0 }}>
                  El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{remisionTarifaLabel}</strong>.
                </div>
              )}

              {remisionConsumos.length === 0 ? (
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
                      {remisionConsumos.map(it => (
                        <tr key={it.localId} style={{ cursor: 'pointer' }} onClick={() => setSelectedRemisionStagedItem(it)}>
                          <td style={styles.consumosTd}>{it.cantidad}</td>
                          <td style={{ ...styles.consumosTd, ...styles.consumosTdTruncate }} title={it.productoLabel}>{it.productoLabel}</td>
                          <td style={styles.consumosTd}>{formatMoney(Number(it.valorUnitario) || 0)}</td>
                          <td style={{ ...styles.consumosTd, fontWeight: 700, color: '#3f6510' }}>{formatMoney(Number(it.valor) || 0)}</td>
                          <td style={styles.consumosTd} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              style={styles.rowDeleteBtn}
                              title="Eliminar"
                              onClick={() => setRemisionConsumos(remisionConsumos.filter(x => x.localId !== it.localId))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                type="button"
                className="btn-press header-btn-primary"
                disabled={!remisionTarifaId}
                style={{ ...styles.pillBtnPrimary, marginTop: '0.75rem', justifyContent: 'center' as const, ...(!remisionTarifaId ? styles.pickBtnDisabled : {}) }}
                onClick={() => setShowRemisionAddConsumoModal(true)}
              >
                <Plus size={14} /> Agregar consumos
              </button>
              {!remisionTarifaId && (
                <span style={{ fontSize: '0.78rem', color: '#9ca3af', display: 'block', marginTop: '0.3rem' }}>Debes tener seleccionada una tarifa para agregar consumos</span>
              )}
              </>
              )}
              {remisionError?.field === 'consumos' && <span style={{ ...styles.errorText, display: 'block', marginTop: '0.3rem' }}>{remisionError.message}</span>}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Subtotal</label>
              <span style={styles.readOnlyField}>{formatMoney(remisionSubtotal)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>¿Tiene Descuento? *</label>
              <div
                style={styles.pickBtnGrid}
                onKeyDown={e => {
                  if (remisionSubtotal <= 0) return;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    setRemisionForm({ ...remisionForm, tieneDcto: e.key === 'ArrowRight' });
                    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
                    (e.key === 'ArrowRight' ? buttons[1] : buttons[0])?.focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    avanzarDesdeRemisionTieneDcto();
                  }
                }}
              >
                <button
                  type="button"
                  className="pick-btn-focus"
                  disabled={remisionSubtotal <= 0}
                  style={{ ...styles.pickBtn, ...(!remisionForm.tieneDcto ? styles.pickBtnActive : {}), ...(remisionSubtotal <= 0 ? styles.pickBtnDisabled : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { setRemisionForm({ ...remisionForm, tieneDcto: false }); e.currentTarget.blur(); avanzarDesdeRemisionTieneDcto(false); }}
                >
                  No
                </button>
                <button
                  type="button"
                  className="pick-btn-focus"
                  disabled={remisionSubtotal <= 0}
                  style={{ ...styles.pickBtn, ...(remisionForm.tieneDcto ? styles.pickBtnActive : {}), ...(remisionSubtotal <= 0 ? styles.pickBtnDisabled : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={e => { setRemisionForm({ ...remisionForm, tieneDcto: true }); e.currentTarget.blur(); avanzarDesdeRemisionTieneDcto(true); }}
                >
                  Sí
                </button>
              </div>
              {remisionSubtotal <= 0 && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Agrega consumos con un valor mayor a $0.00 para poder elegir.</span>}
            </div>

            {remisionForm.tieneDcto && (
              <>
                <div style={styles.formGroup} id="remision-field-porcentajeDcto">
                  <label style={styles.remisionLabel}>Porcentaje de descuento *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max="100"
                    style={{ ...styles.input, ...(remisionError?.field === 'porcentajeDcto' ? styles.inputError : {}) }}
                    value={remisionForm.porcentajeDcto}
                    onChange={e => {
                      const val = e.target.value;
                      if (val !== '' && (Number(val) < 1 || Number(val) > 100)) {
                        setRemisionError({ field: 'porcentajeDcto', message: 'El porcentaje debe estar entre 1 y 100.' });
                        return;
                      }
                      if (val !== '') {
                        const nuevoPctMonto = remisionSubtotal * Number(val) / 100;
                        const dctoValorMonto = Number(remisionForm.vrDctoPesos) || 0;
                        if (nuevoPctMonto + dctoValorMonto > remisionSubtotal) {
                          setRemisionError({ field: 'porcentajeDcto', message: 'Los descuentos combinados no pueden exceder el subtotal.' });
                          return;
                        }
                      }
                      setRemisionForm({ ...remisionForm, porcentajeDcto: val });
                      setRemisionError(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextInEnterNavRoot(e.currentTarget); } }}
                  />
                  {remisionError?.field === 'porcentajeDcto' && <span style={styles.errorText}>{remisionError.message}</span>}
                </div>

                <div style={styles.formGroup} id="remision-field-vrDctoPesos">
                  <label style={styles.remisionLabel}>Valor de descuento ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ ...styles.input, ...(remisionError?.field === 'vrDctoPesos' ? styles.inputError : {}) }}
                    value={remisionForm.vrDctoPesos}
                    onChange={e => {
                      const val = e.target.value;
                      const dctoPorcentajeMonto = remisionSubtotal * (Number(remisionForm.porcentajeDcto) || 0) / 100;
                      const maxValor = remisionSubtotal - dctoPorcentajeMonto;
                      if (val !== '' && Number(val) > maxValor) {
                        setRemisionError({ field: 'vrDctoPesos', message: 'El valor de descuento no puede exceder el subtotal disponible.' });
                        return;
                      }
                      setRemisionForm({ ...remisionForm, vrDctoPesos: val });
                      setRemisionError(null);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNextInEnterNavRoot(e.currentTarget); } }}
                  />
                  {remisionError?.field === 'vrDctoPesos' && <span style={styles.errorText}>{remisionError.message}</span>}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.remisionLabel}>Total descuento</label>
                  <span style={styles.readOnlyField}>{formatMoney(remisionDescuentos)}</span>
                </div>
              </>
            )}

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Total Antes Impuestos</label>
              <span style={styles.readOnlyField}>{formatMoney(remisionTotalAntesImp)}</span>
            </div>

            <div style={styles.formGroup} id="remision-field-impuestos">
              <label style={styles.remisionLabel}>Impuestos *</label>
              <div
                style={styles.pickBtnGrid}
                onKeyDown={e => {
                  const opciones = ['', ...IMPUESTOS_REMISION];
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const idx = opciones.indexOf(remisionForm.impuestos);
                    const nextIdx = e.key === 'ArrowRight' ? Math.min(idx + 1, opciones.length - 1) : Math.max(idx - 1, 0);
                    if (nextIdx === idx) return;
                    setRemisionForm({ ...remisionForm, impuestos: opciones[nextIdx] });
                    e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])')[nextIdx]?.focus();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
                    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    if (idx >= 0) avanzarARemisionFirma();
                  }
                }}
              >
                <button
                  type="button"
                  className="pick-btn-focus"
                  style={{ ...styles.pickBtn, ...(!remisionForm.impuestos ? styles.pickBtnActive : {}) }}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setRemisionForm({ ...remisionForm, impuestos: '' }); avanzarARemisionFirma(); }}
                >
                  Ninguno
                </button>
                {IMPUESTOS_REMISION.map(t => (
                  <button
                    key={t}
                    type="button"
                    className="pick-btn-focus"
                    style={{ ...styles.pickBtn, ...(remisionForm.impuestos === t ? styles.pickBtnActive : {}) }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setRemisionForm({ ...remisionForm, impuestos: t }); avanzarARemisionFirma(); }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>I.V.A.</label>
              <span style={styles.readOnlyField}>{formatMoney(remisionIva)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Retención</label>
              <span style={styles.readOnlyField}>{formatMoney(remisionRetencion)}</span>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.remisionLabel}>Total</label>
              <span style={{ ...styles.readOnlyField, fontWeight: 700 }}>{formatMoney(remisionTotalPagar)}</span>
            </div>

            <div style={styles.formGroup} id="remision-field-firma">
              <label style={styles.remisionLabel}>Firma *</label>
              {remisionConsumos.length === 0 ? (
                <span style={{ ...styles.input, color: '#9ca3af', backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center' }}>Agrega primero un consumo</span>
              ) : (
                <SignaturePad
                  value={remisionForm.firma}
                  onChange={dataUrl => { setRemisionForm({ ...remisionForm, firma: dataUrl }); setRemisionError(null); }}
                  error={remisionError?.field === 'firma'}
                />
              )}
              {remisionError?.field === 'firma' && <span style={styles.errorText}>{remisionError.message}</span>}
            </div>
          </div>

          <div style={styles.editModalFooter}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button
              style={styles.saveBtn}
              onClick={handleGuardarRemision}
              disabled={createRemisionMutation.isPending}
            >
              {createRemisionMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {remisionPaquetePanelOpen && (
        <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 10050 }}>
          <div className="modal-content-anim" style={{ ...styles.editModalContent, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div style={styles.editModalHeader}>
              <button style={styles.closeBtn} onClick={closeRemisionPaquetePanel}>
                <X size={18} />
              </button>
              <h2 style={styles.modalTitle}>Importar por paquete</h2>
            </div>

            <div style={styles.editModalBody}>
              <div style={styles.formGroup}>
                <label style={styles.remisionLabel}>Paquete</label>
                {remisionPaqueteLabel ? (
                  <span style={{ ...styles.readOnlyPill, padding: '0.35rem 0.6rem', fontSize: '0.8rem', fontWeight: 600, borderRadius: '10px', alignItems: 'flex-start' as const }}>
                    {remisionPaqueteLabel}
                    <X size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => { setRemisionPaqueteId(''); setRemisionPaqueteLabel(''); }} />
                  </span>
                ) : (
                  <div style={{ position: 'relative' as const }}>
                    <input
                      autoFocus
                      style={{ ...styles.input, width: '100%' }}
                      placeholder="Buscar paquete..."
                      value={remisionPaqueteSearch}
                      onChange={e => setRemisionPaqueteSearch(e.target.value)}
                    />
                    <div style={{ ...styles.medicoDropdown, position: 'static' as const, marginTop: '0.35rem', maxHeight: '220px' }}>
                      {remisionPaqueteOptionsFiltrados.length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        remisionPaqueteOptionsFiltrados.map((p, i) => (
                          <div
                            key={p.id}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === remisionPaqueteHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setRemisionPaqueteHighlighted(i)}
                            onClick={() => { setRemisionPaqueteId(p.id); setRemisionPaqueteLabel(p.nombre ?? ''); setRemisionPaqueteSearch(''); }}
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
                <label style={styles.remisionLabel}>Nivel</label>
                <div style={{ position: 'relative' as const }}>
                  <button
                    type="button"
                    style={{ ...styles.input, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', cursor: 'pointer', color: remisionPaqueteNivel ? '#333' : '#9ca3af' }}
                    onClick={() => setRemisionPaqueteNivelOpen(!remisionPaqueteNivelOpen)}
                  >
                    {remisionPaqueteNivel || 'Selecciona el nivel'}
                    <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0, transform: remisionPaqueteNivelOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
                  </button>
                  {remisionPaqueteNivelOpen && (
                    <div className="dropdown-anim" style={{ ...styles.medicoDropdown, transformOrigin: 'top' }}>
                      {REMISION_NIVEL_OPTIONS.map(n => (
                        <div
                          key={n}
                          className="dropdown-item-hover"
                          style={{ ...styles.medicoDropdownItem, ...(n === remisionPaqueteNivel ? { backgroundColor: '#e9f2d8' } : {}) }}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setRemisionPaqueteNivel(n); setRemisionPaqueteNivelOpen(false); }}
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
              <button style={styles.cancelBtn} onClick={closeRemisionPaquetePanel}>Cerrar</button>
              <button
                style={styles.saveBtn}
                disabled={!remisionPaqueteId || !remisionPaqueteNivel || importandoRemisionPaquete}
                onClick={handleImportarRemisionPaquete}
              >
                {importandoRemisionPaquete ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemisionAddConsumoModal && (
        <AddStagedItemForm
          tarifaId={remisionTarifaId}
          tarifaLabel={remisionTarifaLabel}
          items={remisionConsumos}
          searchProductos={searchRemisionProductosConPrecio}
          onSelectItem={setSelectedRemisionStagedItem}
          onAdd={item => {
            // Misma lógica de Cotizaciones: si el producto ya tenía una fila, se suma la
            // cantidad a la existente en vez de duplicar la fila.
            setRemisionConsumos(prev => {
              const existenteIdx = prev.findIndex(x => x.productoId === item.productoId);
              if (existenteIdx === -1) return [...prev, item];
              const existente = prev[existenteIdx];
              const nuevaCantidad = String((Number(existente.cantidad) || 0) + (Number(item.cantidad) || 0));
              const nuevoValor = String((Number(nuevaCantidad) || 0) * (Number(existente.valorUnitario) || 0));
              const actualizado = { ...existente, cantidad: nuevaCantidad, valor: nuevoValor, observaciones: item.observaciones };
              return prev.map((x, i) => (i === existenteIdx ? actualizado : x));
            });
          }}
          onDone={() => setShowRemisionAddConsumoModal(false)}
        />
      )}

      {selectedRemisionStagedItem && (
        <StagedItemDetailModal
          item={selectedRemisionStagedItem}
          tarifaId={remisionTarifaId}
          searchProductos={searchRemisionProductosConPrecio}
          onClose={() => setSelectedRemisionStagedItem(null)}
          onSave={updated => {
            setRemisionConsumos(prev => prev.map(x => (x.localId === updated.localId ? updated : x)));
            setSelectedRemisionStagedItem(null);
          }}
          onDelete={() => {
            setRemisionConsumos(prev => prev.filter(x => x.localId !== selectedRemisionStagedItem.localId));
            setSelectedRemisionStagedItem(null);
          }}
        />
      )}

      {remisionImportNotaQueue.length > 0 && (
        <div
          key={remisionImportNotaQueue[0]}
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
          <AlertCircle size={19} color="#fff" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{remisionImportNotaQueue[0]}</span>
          <X
            size={17}
            style={{ cursor: 'pointer', color: '#fff', flexShrink: 0 }}
            onClick={() => setRemisionImportNotaQueue(prev => prev.slice(1))}
          />
        </div>
      )}
    </>
  );
}
