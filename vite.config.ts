import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vite solo expone al bundle del cliente las variables con prefijo VITE_ por defecto — se agrega
  // LUMINAR_ para variables de configuración propias del negocio (ej. LUMINAR_INACTIVITY_MINUTES),
  // sin perder el prefijo VITE_ que ya usan las demás (ej. VITE_API_URL).
  envPrefix: ['VITE_', 'LUMINAR_'],
})
