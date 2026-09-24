import { api } from '../lib/axios';

export interface PerfilAdminItem {
  id: string;
  nombre: string;
  reglas: string;
  vistaInicial: string | null;
  accesoRestringido: boolean;
  vistas: string[];
}

export interface SubmoduleCatalogItem {
  id: string;
  modulo: string;
  moduloLabel: string;
  label: string;
}

export interface CreatePerfilPayload {
  nombre: string;
  reglas: string;
}

export interface UpdatePerfilPayload {
  nombre?: string;
  reglas?: string;
}

export interface UpdatePerfilAccesosPayload {
  accesoRestringido: boolean;
  vistaInicial: string | null;
  vistas: string[];
}

export const perfilesAdminService = {
  findAll: async (): Promise<PerfilAdminItem[]> => {
    const res = await api.get<PerfilAdminItem[]>('/administracion/perfiles');
    return res.data;
  },

  findCatalogoVistas: async (): Promise<SubmoduleCatalogItem[]> => {
    const res = await api.get<SubmoduleCatalogItem[]>('/administracion/perfiles/catalogo-vistas');
    return res.data;
  },

  create: async (data: CreatePerfilPayload): Promise<PerfilAdminItem> => {
    const res = await api.post<PerfilAdminItem>('/administracion/perfiles', data);
    return res.data;
  },

  update: async (id: string, data: UpdatePerfilPayload): Promise<PerfilAdminItem> => {
    const res = await api.patch<PerfilAdminItem>(`/administracion/perfiles/${id}`, data);
    return res.data;
  },

  updateAccesos: async (id: string, data: UpdatePerfilAccesosPayload): Promise<PerfilAdminItem> => {
    const res = await api.put<PerfilAdminItem>(`/administracion/perfiles/${id}/accesos`, data);
    return res.data;
  },
};
