import { api } from '../lib/axios';

export interface ViajeVehiculoItem {
  id: string;
  marcaTiempo: string | null;
  conductor: string | null;
  sede: string | null;
  vehiculo: string | null;
  kilometrajeActual: number | null;
  sitioOrigen: string | null;
  sitioDestino: string | null;
  fotoTablero: string | null;
  fotoDisponible: boolean;
  diligencia: string | null;
  novedadesEstado: string | null;
  estadoActual: boolean | null;
}

export interface ViajeVehiculoListResponse {
  data: ViajeVehiculoItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ViajeVehiculoQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CreateViajeVehiculoPayload {
  vehiculoId: string;
  sedeId: string;
  kilometrajeActual: number;
  sitioDestino: string;
  fotografia: string;
  diligencia: string;
  sitioOrigen?: string;
  novedadesEstado?: string;
}

export const viajeVehiculoService = {
  findAll: (query: ViajeVehiculoQuery): Promise<ViajeVehiculoListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/vehicular/viajes', { params }).then(r => r.data);
  },

  fetchFotoBlob: (id: string): Promise<Blob> =>
    api.get(`/vehicular/viajes/${id}/foto`, { responseType: 'blob' }).then(r => r.data),

  createViaje: (payload: CreateViajeVehiculoPayload): Promise<ViajeVehiculoItem> =>
    api.post('/vehicular/viajes', payload).then(r => r.data),
};
