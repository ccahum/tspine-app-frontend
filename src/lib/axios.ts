import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Login y los 3 pasos de 2FA manejan sus propios 401 en el formulario — un código
    // incorrecto no debe forzar una recarga completa a /login y perder el estado del flujo
    // (QR ya generado, pendingToken, etc.). /auth/me sí debe seguir el flujo normal de expiración.
    const url = error.config?.url ?? '';
    const isAuthFlowRequest = url.includes('/auth/login') || url.includes('/auth/2fa/');
    if (error.response?.status === 401 && !isAuthFlowRequest) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
