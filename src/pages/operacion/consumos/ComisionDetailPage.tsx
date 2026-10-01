import { useParams } from 'react-router-dom';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import ComisionDetalleModal from './ComisionDetalleModal';

// Wrapper de ruta para /operacion/comisiones/:id (deep links directos) — el contenido real vive
// en ComisionDetalleModal, que es el mismo componente que se abre como modal (sin navegar) desde
// la tabla de Asignación de Comisiones, igual que Consumo/Requisición.
export default function ComisionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateWithLoading();

  if (!id) return null;
  return <ComisionDetalleModal id={id} onClose={() => navigate(-1)} />;
}
