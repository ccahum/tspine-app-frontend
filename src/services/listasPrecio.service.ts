import { api } from '../lib/axios';

export interface ListaPrecioItem {
  id: string;
  subtarifaId: string | null;
  subtarifa: string | null;
  dependeDe: string | null;
  formula: boolean | null;
  productoId: string | null;
  productoReferencia: string | null;
  productoNombre: string | null;
  costoUtilidad: number | null;
  porcentajeGanancia: number | null;
  precio: number | null;
  formaActualizacion: string | null;
}

export interface ListaPrecioListResponse {
  data: ListaPrecioItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListaPrecioQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface SubtarifaOption {
  id: string;
  nombre: string;
  dependeDe: string | null;
  formula: boolean | null;
}

export interface ProductoOption {
  id: string;
  nombre: string | null;
  referencia: string | null;
}

export interface UpdateListaPrecioPayload {
  subtarifaId?: string;
  productoId?: string;
  costoUtilidad?: number;
  porcentajeGanancia?: number;
  precio?: number;
  formaActualizacion?: string;
}

export interface CreateListaPrecioPayload {
  subtarifaId: string;
  productoId: string;
  costoUtilidad: number;
  porcentajeGanancia?: number;
  precio: number;
  formaActualizacion?: string;
}

export const listasPrecioService = {
  findAll: (query: ListaPrecioQuery): Promise<ListaPrecioListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/operacion/listas-precio', { params }).then(r => r.data);
  },

  searchSubtarifas: (search?: string): Promise<SubtarifaOption[]> =>
    api.get('/operacion/listas-precio/subtarifas', { params: { search } }).then(r => r.data),

  searchProductos: (search?: string): Promise<ProductoOption[]> =>
    api.get('/operacion/listas-precio/productos', { params: { search } }).then(r => r.data),

  createListaPrecio: (payload: CreateListaPrecioPayload): Promise<ListaPrecioItem> =>
    api.post('/operacion/listas-precio', payload).then(r => r.data),

  updateListaPrecio: (id: string, payload: UpdateListaPrecioPayload): Promise<ListaPrecioItem> =>
    api.patch(`/operacion/listas-precio/${id}`, payload).then(r => r.data),

  deleteListaPrecio: (id: string): Promise<void> =>
    api.delete(`/operacion/listas-precio/${id}`).then(() => undefined),
};
