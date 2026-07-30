import { api } from '../lib/axios';

export interface LoginRequest {
  correo: string;
  password: string;
}

export interface Usuario {
  id: string;
  nombreCompleto: string;
  correo: string | null;
  perfilId: string | null;
  perfilNombre: string;
  reglas: string;
  sedeId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  usuario: Usuario;
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/login', data);
    return res.data;
  },

  me: async (): Promise<Usuario> => {
    const res = await api.get<Usuario>('/auth/me');
    return res.data;
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('usuario');
  },
};
