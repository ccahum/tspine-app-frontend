import { api } from '../lib/axios';

export interface ProgramacionItem {
  id: string;
  numProgram: string | null;
  createdAt: string;
  fechaQx: string | null;
  horaQx: string | null;
  sede: string | null;
  ciudad: string | null;
  medicos: string[];
  hospital: string | null;
  observaciones: string | null;
  saldo: number | null;
  avance: number | null;
  sinRemision: boolean;
  consumoNoValidado: boolean;
  sinComision: boolean;
  cerrada: boolean;
  alertaConsumos: boolean;
}

export interface ProgramacionCalendarItem {
  id: string;
  fechaQx: string | null;
  horaQx: string | null;
  sede: string | null;
  medicos: string[];
}

export interface ProgramacionListResponse {
  data: ProgramacionItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const PROGRAMACION_SORT_FIELDS = ['numProgram', 'createdAt', 'fechaQx', 'horaQx', 'sede', 'hospital', 'observaciones'] as const;
export type ProgramacionSortField = (typeof PROGRAMACION_SORT_FIELDS)[number];

export interface ProgramacionQuery {
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  sedeId?: string;
  search?: string;
  cerrada?: boolean;
  sinRemision?: boolean;
  sinComision?: boolean;
  consumoNoValidado?: boolean;
  conRequisicion?: boolean;
  sortBy?: ProgramacionSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface ProgramacionStats {
  total: number;
  sinRemision: number;
  consumoNoValidado: number;
  sinComision: number;
  cerradas: number;
  saldoPendiente: number;
  porSede: { sede: string; total: number }[];
  programacionesAño?: number;
  programacionesMes?: number;
}

export type FlagsUpdate = Partial<Pick<ProgramacionItem, 'cerrada' | 'alertaConsumos'>>;

export interface ProgramacionDetail {
  id: string;
  fechaQx: string | null;
  horaQx: string | null;
  sede: { id: string; nombre: string } | null;
  ciudad: string | null;
  hospital: { id: string; nombre: string; ciudadCat: { nombre: string } | null; tercero: { id: string; nombreCompleto: string } | null } | null;
  medicos: Array<{ medico: { id: string; nombreCompleto: string } }>;
  tecnicos: Array<{ tecnico: { id: string; nombreCompleto: string } }>;
  observaciones: string | null;
  consumo: string | null;
  cotizaciones: CotizacionOption[];
  total: number | null;
  descuentos: number | null;
  nc: number | null;
  baseIngreso: number | null;
  comisiones: number | null;
  utilidadBruta: number | null;
  costoTotal: number | null;
  saldo: number | null;
  montoTecnicos: number | null;
  montoInversionistas: number | null;
  montoPlus: number | null;
  sinRemision: boolean;
  consumoNoValidado: boolean;
  sinComision: boolean;
  cerrada: boolean;
  alertaConsumos: boolean;
  avance: number | null;
  estadoRequisicion: string | null;
}

export interface SedeOption {
  id: string;
  nombre: string;
}

export interface HospitalOption {
  id: string;
  nombre: string;
  ciudadCat: { nombre: string } | null;
}

export interface MedicoOption {
  id: string;
  nombreCompleto: string;
}

export interface CotizacionOption {
  id: string;
  numCotizacion: string | null;
  medico: string | null;
  fecha: string | null;
  cirugia: string | null;
  hospital: { nombreCompleto: string } | null;
  total: number;
}

export interface UpdateProgramacionPayload {
  fechaQx?: string;
  horaQx?: string;
  sedeId?: string;
  hospitalId?: string;
  observaciones?: string;
  consumo?: string;
  medicoIds?: string[];
  cotizacionIds?: string[];
}

export interface MonthComparison {
  year: number;
  months: Record<number, number>;
}

export interface ProgramacionComparisonResponse {
  data: MonthComparison[];
}

export const programacionesService = {
  getStats: async (query: ProgramacionQuery): Promise<ProgramacionStats> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
    );
    const res = await api.get<ProgramacionStats>('/operacion/programaciones/stats', { params });
    return res.data;
  },

  findAll: async (query: ProgramacionQuery): Promise<ProgramacionListResponse> => {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
    );
    const res = await api.get<ProgramacionListResponse>('/operacion/programaciones', { params });
    return res.data;
  },

  findAllForCalendar: async (dateFrom?: string, dateTo?: string): Promise<ProgramacionCalendarItem[]> => {
    const res = await api.get<ProgramacionCalendarItem[]>('/operacion/programaciones/calendario', { params: { dateFrom, dateTo } });
    return res.data;
  },

  updateFlags: async (id: string, flags: FlagsUpdate): Promise<ProgramacionItem> => {
    const res = await api.patch<ProgramacionItem>(`/operacion/programaciones/${id}/flags`, flags);
    return res.data;
  },

  getById: async (id: string): Promise<ProgramacionDetail> => {
    const res = await api.get<ProgramacionDetail>(`/operacion/programaciones/${id}`);
    return res.data;
  },

  create: async (data: UpdateProgramacionPayload): Promise<ProgramacionItem> => {
    const res = await api.post<ProgramacionItem>('/operacion/programaciones', data);
    return res.data;
  },

  update: async (id: string, data: UpdateProgramacionPayload): Promise<ProgramacionItem> => {
    const res = await api.patch<ProgramacionItem>(`/operacion/programaciones/${id}`, data);
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/operacion/programaciones/${id}`);
  },

  getSedes: async (): Promise<SedeOption[]> => {
    const res = await api.get<SedeOption[]>('/operacion/programaciones/sedes');
    return res.data;
  },

  getHospitales: async (): Promise<HospitalOption[]> => {
    const res = await api.get<HospitalOption[]>('/operacion/programaciones/hospitales');
    return res.data;
  },

  searchMedicos: async (search?: string): Promise<MedicoOption[]> => {
    const res = await api.get<MedicoOption[]>('/operacion/programaciones/medicos', { params: { search } });
    return res.data;
  },

  searchCotizaciones: async (search?: string, medicos?: string[]): Promise<CotizacionOption[]> => {
    const res = await api.get<CotizacionOption[]>('/operacion/programaciones/cotizaciones', {
      params: { search, medicos: medicos && medicos.length > 0 ? medicos.join(',') : undefined },
    });
    return res.data;
  },

  getConsumosDeCotizaciones: async (ids: string[]): Promise<string[]> => {
    const res = await api.get<string[]>('/operacion/programaciones/cotizaciones/items', { params: { ids: ids.join(',') } });
    return res.data;
  },

  getMonthComparison: async (): Promise<ProgramacionComparisonResponse> => {
    const res = await api.get<ProgramacionComparisonResponse>('/operacion/programaciones/comparison/monthly');
    return res.data;
  },

  getSedeDistributionByMonth: async (year: number, month: number): Promise<{ data: { sede: string; total: number }[] }> => {
    const res = await api.get(`/operacion/programaciones/sede-distribution/${year}/${month}`);
    return res.data;
  },
};
