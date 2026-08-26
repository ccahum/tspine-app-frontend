import { api } from '../lib/axios';

export interface BusquedaGlobalResult {
  programaciones: { id: string; numProgram: string | null; hospital: string | null; fechaQx: string | null }[];
  remisiones: { id: string; numRemision: string | null; paciente: string | null }[];
  cotizaciones: { id: string; numCotizacion: string | null; hospital: string | null; medico: string | null }[];
}

export const busquedaGlobalService = {
  buscar: (q: string): Promise<BusquedaGlobalResult> =>
    api.get('/busqueda-global', { params: { q } }).then(r => r.data),
};
