import { api } from '../lib/axios';

export type ClasificacionTercero =
  | 'PARTICULAR' | 'DISTRIBUIDOR' | 'ASEGURADORA' | 'CLIENTE' | 'EMPLEADO'
  | 'HOSPITAL' | 'DOCTOR' | 'COMISIONISTA' | 'INVERSIONISTA' | 'EMPRESA'
  | 'PROVEEDOR' | 'SEDE' | 'ALMACEN' | 'GRUPO' | 'OTROS';

export const CLASIFICACIONES_TERCERO: ClasificacionTercero[] = [
  'PARTICULAR', 'DISTRIBUIDOR', 'ASEGURADORA', 'CLIENTE', 'EMPLEADO',
  'HOSPITAL', 'DOCTOR', 'COMISIONISTA', 'INVERSIONISTA', 'EMPRESA',
  'PROVEEDOR', 'SEDE', 'ALMACEN', 'OTROS',
];

export interface TerceroItem {
  id: string;
  nombreCompleto: string;
  correo: string | null;
  activo: boolean;
  tipoContacto: boolean | null;
  tipoPersona: boolean | null;
  sede: string | null;
  cargo: string | null;
  clasificaciones: ClasificacionTercero[];
}

export interface TerceroListResponse {
  data: TerceroItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TerceroQuery {
  page?: number;
  limit?: number;
  search?: string;
  clasificacion?: ClasificacionTercero;
}

export interface CatalogoOption {
  id: string;
  nombre?: string;
  descripcion?: string;
}

export interface TercerosCatalogos {
  cargos: { id: string; nombre: string }[];
  ciudades: { id: string; nombre: string; estadoId: string | null }[];
  estados: { id: string; nombre: string; paisId: string | null }[];
  paises: { id: string; nombre: string }[];
  regimenesFiscales: { id: string; descripcion: string }[];
  usosCfdi: { id: string; descripcion: string }[];
  bancos: { id: string; nombre: string }[];
}

export interface DatosFiscalesPayload {
  rfc?: string;
  razonSocial?: string;
  regimenFiscalId?: string;
  codigoPostalFiscal?: string;
  usoCfdiId?: string;
  direccionFiscal?: string;
}

export interface TerceroContactoItem {
  id: string;
  tipo: string;
  dato: string;
  personaContacto: string | null;
  notas: string | null;
  principal: boolean;
}

export interface TerceroCuentaItem {
  id: string;
  tipoDeCuenta: string | null;
  tipo: string | null;
  bancoId: string | null;
  noDeCuenta: string | null;
  clabeInterbancaria: string | null;
  banco: string | null;
}

export interface TerceroDetail {
  id: string;
  primerNombre: string | null;
  segundoNombre: string | null;
  primerApellido: string | null;
  segundoApellido: string | null;
  nombreCompleto: string;
  nombreComercial: string | null;
  correo: string | null;
  activo: boolean;
  tipoContacto: boolean | null;
  tipoPersona: boolean | null;
  observaciones: string | null;
  creadoPor: string | null;
  creadoEn: string | null;
  mir: boolean | null;
  grupo: boolean;
  ciudadId: string | null;
  estadoId: string | null;
  paisId: string | null;
  fechaNacimiento: string | null;
  fotoPerfilUrl: string | null;
  ciudad: string | null;
  estado: string | null;
  pais: string | null;
  sede: string | null;
  cargo: string | null;
  perfil: string | null;
  clasificaciones: ClasificacionTercero[];
  contactos: TerceroContactoItem[];
  cuentas: TerceroCuentaItem[];
  datosFiscales: DatosFiscalesPayload | null;
}

export const TIPOS_CONTACTO = ['Teléfono', 'Celular', 'Correo', 'Dirección'] as const;
export type TipoContacto = typeof TIPOS_CONTACTO[number];

export const TIPOS_DE_CUENTA = ['Interna', 'Externa'] as const;
export type TipoDeCuenta = typeof TIPOS_DE_CUENTA[number];

export const TIPOS_CUENTA = ['Efectivo', 'Bancaria', 'Compensación'] as const;
export type TipoCuenta = typeof TIPOS_CUENTA[number];

export interface CreateTerceroContactoPayload {
  tipo: TipoContacto;
  dato: string;
  personaContacto?: string;
  notas?: string;
  principal?: boolean;
}

export interface CreateTerceroCuentaPayload {
  tipoDeCuenta: TipoDeCuenta;
  tipo: TipoCuenta;
  bancoId?: string;
  noDeCuenta?: string;
  clabeInterbancaria?: string;
}

export type UpdateTerceroContactoPayload = Partial<CreateTerceroContactoPayload>;

export interface CreateTerceroPayload {
  tipoContacto: boolean;
  tipoPersona: boolean;
  primerNombre: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  nombreCompleto?: string;
  nombreComercial?: string;
  ciudadId?: string;
  estadoId?: string;
  paisId?: string;
  observaciones?: string;
  clasificaciones?: ClasificacionTercero[];
  mir?: boolean;
  grupo?: boolean;
  datosFiscales?: DatosFiscalesPayload;
}

export interface UpdateTerceroPayload {
  tipoContacto?: boolean;
  tipoPersona?: boolean;
  primerNombre?: string;
  segundoNombre?: string;
  primerApellido?: string;
  segundoApellido?: string;
  nombreCompleto?: string;
  nombreComercial?: string;
  ciudadId?: string;
  estadoId?: string;
  paisId?: string;
  observaciones?: string;
  clasificaciones?: ClasificacionTercero[];
  mir?: boolean;
  grupo?: boolean;
  activo?: boolean;
  datosFiscales?: DatosFiscalesPayload;
}

export const tercerosAdminService = {
  findAll: (query: TerceroQuery): Promise<TerceroListResponse> => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
    return api.get('/administracion/terceros', { params }).then(r => r.data);
  },

  getCatalogos: (): Promise<TercerosCatalogos> =>
    api.get('/administracion/terceros/catalogos').then(r => r.data),

  findOne: (id: string): Promise<TerceroDetail> =>
    api.get(`/administracion/terceros/${id}`).then(r => r.data),

  createTercero: (payload: CreateTerceroPayload): Promise<TerceroItem> =>
    api.post('/administracion/terceros', payload).then(r => r.data),

  updateTercero: (id: string, payload: UpdateTerceroPayload): Promise<TerceroItem> =>
    api.patch(`/administracion/terceros/${id}`, payload).then(r => r.data),

  createContacto: (terceroId: string, payload: CreateTerceroContactoPayload): Promise<TerceroContactoItem> =>
    api.post(`/administracion/terceros/${terceroId}/contactos`, payload).then(r => r.data),

  createCuenta: (terceroId: string, payload: CreateTerceroCuentaPayload): Promise<TerceroCuentaItem> =>
    api.post(`/administracion/terceros/${terceroId}/cuentas`, payload).then(r => r.data),

  updateContacto: (terceroId: string, contactoId: string, payload: UpdateTerceroContactoPayload): Promise<TerceroContactoItem> =>
    api.patch(`/administracion/terceros/${terceroId}/contactos/${contactoId}`, payload).then(r => r.data),

  deleteContacto: (terceroId: string, contactoId: string): Promise<void> =>
    api.delete(`/administracion/terceros/${terceroId}/contactos/${contactoId}`).then(() => undefined),

  deleteCuenta: (terceroId: string, cuentaId: string): Promise<void> =>
    api.delete(`/administracion/terceros/${terceroId}/cuentas/${cuentaId}`).then(() => undefined),
};
