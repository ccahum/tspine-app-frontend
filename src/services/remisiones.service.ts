import { api } from '../lib/axios';

export interface RemisionItem {
  id: string;
  numRemision: string | null;
  estado: string | null;
  cxc: boolean | null;
  paciente: string | null;
  cirugiaRealizada: string | null;
  porcentajeDcto: number | null;
  vrDctoPesos: number | null;
  tieneFactura: boolean;
  noFactura: string | null;
  estadoFactura: string | null;
  creadoEn: string | null;
  tarifa: { nombre: string } | null;
  subtotal: number;
}

export interface RemTecnicoItem {
  id: string;
  tecnico: { nombreCompleto: string } | null;
  programacion: { id: string; numProgram: string | null } | null;
  remision: { id: string; numRemision: string | null } | null;
}

export const remisionesService = {
  findByProgramacion: (programacionId: string): Promise<RemisionItem[]> =>
    api.get('/operacion/remisiones', { params: { programacionId } }).then(r => r.data),

  findTecnicosByProgramacion: (programacionId: string): Promise<RemTecnicoItem[]> =>
    api.get('/operacion/remisiones/tecnicos', { params: { programacionId } }).then(r => r.data),
};
