import { api } from '../lib/axios';

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export const NOTIFICACIONES_PAGE_SIZE = 10;

export const notificacionesService = {
  listar: (skip = 0): Promise<Notificacion[]> =>
    api.get('/notificaciones', { params: { skip } }).then(r => r.data),

  noLeidasCount: (): Promise<{ count: number }> =>
    api.get('/notificaciones/no-leidas-count').then(r => r.data),

  marcarLeida: (id: string): Promise<void> =>
    api.patch(`/notificaciones/${id}/leer`).then(() => undefined),

  marcarTodasLeidas: (): Promise<void> =>
    api.patch('/notificaciones/leer-todas').then(() => undefined),
};
