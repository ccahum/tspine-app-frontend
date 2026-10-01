import { useParams } from 'react-router-dom';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import ConsumoDetalleModal from './ConsumoDetalleModal';

// Wrapper de ruta para /operacion/consumos/:id (deep links directos) — el contenido real vive en
// ConsumoDetalleModal, que es el mismo componente que se abre como modal (sin navegar) desde
// Programación/Remisión, igual que el detalle de Cotizaciones.
export default function ConsumoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateWithLoading();

  if (!id) return null;
  return <ConsumoDetalleModal id={id} onClose={() => navigate(-1)} />;
}
