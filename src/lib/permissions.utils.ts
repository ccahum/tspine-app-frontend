import type { Usuario } from '../services/auth.service';
import { esSuperAdmin } from './auth.utils';
import { ROUTE_PREFIXES } from './submoduleRoutePrefixes';

export function getUsuario(): Usuario | null {
  const raw = localStorage.getItem('usuario');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

// Superadmin y cualquier perfil sin accesoRestringido (el default, y el estado de todo perfil
// existente antes de esta funcionalidad) siempre tienen acceso total — el bloqueo real solo
// aplica a perfiles que un admin restringió explícitamente desde Administración > Perfiles.
export function tieneAccesoAVista(pathname: string): boolean {
  if (esSuperAdmin()) return true;
  const usuario = getUsuario();
  if (!usuario || !usuario.accesoRestringido) return true;

  return usuario.vistas.some(vistaId => {
    const prefijos = ROUTE_PREFIXES[vistaId];
    return prefijos?.some(p => pathname === p || pathname.startsWith(`${p}/`));
  });
}

// Para las páginas raíz de un módulo (/operacion, /vehicular), que no son una "vista" del
// registro en sí — se consideran accesibles si el perfil tiene al menos un submódulo de ese
// módulo asignado.
export function moduloTieneAlgunAcceso(moduloPrefix: string): boolean {
  if (esSuperAdmin()) return true;
  const usuario = getUsuario();
  if (!usuario || !usuario.accesoRestringido) return true;

  return usuario.vistas.some(vistaId => vistaId.startsWith(`${moduloPrefix}/`));
}
