import { api } from '../lib/axios';

export interface VehiculoCatalogoItem {
  id: string;
  placas: string | null;
  nombre: string | null;
  marca: string | null;
  modelo: string | null;
  fotografia: string | null;
  fotoDisponible: boolean;
  kmActual: number | null;
  estado: string | null;
  sedeId: string | null;
  sedeNombre: string | null;
}

export interface VehiculoCatalogoListResponse {
  data: VehiculoCatalogoItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface VehiculoCatalogoQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateVehiculoCatalogoPayload {
  placas: string;
  nombre: string;
  marca: string;
  modelo: string;
  fotografia: string;
  kmActual: number;
  sedeId: string;
  estado: string;
}

export interface UpdateVehiculoCatalogoPayload {
  placas?: string;
  nombre?: string;
  marca?: string;
  modelo?: string;
  fotografia?: string;
  kmActual?: number;
  sedeId?: string;
  estado?: string;
}

export const vehiculoCatalogoService = {
  findAll: (query: VehiculoCatalogoQuery): Promise<VehiculoCatalogoListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/vehicular/catalogo', { params }).then(r => r.data);
  },

  createVehiculo: (payload: CreateVehiculoCatalogoPayload): Promise<VehiculoCatalogoItem> =>
    api.post('/vehicular/catalogo', payload).then(r => r.data),

  updateVehiculo: (id: string, payload: UpdateVehiculoCatalogoPayload): Promise<VehiculoCatalogoItem> =>
    api.patch(`/vehicular/catalogo/${id}`, payload).then(r => r.data),

  deleteVehiculo: (id: string): Promise<void> =>
    api.delete(`/vehicular/catalogo/${id}`).then(() => undefined),

  fetchFotoBlob: (id: string): Promise<Blob> =>
    api.get(`/vehicular/catalogo/${id}/foto`, { responseType: 'blob' }).then(r => r.data),
};
