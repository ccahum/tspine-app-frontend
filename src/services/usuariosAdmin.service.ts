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

export interface CreateUsuarioPayload {
  nombreCompleto: string;
  usuario: string;
  password: string;
  perfilId: string;
  sedeId?: string;
}

export interface UpdateUsuarioPayload {
  nombreCompleto?: string;
  perfilId?: string;
  sedeId?: string;
  activo?: boolean;
  password?: string;
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

  create: async (data: CreateUsuarioPayload): Promise<UsuarioAdminItem> => {
    const res = await api.post<UsuarioAdminItem>('/administracion/usuarios', data);
    return res.data;
  },

  update: async (id: string, data: UpdateUsuarioPayload): Promise<UsuarioAdminItem> => {
    const res = await api.patch<UsuarioAdminItem>(`/administracion/usuarios/${id}`, data);
    return res.data;
  },
};
