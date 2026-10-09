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
  // Para el botón "+ Agregar" de la tarjeta Consumos remisionados: abre el modal directo en el
  // picker de productos, sin que el usuario tenga que entrar a Editar Remisión y buscar el botón.
  openAddConsumo?: boolean;
  // Se llama al agregar un consumo desde ese picker suelto (openAddConsumo), para que la página
  // pueda mostrar su propio toast de éxito ("Consumo agregado").
  onConsumoAdded?: () => void;
}

export default function EditarRemisionModal({ remision, remisionId, onClose, onUpdated, openAddConsumo, onConsumoAdded }: EditarRemisionModalProps) {
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

  // Técnicos asociados (Rem_Tecnicos) y Consumos (Det_Consumo) de la remisión completa (modo
  // formulario, no el picker suelto de "+ Agregar"): antes cada alta/edición/baja se persistía de
  // inmediato contra el servidor, así que cerrar/cancelar sin dar "Guardar" no revertía nada — bug
  // reportado por el usuario. Ahora se arman en memoria (como en Agregar Remisión) y se confirman
  // todos juntos al dar Guardar; `remision` (la prop) no cambia durante la sesión del modal en este
  // modo — nada invalida su query hasta el guardado final — así que sirve de "original" estable
  // para calcular qué agregar/actualizar/quitar contra el servidor.
  type LocalTecnico = { id: string; tecnico: { nombreCompleto: string } | null; tecnicoId?: string };
  const [localTecnicos, setLocalTecnicos] = useState<LocalTecnico[]>(() => remision.tecnicos.map(t => ({ id: t.id, tecnico: t.tecnico })));

  const [editTecnicoSearch, setEditTecnicoSearch] = useState('');
  const [editTecnicoFocused, setEditTecnicoFocused] = useState(false);
  const [editTecnicoHighlighted, setEditTecnicoHighlighted] = useState(0);
  const editTecnicoOptionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const agregarTecnicoLocal = (t: TecnicoOption) => {
    setLocalTecnicos(prev => [...prev, { id: `new-${crypto.randomUUID()}`, tecnico: { nombreCompleto: t.nombreCompleto ?? '' }, tecnicoId: t.id }]);
    setTecnicoApiError(null);
  };
  const quitarTecnicoLocal = (id: string) => {
    if (localTecnicos.length <= 1) { setTecnicoApiError('Debe haber al menos un técnico asociado.'); return; }
    setLocalTecnicos(prev => prev.filter(x => x.id !== id));
  };

  // showAddConsumoModal/selectedStagedItem se usan tanto en el picker suelto ("+ Agregar", que
  // sigue guardando de inmediato — no hay un botón "Guardar" en ese modo) como dentro del
  // formulario completo (donde ahora todo queda en `localConsumos` hasta dar Guardar).
  const [showAddConsumoModal, setShowAddConsumoModal] = useState(openAddConsumo ?? false);
  const [selectedStagedItem, setSelectedStagedItem] = useState<StagedItem | null>(null);
  // Lista "en vivo" del servidor — solo la usa el modo picker suelto (openAddConsumo), que sí
  // persiste cada alta de inmediato y por tanto necesita reflejar lo que ya hay en el servidor.
  const editConsumosStaged = remision.consumos.map(consumoToStagedItem);
  // Lista en memoria del formulario completo — se siembra una sola vez al abrir y no se vuelve a
  // sincronizar con el servidor hasta que se guarda.
  const [localConsumos, setLocalConsumos] = useState<StagedItem[]>(() => remision.consumos.map(consumoToStagedItem));

  // Mismo criterio que addDetConsumo en el backend: si el producto ya está en la lista, se suma la
  // cantidad en vez de duplicar la fila — aplicado en memoria porque todavía no se ha guardado.
  const agregarConsumoLocal = (item: StagedItem) => {
    setLocalConsumos(prev => {
      const idx = prev.findIndex(x => x.productoId === item.productoId);
      if (idx === -1) return [...prev, item];
      const existente = prev[idx];
      const nuevaCantidad = (Number(existente.cantidad) || 0) + (Number(item.cantidad) || 0);
      const actualizado: StagedItem = { ...existente, cantidad: String(nuevaCantidad), valor: String(nuevaCantidad * (Number(existente.valorUnitario) || 0)) };
      return prev.map((x, i) => (i === idx ? actualizado : x));
    });
    setConsumoApiError(null);
  };
  const editarConsumoLocal = (updated: StagedItem) => {
    setLocalConsumos(prev => prev.map(x => (x.localId === updated.localId ? updated : x)));
  };
  const quitarConsumoLocal = (localId: string) => {
    if (localConsumos.length <= 1) { setConsumoApiError('Debe haber al menos un consumo.'); return; }
    setLocalConsumos(prev => prev.filter(x => x.localId !== localId));
  };

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
    onSuccess: () => { invalidateRemision(); setConsumoApiError(null); onConsumoAdded?.(); },
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
  // Nueva Cotización para recalcular sus ítems en memoria al cambiar de tarifa, aplicado aquí sobre
  // `localConsumos` (en memoria, no contra el servidor — solo este modo de formulario completo
  // dispara este efecto). Arranca en la tarifa original de la remisión para no disparar una
  // actualización espuria al abrir el modal sin haber cambiado nada.
  const consumosTarifaSyncRef = useRef<string | null>(remision.tarifa?.id ?? null);
  const [actualizandoPreciosTarifa, setActualizandoPreciosTarifa] = useState(false);
  useEffect(() => {
    if (!editTarifaId || editTarifaId === consumosTarifaSyncRef.current) return;
    consumosTarifaSyncRef.current = editTarifaId;
    if (!puedeEditarTecnicosConsumos) return;
    const productoIds = [...new Set(localConsumos.map(c => c.productoId).filter((id): id is string => !!id))];
    if (productoIds.length === 0) return;
    setActualizandoPreciosTarifa(true);
    cotizacionesService.getPreciosPorProductos(productoIds, editTarifaId)
      .then(precios => {
        const precioPorProducto = new Map(precios.map(p => [p.productoId, p.precio]));
        let actualizados = 0;
        setLocalConsumos(prev => prev.map(c => {
          if (!c.productoId) return c;
          const nuevoPrecio = precioPorProducto.get(c.productoId);
          if (nuevoPrecio == null || Number(nuevoPrecio) === Number(c.valorUnitario)) return c;
          actualizados++;
          const cantidad = Number(c.cantidad) || 0;
          return { ...c, valorUnitario: String(nuevoPrecio), valor: String(cantidad * Number(nuevoPrecio)) };
        }));
        if (actualizados > 0) pushEditImportNota(`Se actualizó el precio de ${actualizados} consumo${actualizados === 1 ? '' : 's'} según la nueva tarifa.`);
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
      // Se agrega en memoria (localConsumos), no contra el servidor — este panel solo se abre
      // desde el formulario completo, nunca desde el picker suelto de "+ Agregar".
      items.forEach(p => {
        agregarConsumoLocal({
          localId: crypto.randomUUID(),
          productoId: p.id,
          productoLabel: `${p.referencia ?? ''} / ${p.nombre ?? ''}`.replace(/^ \/ /, ''),
          cantidad: String(p.cantidad),
          valorUnitario: String(p.precioSugerido ?? 0),
          valor: String(p.cantidad * (p.precioSugerido ?? 0)),
          observaciones: '',
        });
      });
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

  // Guardar: confirma de una sola vez todo lo armado en memoria (técnicos, consumos y los campos
  // del formulario) contra el servidor. Si el usuario cierra/cancela antes de llegar aquí, nada de
  // esto se envió — ese era justo el bug reportado.
  const guardarTodoMutation = useMutation({
    mutationFn: async () => {
      const tecnicosAAgregar = localTecnicos.filter(t => t.tecnicoId);
      const tecnicosAQuitar = remision.tecnicos.filter(orig => !localTecnicos.some(lt => lt.id === orig.id));
      const consumosAAgregar = localConsumos.filter(it => !remision.consumos.some(c => c.id === it.localId));
      const consumosAQuitar = remision.consumos.filter(c => !localConsumos.some(it => it.localId === c.id));
      const consumosAActualizar = localConsumos.filter(it => {
        const orig = remision.consumos.find(c => c.id === it.localId);
        return !!orig && (Number(it.cantidad) !== Number(orig.cantidad) || Number(it.valorUnitario) !== Number(orig.valorUnitario));
      });

      await Promise.all([
        ...tecnicosAAgregar.map(t => remisionesService.addRemTecnico(remisionId, t.tecnicoId!)),
        ...tecnicosAQuitar.map(t => remisionesService.removeRemTecnico(t.id)),
        ...consumosAQuitar.map(c => remisionesService.removeDetConsumo(c.id)),
        ...consumosAActualizar.map(it => remisionesService.updateDetConsumo(it.localId, {
          cantidad: Number(it.cantidad),
          valorUnitario: Number(it.valorUnitario),
          observaciones: it.observaciones || undefined,
        })),
        ...consumosAAgregar.map(it => remisionesService.addDetConsumo(remisionId, {
          productoId: it.productoId,
          cantidad: Number(it.cantidad),
          valorUnitario: Number(it.valorUnitario),
          observaciones: it.observaciones || undefined,
        })),
      ]);

      await remisionesService.updateRemision(remisionId, {
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
      });
    },
    onSuccess: () => {
      invalidateRemision();
      onUpdated();
    },
    onError: () => setConsumoApiError('No se pudieron guardar los cambios. Intenta de nuevo.'),
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const editSubtotal = localConsumos.reduce((sum, c) => sum + (Number(c.valor) || 0), 0);
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
    if (localTecnicos.length === 0) { setEditError({ field: 'tecnicos', message: 'Debe haber al menos un técnico asociado.' }); return; }
    if (localConsumos.length === 0) { setEditError({ field: 'consumos', message: 'Debe haber al menos un consumo.' }); return; }
    if (editForm.tieneDcto && !editForm.porcentajeDcto.trim() && !editForm.vrDctoPesos.trim()) { setEditError({ field: 'porcentajeDcto', message: 'Ingresa el porcentaje y/o el valor del descuento.' }); return; }
    if (!editForm.impuestos) { setEditError({ field: 'impuestos', message: 'Selecciona los impuestos.' }); return; }
    setEditError(null);
    guardarTodoMutation.mutate();
  };

  useEffect(() => {
    if (!editError) return;
    document.getElementById(`remision-edit-field-${editError.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editError]);

  return (
    <>
      {/* openAddConsumo (desde el botón "+ Agregar" de Consumos remisionados): se salta este
          formulario completo y abre directo el picker de productos de abajo — este modal no debe
          asomarse detrás. */}
      {!openAddConsumo && (
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
              {localTecnicos.length > 0 && (
                <div style={styles.medicoTagsWrap}>
                  {localTecnicos.map(t => (
                    <span key={t.id} style={styles.editMedicoTag}>
                      {t.tecnico?.nombreCompleto ?? '-'}
                      {puedeEditarTecnicosConsumos && (
                        <X
                          size={12}
                          style={{ cursor: 'pointer' }}
                          onClick={() => quitarTecnicoLocal(t.id)}
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
                      const disponibles = editTecnicoResults.filter(t => !localTecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto));
                      if (e.key === 'ArrowDown' && disponibles.length > 0) {
                        e.preventDefault();
                        setEditTecnicoHighlighted(i => Math.min(i + 1, disponibles.length - 1));
                      } else if (e.key === 'ArrowUp' && disponibles.length > 0) {
                        e.preventDefault();
                        setEditTecnicoHighlighted(i => Math.max(i - 1, 0));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const t = disponibles[editTecnicoHighlighted];
                        if (t) { agregarTecnicoLocal(t); setEditTecnicoSearch(''); }
                      }
                    }}
                  />
                  {editTecnicoFocused && (
                    <div style={styles.medicoDropdown}>
                      {editTecnicoResults.filter(t => !localTecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto)).length === 0 ? (
                        <div style={{ ...styles.medicoDropdownItem, color: '#9ca3af', cursor: 'default' }}>Sin resultados</div>
                      ) : (
                        editTecnicoResults.filter(t => !localTecnicos.some(x => x.tecnico?.nombreCompleto === t.nombreCompleto)).map((t, i) => (
                          <div
                            key={t.id}
                            ref={el => { editTecnicoOptionRefs.current[i] = el; }}
                            className="dropdown-item-hover"
                            style={{ ...styles.medicoDropdownItem, ...(i === editTecnicoHighlighted ? { backgroundColor: '#e9f2d8' } : {}) }}
                            onMouseDown={e => e.preventDefault()}
                            onMouseEnter={() => setEditTecnicoHighlighted(i)}
                            onClick={() => { agregarTecnicoLocal(t); setEditTecnicoSearch(''); }}
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
                <span style={styles.consumoCountBadge}>{localConsumos.length}</span>
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

              {localConsumos.length > 0 && editTarifaLabel && (
                <div style={{ ...styles.tarifaHint, marginTop: '0.5rem', marginBottom: 0 }}>
                  El valor unitario de los consumos es referente a la tarifa <strong style={{ color: '#3f6510' }}>{editTarifaLabel}</strong>.
                </div>
              )}

              {localConsumos.length === 0 ? (
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
                      {localConsumos.map(it => (
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
                                onClick={() => quitarConsumoLocal(it.localId)}
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
              disabled={guardarTodoMutation.isPending}
            >
              {guardarTodoMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
      )}

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
          // openAddConsumo (picker suelto desde "+ Agregar", sin botón Guardar propio): persiste
          // cada alta de inmediato, por eso usa la lista en vivo del servidor. Dentro del
          // formulario completo, todo queda en localConsumos hasta dar Guardar.
          items={openAddConsumo ? editConsumosStaged : localConsumos}
          searchProductos={searchEditProductosConPrecio}
          onSelectItem={setSelectedStagedItem}
          onAdd={item => {
            if (openAddConsumo) {
              addConsumoMutation.mutate({
                productoId: item.productoId,
                cantidad: Number(item.cantidad),
                valorUnitario: Number(item.valorUnitario),
                observaciones: item.observaciones || undefined,
              });
            } else {
              agregarConsumoLocal(item);
            }
          }}
          onDone={() => { setShowAddConsumoModal(false); if (openAddConsumo) onClose(); }}
        />
      )}

      {selectedStagedItem && (
        <StagedItemDetailModal
          item={selectedStagedItem}
          tarifaId={editTarifaId}
          searchProductos={searchEditProductosConPrecio}
          onClose={() => setSelectedStagedItem(null)}
          onSave={updated => {
            if (openAddConsumo) {
              updateConsumoMutation.mutate({
                consumoId: updated.localId,
                payload: {
                  cantidad: Number(updated.cantidad),
                  valorUnitario: Number(updated.valorUnitario),
                  observaciones: updated.observaciones || undefined,
                },
              });
            } else {
              editarConsumoLocal(updated);
            }
            setSelectedStagedItem(null);
          }}
          onDelete={() => {
            const count = openAddConsumo ? remision.consumos.length : localConsumos.length;
            if (count <= 1) { setConsumoApiError('Debe haber al menos un consumo.'); setSelectedStagedItem(null); return; }
            if (openAddConsumo) removeConsumoMutation.mutate(selectedStagedItem.localId);
            else quitarConsumoLocal(selectedStagedItem.localId);
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
