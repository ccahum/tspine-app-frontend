import { api } from '../lib/axios';

export interface UsuarioAdminItem {
  id: string;
  nombreCompleto: string;
  correo: string | null;
  perfilId: string | null;
  perfilNombre: string | null;
  sedeId: string | null;
  sedeNombre: string | null;
  activo: boolean;
  totpActivado: boolean;
}

export interface PerfilOption {
  id: string;
  nombre: string;
}

export interface UpdateUsuarioPayload {
  nombreCompleto?: string;
  perfilId?: string;
  sedeId?: string;
  activo?: boolean;
  password?: string;
}

export interface TerceroDisponible {
  id: string;
  nombreCompleto: string;
  correo: string | null;
}

export interface CreateUsuarioDesdeTerceroPayload {
  terceroId: string;
  usuario: string;
  password: string;
  perfilId: string;
  sedeId?: string;
}

export const usuariosAdminService = {
  findAll: async (): Promise<UsuarioAdminItem[]> => {
    const res = await api.get<UsuarioAdminItem[]>('/administracion/usuarios');
    return res.data;
  },

  findPerfiles: async (): Promise<PerfilOption[]> => {
    const res = await api.get<PerfilOption[]>('/administracion/usuarios/perfiles');
    return res.data;
  },

  findTercerosDisponibles: async (q: string): Promise<TerceroDisponible[]> => {
    const res = await api.get<TerceroDisponible[]>('/administracion/usuarios/terceros-disponibles', { params: { q } });
    return res.data;
  },

  createFromTercero: async (data: CreateUsuarioDesdeTerceroPayload): Promise<UsuarioAdminItem> => {
    const res = await api.post<UsuarioAdminItem>('/administracion/usuarios/desde-tercero', data);
    return res.data;
  },

  update: async (id: string, data: UpdateUsuarioPayload): Promise<UsuarioAdminItem> => {
    const res = await api.patch<UsuarioAdminItem>(`/administracion/usuarios/${id}`, data);
    return res.data;
  },
};
