import type { Usuario } from '../services/auth.service';

// Mismo criterio dual que usa el backend (ver super-admin.util.ts): perfilId === 'SA' cubre el
// seed de desarrollo, perfil.nombre === 'SA' cubre un perfil real importado con ese nombre.
export function esSuperAdmin(): boolean {
  const raw = localStorage.getItem('usuario');
  if (!raw) return false;

  try {
    const usuario = JSON.parse(raw) as Usuario;
    return usuario.perfilId === 'SA' || usuario.perfilNombre?.toUpperCase() === 'SA';
  } catch {
    return false;
  }
}
