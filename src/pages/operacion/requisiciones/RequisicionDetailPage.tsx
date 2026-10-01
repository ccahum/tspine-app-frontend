import { useParams } from 'react-router-dom';
import { useNavigateWithLoading } from '../../../hooks/useNavigateWithLoading';
import RequisicionDetalleModal from './RequisicionDetalleModal';

// Wrapper de ruta para /operacion/requisiciones/:id (deep links directos) — el contenido real vive
// en RequisicionDetalleModal, que es el mismo componente que se abre como modal (sin navegar)
// desde Programación, igual que el detalle de Cotizaciones/Consumo.
export default function RequisicionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigateWithLoading();

  if (!id) return null;
  return <RequisicionDetalleModal id={id} onClose={() => navigate(-1)} />;
}
