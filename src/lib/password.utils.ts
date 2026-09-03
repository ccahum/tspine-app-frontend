// Misma regla que valida el backend (Constants.Auth.PASSWORD_REGEX en tspine-app-backend).
// Se exige solo para la contraseña definitiva que el propio usuario elige (primer login).
// Las contraseñas temporales que asigna el admin al crear/resetear un usuario solo validan
// longitud — no vale la pena exigir complejidad a algo que se va a reemplazar de inmediato.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export const PASSWORD_HINT = 'Mínimo 8 caracteres, con mayúsculas, minúsculas, un número y un carácter especial';
export const PASSWORD_MINIMA_HINT = 'Mínimo 8 caracteres — es temporal, el usuario la reemplaza en su primer login';

export interface PasswordRequisito {
  label: string;
  cumple: boolean;
}

// Mismas reglas que PASSWORD_REGEX, desglosadas para mostrar en vivo cuál falta mientras se escribe.
export function evaluarPassword(password: string): PasswordRequisito[] {
  return [
    { label: 'Mínimo 8 caracteres', cumple: password.length >= 8 },
    { label: 'Una mayúscula', cumple: /[A-Z]/.test(password) },
    { label: 'Una minúscula', cumple: /[a-z]/.test(password) },
    { label: 'Un número', cumple: /\d/.test(password) },
    { label: 'Un carácter especial', cumple: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function validarPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!PASSWORD_REGEX.test(password)) return 'La contraseña debe incluir mayúsculas, minúsculas, un número y un carácter especial';
  return null;
}

export function validarPasswordMinima(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  return null;
}
