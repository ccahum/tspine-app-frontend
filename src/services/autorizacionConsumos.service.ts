import { api } from '../lib/axios';

export type EstadoAutorizacion = 'PENDIENTE' | 'AUTORIZADO' | 'NO AUTORIZADO';

export interface AutorizacionConsumoItem {
  id: string;
  sedeConsumo: string | null;
  sedeUsuario: string | null;
  canVal: number;
  proVal: string | null;
  estadoAutorizacion: EstadoAutorizacion | null;
  motivo: string | null;
  fechaAutorizacion: string | null;
  usuarioAutorizador: string | null;
}

export interface AutorizacionConsumoGrupo {
  remisionId: string | null;
  numRemision: string | null;
  items: AutorizacionConsumoItem[];
}

export interface AutorizacionConsumoConteos {
  PENDIENTE: number;
  AUTORIZADO: number;
  'NO AUTORIZADO': number;
}

export interface AutorizacionConsumosResponse {
  grupos: AutorizacionConsumoGrupo[];
  conteos: AutorizacionConsumoConteos;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UpdateEstadoAutorizacionPayload {
  estado: 'AUTORIZADO' | 'NO AUTORIZADO';
  motivo?: string;
}

export const autorizacionConsumosService = {
  findAll: (estado?: EstadoAutorizacion, page = 1, limit = 100): Promise<AutorizacionConsumosResponse> =>
    api.get('/operacion/autorizacion-consumos', { params: { estado, page, limit } }).then(r => r.data),

  updateEstado: (id: string, payload: UpdateEstadoAutorizacionPayload): Promise<AutorizacionConsumoItem> =>
    api.patch(`/operacion/autorizacion-consumos/${id}`, payload).then(r => r.data),
};
