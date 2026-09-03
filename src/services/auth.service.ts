import { api } from '../lib/axios';

export interface LoginRequest {
  usuario: string;
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

export interface LoginStepResponse {
  estado: 'REQUIERE_CAMBIO_PASSWORD' | 'REQUIERE_CONFIGURAR_2FA' | 'REQUIERE_CODIGO';
  pendingToken: string;
}

export interface TotpSetupResponse {
  qrDataUrl: string;
  secret: string;
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginStepResponse> => {
    const res = await api.post<LoginStepResponse>('/auth/login', data);
    return res.data;
  },

  cambiarPasswordInicial: async (pendingToken: string, nuevaPassword: string): Promise<LoginStepResponse> => {
    const res = await api.post<LoginStepResponse>('/auth/cambiar-password-inicial', { pendingToken, nuevaPassword });
    return res.data;
  },

  setupTotp: async (pendingToken: string): Promise<TotpSetupResponse> => {
    const res = await api.post<TotpSetupResponse>('/auth/2fa/setup', { pendingToken });
    return res.data;
  },

  confirmarSetupTotp: async (pendingToken: string, codigo: string): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/2fa/confirmar-setup', { pendingToken, codigo });
    return res.data;
  },

  verificarCodigo: async (pendingToken: string, codigo: string): Promise<LoginResponse> => {
    const res = await api.post<LoginResponse>('/auth/2fa/verificar', { pendingToken, codigo });
    return res.data;
  },

  me: async (): Promise<Usuario> => {
    const res = await api.get<Usuario>('/auth/me');
    return res.data;
  },

  olvidePassword: async (usuario: string): Promise<void> => {
    await api.post('/auth/olvide-password', { usuario });
  },

  resetPassword: async (token: string, nuevaPassword: string): Promise<void> => {
    await api.post('/auth/reset-password', { token, nuevaPassword });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('usuario');
  },
};
