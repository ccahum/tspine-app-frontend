import { api } from '../lib/axios';

export interface SolicitudProgramacionItem {
  id: string;
  fechaQx: string | null;
  horaQx: string | null;
  sedeId: string | null;
  sede: string | null;
  hospitalId: string | null;
  hospital: string | null;
  medicos: { id: string; nombreCompleto: string }[];
  consumo: string | null;
  observaciones: string | null;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivoRechazo: string | null;
  solicitante: string | null;
  revisor: string | null;
  fechaRevision: string | null;
  programacionId: string | null;
  createdAt: string;
}

export interface SolicitudProgramacionListResponse {
  data: SolicitudProgramacionItem[];
  conteos: { PENDIENTE: number; APROBADA: number; RECHAZADA: number };
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateSolicitudProgramacionPayload {
  fechaQx?: string;
  horaQx?: string;
  sedeId?: string;
  hospitalId?: string;
  observaciones?: string;
  consumo?: string;
  medicoIds?: string[];
}

export const solicitudProgramacionService = {
  findAll: (estado?: string, page = 1, limit = 20): Promise<SolicitudProgramacionListResponse> =>
    api.get('/operacion/solicitud-programacion', { params: { estado, page, limit } }).then(r => r.data),

  soyRevisor: (): Promise<{ esRevisor: boolean }> =>
    api.get('/operacion/solicitud-programacion/soy-revisor').then(r => r.data),

  create: (payload: CreateSolicitudProgramacionPayload): Promise<SolicitudProgramacionItem> =>
    api.post('/operacion/solicitud-programacion', payload).then(r => r.data),

  updateEstado: (id: string, estado: 'APROBADA' | 'RECHAZADA', motivoRechazo?: string): Promise<SolicitudProgramacionItem> =>
    api.patch(`/operacion/solicitud-programacion/${id}`, { estado, motivoRechazo }).then(r => r.data),
};
