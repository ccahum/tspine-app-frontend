import { api } from '../lib/axios';

export interface PrecioEspecialItem {
  id: string;
  productoId: string | null;
  productoReferencia: string | null;
  productoNombre: string | null;
  contactoId: string | null;
  contacto: string | null;
  precio: number | null;
  notas: string | null;
  buscable: string;
}

export interface PrecioEspecialListResponse {
  data: PrecioEspecialItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PrecioEspecialQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ProductoOption {
  id: string;
  nombre: string | null;
  referencia: string | null;
}

export interface ContactoOption {
  id: string;
  nombreCompleto: string;
}

export interface CreatePrecioEspecialPayload {
  productoId: string;
  contactoId: string;
  precio: number;
  notas?: string;
}

export interface UpdatePrecioEspecialPayload {
  productoId?: string;
  contactoId?: string;
  precio?: number;
  notas?: string;
}

export const preciosEspecialesService = {
  findAll: (query: PrecioEspecialQuery): Promise<PrecioEspecialListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/operacion/precios-especiales', { params }).then(r => r.data);
  },

  searchProductos: (search?: string): Promise<ProductoOption[]> =>
    api.get('/operacion/precios-especiales/productos', { params: { search } }).then(r => r.data),

  searchContactos: (search?: string): Promise<ContactoOption[]> =>
    api.get('/operacion/precios-especiales/contactos', { params: { search } }).then(r => r.data),

  createPrecioEspecial: (payload: CreatePrecioEspecialPayload): Promise<PrecioEspecialItem> =>
    api.post('/operacion/precios-especiales', payload).then(r => r.data),

  updatePrecioEspecial: (id: string, payload: UpdatePrecioEspecialPayload): Promise<PrecioEspecialItem> =>
    api.patch(`/operacion/precios-especiales/${id}`, payload).then(r => r.data),

  deletePrecioEspecial: (id: string): Promise<void> =>
    api.delete(`/operacion/precios-especiales/${id}`).then(() => undefined),
};
