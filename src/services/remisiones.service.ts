import { api } from '../lib/axios';

export const ESTADOS_REMISION = ['Definitiva', 'Tramitada', 'Descorche', 'Trazabilidad'] as const;

export const CATEGORIAS_COMISION = ['TÉCNICOS', 'INVERSIONISTAS', 'PLUS'] as const;
export const TIPOS_COMISION = ['Comisión', 'Bono'] as const;
export const SELECCIONE_TIPO_COMISION = ['ACTIVIDAD EMPRESARIAL', 'RESICO'] as const;

export interface TecnicoOption {
  id: string;
  nombreCompleto: string;
}

export interface CreateComisionPayload {
  programacionId: string;
  categoria: string;
  tipo?: string;
  tecnicoId?: string;
  remisionId?: string;
  vrComision: number;
  observaciones?: string;
  agregarIva?: boolean;
  cargarPorcentaje?: number;
  quieresDesglosar?: boolean;
  seleccioneTipo?: string;
}

export interface RemisionItem {
  id: string;
  numRemision: string | null;
  estado: string | null;
  cxc: boolean | null;
  paciente: string | null;
  cirugiaRealizada: string | null;
  porcentajeDcto: number | null;
  vrDctoPesos: number | null;
  tieneFactura: boolean;
  noFactura: string | null;
  estadoFactura: string | null;
  creadoEn: string | null;
  tarifa: { nombre: string } | null;
  subtotal: number;
}

export interface RemisionListItem {
  id: string;
  numRemision: string | null;
  estado: string | null;
  creadoEn: string | null;
  paciente: string | null;
  programacionId: string | null;
  numProgram: string | null;
  fechaQx: string | null;
  horaQx: string | null;
  sede: string | null;
  ciudad: string | null;
  hospital: string | null;
  tarifa: string | null;
  empresa: string | null;
  medicos: string[];
}

export interface RemisionListResponse {
  data: RemisionListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RemisionQuery {
  page?: number;
  limit?: number;
  search?: string;
  estado?: string;
  dateFrom?: string;
  dateTo?: string;
  cxc?: boolean;
}

export interface RemisionCxcStats {
  total: number;
  pendiente: number;
  enviada: number;
}

export interface RemTecnicoItem {
  id: string;
  tecnico: { nombreCompleto: string } | null;
  programacion: { id: string; numProgram: string | null } | null;
  remision: { id: string; numRemision: string | null } | null;
  fechaRegistro: string | null;
  ultimaEdicion: string | null;
  registradoPor: { nombreCompleto: string } | null;
  editadoPor: { nombreCompleto: string } | null;
}

export interface ConsumoItem {
  id: string;
  cantidad: number;
  productoId: string | null;
  productoReferencia: string | null;
  productoNombre: string | null;
  valorUnitario: number;
  valor: number;
}

export interface ConsumoGrupo {
  remisionId: string | null;
  numRemision: string | null;
  items: ConsumoItem[];
}

export interface ConsumoValidacionLote {
  id: string;
  valConsumoId: string;
  lote: string | null;
  cantidad: number;
  sede: string | null;
  ubicacion: string | null;
  registradoPor: string | null;
  marcaTiempo: string | null;
  producto: string | null;
  fecha: string | null;
}

export interface ConsumoProductoValidadoItem {
  id: string;
  cantRemisionada: number;
  cantRealValidada: number;
  referencia: string | null;
  referenciaValidada: string | null;
  productoValidadoDescripcion: string | null;
  numeroOC: string | null;
  sedeConsumo: string | null;
  prodRealConsumido: boolean | null;
  prodDeTspine: boolean | null;
  observacionesAlm: string | null;
  eliminar: boolean;
  lotes: ConsumoValidacionLote[];
}

export interface ConsumoDetalle {
  id: string;
  remisionId: string | null;
  numRemision: string | null;
  numProgram: string | null;
  fechaQx: string | null;
  doctor: string | null;
  hospital: string | null;
  consumo: string | null;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  valorUnitario: number;
  valor: number;
  cantidadUsada: number;
  observaciones: string | null;
  productoValidado: ConsumoProductoValidadoItem[];
}

export interface ValConsumoDetalle {
  id: string;
  remisionId: string | null;
  numRemision: string | null;
  numProgram: string | null;
  fechaQx: string | null;
  doctor: string | null;
  hospital: string | null;
  numeroOC: string | null;
  referencia: string | null;
  proRem: string | null;
  canRem: number;
  valorUnitario: number;
  valor: number;
  cantUsada: number;
  observaciones: string | null;
  sedeConsumo: string | null;
  prodRealConsumido: boolean | null;
  proVal: string | null;
  prodDeTspine: boolean | null;
  canVal: number;
  observacionesAlm: string | null;
  eliminar: boolean;
  lotes: ConsumoValidacionLote[];
}

export interface ProgramacionRealizadaItem {
  id: string;
  folio: string | null;
  provieneDe: string | null;
  tipoDePago: string | null;
  beneficiarioGasto: string | null;
  beneficiarioPago: string | null;
  pagado: number;
  saldo: number;
  statusDeGestion: string | null;
  marcaTiempo: string | null;
  fechaPago: string | null;
  tipo: string | null;
  programadoPor: string | null;
}

export interface EjecucionPagoItem {
  id: string;
  folioRelacionado: string | null;
  registradoPor: string | null;
  fechaYHora: string | null;
  monto: number;
  ejecutado: boolean;
  programacion: string | null;
  fechaDeRegistro: string | null;
  fechaProgramado: string | null;
  fechaDeEjecucion: string | null;
  beneficiarioGasto: string | null;
  beneficiarioPago: string | null;
  formaPago: string | null;
  cuenta: string | null;
  origen: string | null;
  saldo: number | null;
  comprobantePago: string | null;
  tipoDeComprobante: string | null;
  fiscal: boolean | null;
  ivaPorcentaje: number | null;
  ivaRetPorcentaje: number | null;
  anio: number | null;
  mes: string | null;
}

export interface DetTecnicoDetalle {
  id: string;
  nombreContacto: string | null;
  numProgram: string | null;
  programacionId: string | null;
  fechaQx: string | null;
  doctor: string | null;
  hospital: string | null;
  consumo: string | null;
  tipo: string | null;
  vrComision: number;
  pagado: number;
  saldo: number;
  totalFactura: number;
  observaciones: string | null;
  estadoActual: boolean | null;
  programacionRealizada: ProgramacionRealizadaItem[];
  ejecucionPagos: EjecucionPagoItem[];
}

export interface ValidacionConsumoItem {
  id: string;
  cantRemisionada: number;
  cantRealValidada: number;
  referenciaRemisionada: string | null;
  nombreRemisionado: string | null;
  referenciaValidada: string | null;
  nombreValidado: string | null;
}

export interface ValidacionConsumoGrupo {
  remisionId: string | null;
  numRemision: string | null;
  items: ValidacionConsumoItem[];
}

export interface ComisionItem {
  id: string;
  tecnico: string | null;
  monto: number;
}

export interface ComisionGrupo {
  categoria: string;
  items: ComisionItem[];
}

export interface CubrimientoOption {
  id: string;
  nombre: string;
}

export interface TarifaOption {
  id: string;
  nombre: string;
}

export interface DetRequisicionItem {
  id: string;
  loteId: string | null;
  productoId: string | null;
  cantidad: number | null;
  precio: number | null;
  fecha: string | null;
  lote: string | null;
  producto: string | null;
  referencia: string | null;
  descripcion: string | null;
  sistema: string | null;
  categoria: string | null;
  tarifaAsociada: string | null;
}

export interface UpdateDetRequisicionPayload {
  loteId?: string;
  productoId?: string;
  cantidad?: number;
  precio?: number;
}

export interface LoteOption {
  id: string;
  lote: string | null;
}

export interface ProductoOption {
  id: string;
  nombre: string | null;
  referencia: string | null;
  particulares: number | null;
  hospitales: number | null;
  distribuidor: number | null;
  aseguradora: number | null;
  sistema: string | null;
  categoria: string | null;
}

export interface CreateDetRequisicionPayload {
  requisicionId: string;
  loteId?: string;
  productoId?: string;
  tarifaAsociadaId?: string;
  cantidad: number;
  precio: number;
}

export interface CreateRequisicionPayload {
  programacionId: string;
  fecha: string;
  cubrimientoId: string;
  tarifaId: string;
  insumos?: { loteId?: string; productoId?: string; cantidad: number; precio: number }[];
}

export const IMPUESTOS_REMISION = ['I.V.A.', 'Retención', 'Todos'] as const;

export interface CreateRemisionPayload {
  programacionId: string;
  paciente: string;
  cirugiaRealizada: string;
  cubrimientoId: string;
  tarifaId: string;
  empresaId: string;
  responsableEconomicoId: string;
  anestesiologo: string;
  impuestos?: string;
  tieneDcto?: boolean;
  porcentajeDcto?: number;
  vrDctoPesos?: number;
  firma: string;
}

export interface UpdateRemisionPayload {
  usuarioId?: string;
  paciente?: string;
  cirugiaRealizada?: string;
  cubrimientoId?: string;
  tarifaId?: string;
  empresaId?: string;
  responsableEconomicoId?: string;
  anestesiologo?: string;
  impuestos?: string;
  tieneDcto?: boolean;
  porcentajeDcto?: number;
  vrDctoPesos?: number;
}

export interface TecnicoSugeridoItem {
  id: string;
  fechaRegistro: string | null;
  tecnico: string | null;
  registradoPor: string | null;
}

export interface CreateTecnicoSugeridoPayload {
  programacionId: string;
  tecnicoId: string;
}

export interface AlmacenOption {
  id: string;
  nombre: string | null;
}

export interface CreateValConsumoLotePayload {
  valConsumoId: string;
  sedeId: string;
  almacenId: string;
  cantidad: number;
}

export interface RequisicionItem {
  id: string;
  marcaDeTiempo: string | null;
  status: string | null;
  fecha: string | null;
  provieneDeProgramacion: boolean | null;
  folio: string | null;
  validacion: string | null;
  existeProgramacion: boolean | null;
  cubrimientoId: string | null;
  tarifaId: string | null;
  usuario: string | null;
  cubrimiento: string | null;
  tarifa: string | null;
  contacto: string | null;
  sedeOrigen: string | null;
  anio: number | null;
  mes: string | null;
}

export interface UpdateRequisicionPayload {
  fecha?: string;
  cubrimientoId?: string;
  tarifaId?: string;
}

export interface NotaCreditoItem {
  id: string;
  marcaTiempo: string | null;
  fechaRemision: string | null;
  fechaNotaCredito: string | null;
  total: number | null;
  formaDescuento: string | null;
  valor: number | null;
  porcentaje: number | null;
  notas: string | null;
  valorNc: number | null;
  aplicadaPor: { nombreCompleto: string } | null;
  factura: {
    id: string;
    remision: {
      id: string;
      numRemision: string | null;
      programacion: { id: string; numProgram: string | null } | null;
    } | null;
  } | null;
}

export interface GastoRelacionadoItem {
  id: string;
  numGasto: string | null;
  fechaGasto: string | null;
  descripcion: string | null;
  valor: number | null;
  beneficiarioGasto: { nombreCompleto: string } | null;
  tipoGasto: { descripcion: string | null } | null;
}

export interface FuenteRelacionadaItem {
  id: string;
  marcaTiempo: string | null;
  monto: number | null;
  gasto: { id: string; numGasto: string | null; descripcion: string | null } | null;
  registradoPor: { nombreCompleto: string } | null;
  programacion: { id: string; numProgram: string | null } | null;
}

export interface DocumentoProgramacionItem {
  id: string;
  nombre: string | null;
  documento: string | null;
  cargadoEl: string | null;
  cargadoPor: { nombreCompleto: string } | null;
  programacion: { id: string; numProgram: string | null } | null;
  archivoDisponible: boolean;
}

export interface CreateDocumentoProgramacionPayload {
  programacionId: string;
  nombre: string;
  documento: string;
}

export interface RemisionDetailConsumo {
  id: string;
  cantidad: number;
  productoId: string | null;
  productoReferencia: string | null;
  productoNombre: string | null;
  valorUnitario: number;
  valor: number;
  facturado: number;
  porFacturar: number;
}

export interface RemisionDetailTecnico {
  id: string;
  tecnico: { nombreCompleto: string } | null;
  programacion: { id: string; numProgram: string | null } | null;
  remision: { id: string; numRemision: string | null } | null;
  fechaRegistro: string | null;
  ultimaEdicion: string | null;
  registradoPor: { nombreCompleto: string } | null;
  editadoPor: { nombreCompleto: string } | null;
}

export interface BonoComisionItem {
  id: string;
  tecnico: string | null;
  monto: number;
}

export interface BonoComisionGrupo {
  categoria: string;
  items: BonoComisionItem[];
}

export interface RemisionDetailFactura {
  id: string;
  folioFacturacion: string | null;
  fechaCreacion: string | null;
  generadaPor: string | null;
  cliente: string | null;
  total: number;
}

export interface RemisionDetail {
  id: string;
  numRemision: string | null;
  estado: string | null;
  cxc: boolean | null;
  paciente: string | null;
  cirugiaRealizada: string | null;
  anestesiologo: string | null;
  creadoEn: string | null;
  porcentajeDcto: number | null;
  vrDctoPesos: number | null;
  tieneDcto: boolean;
  impuestos: string | null;
  vrFactura: number | null;
  diferencia: number | null;
  tieneFactura: boolean;
  estadoFactura: string | null;
  noFactura: string | null;
  numFactura: string | null;
  fechaFacturacion: string | null;
  facturadoPor: string | null;
  tieneCotizacion: boolean;
  cotizacion: string | null;
  firma: string | null;
  firmaDisponible: boolean;
  status: boolean;
  usuario: { id: string; nombreCompleto: string } | null;
  tarifa: { id: string; nombre: string } | null;
  cubrimiento: { id: string; nombre: string } | null;
  responsableEconomico: { id: string; nombreCompleto: string } | null;
  cliente: { nombreCompleto: string } | null;
  empresa: {
    id: string;
    nombreCompleto: string;
    datosFiscales: {
      rfc: string | null;
      razonSocial: string | null;
      celular: string | null;
      oficina: string | null;
      correo: string | null;
    } | null;
  } | null;
  programacion: {
    id: string;
    numProgram: string | null;
    fechaQx: string | null;
    horaQx: string | null;
    consumo: string | null;
    observaciones: string | null;
    sede: { nombre: string } | null;
    hospital: { nombre: string; ciudadCat: { nombre: string } | null } | null;
    medicos: { medico: { nombreCompleto: string } }[];
    consumoNoValidado: boolean;
  } | null;
  subtotal: number;
  descuentos: number;
  totalAntesImp: number;
  iva: number;
  retencion: number;
  total: number;
  saldo: number;
  consumos: RemisionDetailConsumo[];
  tecnicos: RemisionDetailTecnico[];
  bonosComisiones: BonoComisionGrupo[];
  facturas: RemisionDetailFactura[];
  puedeConvertirFactura: boolean;
}

export const remisionesService = {
  findAll: (query: RemisionQuery): Promise<RemisionListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/operacion/remisiones/buscar', { params }).then(r => r.data);
  },

  getCxcStats: (): Promise<RemisionCxcStats> =>
    api.get('/operacion/remisiones/cxc-stats').then(r => r.data),

  createComision: (payload: CreateComisionPayload) =>
    api.post('/operacion/remisiones/comisiones', payload).then(r => r.data),

  searchTecnicos: (search?: string): Promise<TecnicoOption[]> =>
    api.get('/operacion/remisiones/comisiones-tecnicos', { params: { search } }).then(r => r.data),

  searchEmpresas: (search?: string): Promise<TecnicoOption[]> =>
    api.get('/operacion/remisiones/empresas', { params: { search } }).then(r => r.data),

  getEmpresaSugerida: (cubrimientoId: string, sedeId: string): Promise<TecnicoOption | null> =>
    api.get('/operacion/remisiones/empresa-sugerida', { params: { cubrimientoId, sedeId } }).then(r => r.data),

  searchTecnicosComisionistas: (search?: string): Promise<TecnicoOption[]> =>
    api.get('/operacion/remisiones/tecnicos-comisionistas', { params: { search } }).then(r => r.data),

  findTecnicosSugeridosByProgramacion: (programacionId: string): Promise<TecnicoSugeridoItem[]> =>
    api.get('/operacion/remisiones/tecnicos-sugeridos', { params: { programacionId } }).then(r => r.data),

  createTecnicoSugerido: (payload: CreateTecnicoSugeridoPayload): Promise<{ id: string }> =>
    api.post('/operacion/remisiones/tecnicos-sugeridos', payload).then(r => r.data),

  deleteTecnicoSugerido: (id: string): Promise<void> =>
    api.delete(`/operacion/remisiones/tecnicos-sugeridos/${id}`).then(r => r.data),

  findByProgramacion: (programacionId: string): Promise<RemisionItem[]> =>
    api.get('/operacion/remisiones', { params: { programacionId } }).then(r => r.data),

  findTecnicosByProgramacion: (programacionId: string): Promise<RemTecnicoItem[]> =>
    api.get('/operacion/remisiones/tecnicos', { params: { programacionId } }).then(r => r.data),

  findConsumosByProgramacion: (programacionId: string): Promise<ConsumoGrupo[]> =>
    api.get('/operacion/remisiones/consumos', { params: { programacionId } }).then(r => r.data),

  getConsumoDetalle: (id: string): Promise<ConsumoDetalle | null> =>
    api.get(`/operacion/remisiones/consumos/${id}`).then(r => r.data),

  getValConsumoDetalle: (id: string): Promise<ValConsumoDetalle | null> =>
    api.get(`/operacion/remisiones/producto-validado/${id}`).then(r => r.data),

  findAlmacenes: (sedeId?: string): Promise<AlmacenOption[]> =>
    api.get('/operacion/remisiones/almacenes', { params: { sedeId } }).then(r => r.data),

  createValConsumoLote: (payload: CreateValConsumoLotePayload): Promise<{ id: string }> =>
    api.post('/operacion/remisiones/producto-validado/lotes', payload).then(r => r.data),

  getDetTecnicoDetalle: (id: string): Promise<DetTecnicoDetalle | null> =>
    api.get(`/operacion/remisiones/comisiones/${id}`).then(r => r.data),

  findValidacionConsumosByProgramacion: (programacionId: string): Promise<ValidacionConsumoGrupo[]> =>
    api.get('/operacion/remisiones/validacion-consumos', { params: { programacionId } }).then(r => r.data),

  findComisionesByProgramacion: (programacionId: string): Promise<ComisionGrupo[]> =>
    api.get('/operacion/remisiones/comisiones', { params: { programacionId } }).then(r => r.data),

  findRequisicionesByProgramacion: (programacionId: string): Promise<RequisicionItem[]> =>
    api.get('/operacion/remisiones/requisiciones', { params: { programacionId } }).then(r => r.data),

  getRequisicionDetalle: (id: string): Promise<RequisicionItem | null> =>
    api.get(`/operacion/remisiones/requisiciones/${id}`).then(r => r.data),

  updateRequisicion: (id: string, payload: UpdateRequisicionPayload): Promise<RequisicionItem> =>
    api.patch(`/operacion/remisiones/requisiciones/${id}`, payload).then(r => r.data),

  deleteRequisicion: (id: string): Promise<void> =>
    api.delete(`/operacion/remisiones/requisiciones/${id}`).then(() => undefined),

  createRequisicion: (payload: CreateRequisicionPayload): Promise<{ id: string }> =>
    api.post('/operacion/remisiones/requisiciones', payload).then(r => r.data),

  createRemision: (payload: CreateRemisionPayload): Promise<{ id: string }> =>
    api.post('/operacion/remisiones', payload).then(r => r.data),

  findCubrimientos: (): Promise<CubrimientoOption[]> =>
    api.get('/operacion/remisiones/cubrimientos').then(r => r.data),

  findTarifasByCubrimiento: (cubrimientoId: string): Promise<TarifaOption[]> =>
    api.get('/operacion/remisiones/tarifas', { params: { cubrimientoId } }).then(r => r.data),

  findDetallesByRequisicion: (requisicionId: string): Promise<DetRequisicionItem[]> =>
    api.get(`/operacion/remisiones/requisiciones/${requisicionId}/detalles`).then(r => r.data),

  createDetRequisicion: (payload: CreateDetRequisicionPayload) =>
    api.post('/operacion/remisiones/detalles-requisicion', payload).then(r => r.data),

  updateDetRequisicion: (id: string, payload: UpdateDetRequisicionPayload) =>
    api.patch(`/operacion/remisiones/detalles-requisicion/${id}`, payload).then(r => r.data),

  searchLotes: (search?: string): Promise<LoteOption[]> =>
    api.get('/operacion/remisiones/lotes', { params: { search } }).then(r => r.data),

  searchProductos: (search?: string): Promise<ProductoOption[]> =>
    api.get('/operacion/remisiones/productos', { params: { search } }).then(r => r.data),

  findNotasCreditoByProgramacion: (programacionId: string): Promise<NotaCreditoItem[]> =>
    api.get('/operacion/remisiones/notas-credito', { params: { programacionId } }).then(r => r.data),

  findGastosByProgramacion: (programacionId: string): Promise<GastoRelacionadoItem[]> =>
    api.get('/operacion/remisiones/gastos', { params: { programacionId } }).then(r => r.data),

  findFuentesByProgramacion: (programacionId: string): Promise<FuenteRelacionadaItem[]> =>
    api.get('/operacion/remisiones/fuentes', { params: { programacionId } }).then(r => r.data),

  findDocumentosByProgramacion: (programacionId: string): Promise<DocumentoProgramacionItem[]> =>
    api.get('/operacion/remisiones/documentos', { params: { programacionId } }).then(r => r.data),

  createDocumentoProgramacion: (payload: CreateDocumentoProgramacionPayload): Promise<DocumentoProgramacionItem> =>
    api.post('/operacion/remisiones/documentos', payload).then(r => r.data),

  abrirDocumentoArchivo: async (id: string): Promise<void> => {
    const res = await api.get(`/operacion/remisiones/documentos/${id}/archivo`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  getById: (id: string): Promise<RemisionDetail | null> =>
    api.get(`/operacion/remisiones/${id}`).then(r => r.data),

  fetchFirmaBlob: (id: string): Promise<Blob> =>
    api.get(`/operacion/remisiones/${id}/firma`, { responseType: 'blob' }).then(r => r.data),

  updateEstado: (id: string, estado: string): Promise<{ id: string; estado: string | null }> =>
    api.patch(`/operacion/remisiones/${id}/estado`, { estado }).then(r => r.data),

  convertirEnFactura: (id: string): Promise<{ id: string }> =>
    api.post(`/operacion/remisiones/${id}/convertir-factura`, {}).then(r => r.data),

  updateRemision: (id: string, payload: UpdateRemisionPayload): Promise<RemisionDetail> =>
    api.patch(`/operacion/remisiones/${id}`, payload).then(r => r.data),

  deleteRemision: (id: string): Promise<void> =>
    api.delete(`/operacion/remisiones/${id}`).then(() => undefined),
};
