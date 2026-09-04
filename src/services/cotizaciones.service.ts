import { api } from '../lib/axios';

export interface CotizacionListItem {
  id: string;
  numCotizacion: string | null;
  fecha: string | null;
  medico: string | null;
  cirugia: string | null;
  status: string | null;
  usuario: string | null;
  hospital: string | null;
  empresa: string | null;
  sede: string | null;
}

export interface CotizacionItem {
  id: string;
  productoId: string | null;
  referencia: string | null;
  descripcion: string | null;
  sistema: string | null;
  hospital: string | null;
  cantidad: number | null;
  valorUnitario: number | null;
  valor: number | null;
  observaciones: string | null;
}

export interface RemisionAsociada {
  id: string;
  numRemision: string | null;
  estado: string | null;
}

export interface CotizacionDetail extends CotizacionListItem {
  marcaDeTiempo: string | null;
  dirigidoA: string | null;
  hospitalId: string | null;
  empresaId: string | null;
  cubrimientoId: string | null;
  cubrimiento: string | null;
  responsableEconomicoId: string | null;
  responsableEconomico: string | null;
  numProveedor: string | null;
  tarifaId: string | null;
  tarifa: string | null;
  tiempoEntrega: string | null;
  observaciones: string | null;
  tieneDcto: boolean;
  porcentajeDcto: number | null;
  vrDcto: number | null;
  vrDctoPesos: number | null;
  impuestos: string | null;
  nota: string | null;
  imagen: string | null;
  paqueteId: string | null;
  paquete: string | null;
  contadorPaquetes: number | null;
  nivel: string | null;
  items: CotizacionItem[];
  remisionesAsociadas: RemisionAsociada[];
}

export interface TerceroOption {
  id: string;
  nombreCompleto: string;
}

export interface TarifaOption {
  id: string;
  nombre: string;
}

export interface PaqueteOption {
  id: string;
  nombre: string | null;
}

export interface UpdateCotizacionPayload {
  fecha?: string;
  dirigidoA?: string;
  medico?: string;
  hospitalId?: string;
  cirugia?: string;
  cubrimientoId?: string;
  empresaId?: string;
  responsableEconomicoId?: string;
  numProveedor?: string;
  tarifaId?: string;
  tiempoEntrega?: string;
  observaciones?: string;
  paqueteId?: string;
  nivel?: string;
  tieneDcto?: boolean;
  porcentajeDcto?: number;
  vrDcto?: number;
  impuestos?: string;
}

export interface CreateCotizacionPayload {
  fecha: string;
  dirigidoA: string;
  medico?: string;
  hospitalId: string;
  cirugia: string;
  cubrimientoId: string;
  empresaId: string;
  responsableEconomicoId: string;
  numProveedor?: string;
  tarifaId?: string;
  tiempoEntrega?: string;
  observaciones?: string;
  paqueteId?: string;
  nivel?: string;
  tieneDcto?: boolean;
  porcentajeDcto?: number;
  impuestos: string;
}

export interface ProductoOption {
  id: string;
  nombre: string | null;
  referencia: string | null;
  precioSugerido: number | null;
}

export interface CreateDetCotizaPayload {
  productoId: string;
  cantidad: number;
  valorUnitario: number;
  observaciones?: string;
}

export interface UpdateDetCotizaPayload {
  productoId: string;
  cantidad: number;
  valorUnitario: number;
}

export interface CotizacionListResponse {
  data: CotizacionListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CotizacionQuery {
  page?: number;
  limit?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const cotizacionesService = {
  findAll: (query: CotizacionQuery): Promise<CotizacionListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/operacion/cotizaciones', { params }).then(r => r.data);
  },

  getById: (id: string): Promise<CotizacionDetail> =>
    api.get(`/operacion/cotizaciones/${id}`).then(r => r.data),

  createCotizacion: (payload: CreateCotizacionPayload): Promise<CotizacionDetail> =>
    api.post('/operacion/cotizaciones', payload).then(r => r.data),

  searchProductos: (search?: string, cotizacionId?: string): Promise<ProductoOption[]> =>
    api.get('/operacion/cotizaciones/productos', { params: { ...(search ? { search } : {}), ...(cotizacionId ? { cotizacionId } : {}) } }).then(r => r.data),

  createItem: (cotizacionId: string, payload: CreateDetCotizaPayload) =>
    api.post(`/operacion/cotizaciones/${cotizacionId}/items`, payload).then(r => r.data),

  updateItem: (itemId: string, payload: UpdateDetCotizaPayload) =>
    api.patch(`/operacion/cotizaciones/items/${itemId}`, payload).then(r => r.data),

  deleteItem: (itemId: string) =>
    api.delete(`/operacion/cotizaciones/items/${itemId}`).then(r => r.data),

  searchTerceros: (search?: string, clasificacion?: string): Promise<TerceroOption[]> =>
    api.get('/operacion/cotizaciones/terceros', { params: { ...(search ? { search } : {}), ...(clasificacion ? { clasificacion } : {}) } }).then(r => r.data),

  getTarifas: (): Promise<TarifaOption[]> =>
    api.get('/operacion/cotizaciones/tarifas').then(r => r.data),

  getTerceroTarifa: (terceroId: string): Promise<{ tarifaId: string | null; tarifaNombre: string | null }> =>
    api.get(`/operacion/cotizaciones/tercero-tarifa/${terceroId}`).then(r => r.data),

  getPaquetes: (): Promise<PaqueteOption[]> =>
    api.get('/operacion/cotizaciones/paquetes').then(r => r.data),

  updateCotizacion: (id: string, payload: UpdateCotizacionPayload): Promise<CotizacionDetail> =>
    api.patch(`/operacion/cotizaciones/${id}`, payload).then(r => r.data),

  deleteCotizacion: (id: string) =>
    api.delete(`/operacion/cotizaciones/${id}`).then(r => r.data),
};
