/**
 * Formatea un Date como YYYY-MM-DD usando la hora LOCAL del navegador (no UTC).
 * `date.toISOString().split('T')[0]` convierte a UTC primero, así que para instantes
 * "ahora mismo" (no normalizados a medianoche) puede devolver el día siguiente cuando
 * la hora local ya pasó las 18:00 en zonas UTC-6 como México. Esta función evita ese salto.
 */
export const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Fecha de hoy en México (UTC-6 fijo, sin horario de verano) como "YYYY-MM-DD".
 * Los campos tipo fecha (fechaQx, etc.) vienen del backend como dígitos UTC que representan
 * el día calendario real en México (ver commons/date.utils.ts::nowMexico en el backend), así
 * que para compararlos contra "hoy" hay que calcular el día en México de la misma forma —
 * no basta con confiar en la hora local del navegador.
 */
export const getTodayMexico = (): string => {
  const mexicoNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return mexicoNow.toISOString().split('T')[0];
};

/**
 * Hora actual en México (mismo offset fijo que getTodayMexico) como "HH:mm" — para restringir
 * la selección de horas ya pasadas cuando la fecha elegida es hoy (solo al crear; al editar sí
 * se permite cualquier fecha/hora, incluidas pasadas).
 */
export const getNowMexicoTime = (): string => {
  const mexicoNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return mexicoNow.toISOString().split('T')[1].slice(0, 5);
};
