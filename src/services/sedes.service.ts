export interface Sede {
  id: string;
  nombre: string;
}

export const sedesService = {
  getAll: async (): Promise<Sede[]> => {
    return [
      { id: '1', nombre: 'Sede Cancún' },
      { id: '2', nombre: 'Sede Guadalajara' },
      { id: '3', nombre: 'Sede Mérida' },
      { id: '4', nombre: 'Sede Vallarta' },
    ];
  },
};
