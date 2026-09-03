import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, MapPin, X, Plus, Camera, Upload, Car, CheckCircle, Circle } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import { viajeVehiculoService, type ViajeVehiculoItem } from '../../../services/viajeVehiculo.service';
import { vehiculoCatalogoService, type VehiculoCatalogoItem } from '../../../services/vehiculoCatalogo.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';

const formatDateTime = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const mins = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch {
    return dateString;
  }
};

const formatKm = (value: number | null): string =>
  value === null || value === undefined ? '-' : `${value.toLocaleString('es-MX')} km`;

// "21.056225, -89.533685" — descarta el sentinel "0.000000, 0.000000" que AppSheet usa cuando no
// se capturó GPS real.
const COORD_RE = /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/;
function esCoordenadaValida(value: string): boolean {
  const v = value.trim();
  if (!COORD_RE.test(v)) return false;
  return v !== '0.000000, 0.000000' && v !== '0, 0';
}

function googleMapsUrl(coord: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coord)}`;
}

// Mapa embebido oficial de OpenStreetMap.org (el mismo iframe que genera su botón "Share" —
// público, sin API key ni costo). staticmap.openstreetmap.de ya no resuelve, por eso se usa esto.
function mapEmbedUrl(coord: string): string {
  const [lat, lng] = coord.split(',').map(p => parseFloat(p.trim()));
  const delta = 0.01;
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

function ViajeFoto({ id, size }: { id: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setError(false);
    viajeVehiculoService.fetchFotoBlob(id).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  const thumbStyle = size ? { ...styles.fotoThumb, width: size, height: size } : styles.fotoGrande;

  if (error) return size ? <div style={{ ...styles.fotoThumb, ...styles.fotoThumbEmpty, width: size, height: size }} /> : <div style={styles.fotoEmpty}>No disponible</div>;
  if (!src) return size ? <div style={{ ...styles.fotoThumb, ...styles.fotoThumbEmpty, width: size, height: size }} /> : <div style={styles.fotoEmpty}>Cargando...</div>;
  return (
    <img
      src={src}
      alt="Foto del tablero"
      style={{ ...thumbStyle, cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); window.open(src, '_blank'); }}
    />
  );
}

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleRow}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

function DetalleModal({ item, onClose }: { item: ViajeVehiculoItem; onClose: () => void }) {
  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Viaje {item.id}</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          {item.fotoDisponible ? <ViajeFoto id={item.id} /> : <div style={styles.fotoEmpty}>No disponible</div>}

          <DetalleRow label="ID">{item.id}</DetalleRow>
          <DetalleRow label="Marca de tiempo">{formatDateTime(item.marcaTiempo)}</DetalleRow>
          <DetalleRow label="Nombre">{item.conductor ?? '-'}</DetalleRow>
          <DetalleRow label="Vehículo"><span style={styles.placasCode}>{item.vehiculo ?? '-'}</span></DetalleRow>
          <DetalleRow label="Kilometraje actual">{formatKm(item.kilometrajeActual)}</DetalleRow>

          <DetalleRow label="Sitio origen">
            {item.sitioOrigen && esCoordenadaValida(item.sitioOrigen) ? (
              <>
                <iframe
                  title="Mapa del sitio origen"
                  src={mapEmbedUrl(item.sitioOrigen)}
                  style={styles.mapaFrame}
                  loading="lazy"
                />
                <a href={googleMapsUrl(item.sitioOrigen)} target="_blank" rel="noreferrer" style={styles.mapLink}>
                  <MapPin size={13} /> Abrir en Google Maps
                </a>
              </>
            ) : (
              <span>{item.sitioOrigen ?? '-'}</span>
            )}
          </DetalleRow>

          <DetalleRow label="Sitio destino">{item.sitioDestino ?? '-'}</DetalleRow>
          <DetalleRow label="Diligencia">{item.diligencia ?? '-'}</DetalleRow>
          <DetalleRow label="¿Hay novedades?">{item.novedadesEstado ?? 'Sin novedades'}</DetalleRow>
          <DetalleRow label="Estado actual">
            <span style={{ ...styles.estadoBadge, ...(item.estadoActual ? styles.estadoActivo : styles.estadoInactivo) }}>
              {item.estadoActual === null ? '-' : item.estadoActual ? 'Activo' : 'Inactivo'}
            </span>
          </DetalleRow>
        </div>
      </div>
    </div>
  );
}

const MAX_FOTO_BYTES = 8 * 1024 * 1024;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

// Solo letras/acentos/espacios y puntuación básica de nombres — sin números.
const sanitizeText = (value: string): string => value.replace(/[^A-Za-zÀ-ÿ\s.,'-]/g, '');

const usuarioActual = (): { nombreCompleto?: string } => {
  try {
    return JSON.parse(localStorage.getItem('usuario') ?? '{}');
  } catch {
    return {};
  }
};

function capturarUbicacion(): Promise<string | undefined> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(undefined); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => resolve(undefined),
      { timeout: 8000 },
    );
  });
}

function FotoField({ file, error, onSelect }: {
  file: File | null;
  error?: string;
  onSelect: (file: File | null, error?: string) => void;
}) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setLocalPreview(null); return; }
    const url = URL.createObjectURL(file);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFile = (selected: File | null) => {
    if (!selected) return;
    if (!selected.type.startsWith('image/')) { onSelect(null, 'Selecciona un archivo de imagen.'); return; }
    if (selected.size > MAX_FOTO_BYTES) { onSelect(null, 'La imagen es demasiado grande (máximo 8MB).'); return; }
    onSelect(selected);
  };

  return (
    <div style={styles.formGroup} id="viaje-field-fotografia">
      <label style={styles.formLabel}>Foto tablero *</label>
      <div style={styles.fotoRow}>
        {localPreview ? (
          <img src={localPreview} alt="" style={{ ...styles.fotoThumb, width: 64, height: 64 }} />
        ) : (
          <div style={{ ...styles.fotoThumb, ...styles.fotoThumbEmpty, width: 64, height: 64 }}>
            <Car size={22} color="#9ca3af" />
          </div>
        )}
        <div style={styles.fotoBtns}>
          <label style={{ ...styles.fotoBtn, ...(error ? styles.inputError : {}) }}>
            <Upload size={14} /> Seleccionar imagen
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
          <label style={{ ...styles.fotoBtn, ...(error ? styles.inputError : {}) }}>
            <Camera size={14} /> Tomar foto
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
        </div>
      </div>
      {error && <span style={styles.errorText}>{error}</span>}
    </div>
  );
}

function NuevoViajeModal({ vehiculos, sedes, onClose, onCreated }: {
  vehiculos: VehiculoCatalogoItem[];
  sedes: SedeOption[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [vehiculoId, setVehiculoId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [kilometrajeActual, setKilometrajeActual] = useState('0');
  const [sitioDestino, setSitioDestino] = useState('');
  const [fotografiaFile, setFotografiaFile] = useState<File | null>(null);
  const [diligencia, setDiligencia] = useState('');
  const [novedad, setNovedad] = useState<'sin' | 'con'>('sin');
  const [novedadDetalle, setNovedadDetalle] = useState('');
  // Se dispara una sola vez, al montar el modal — capturarUbicacion() ya tiene su propio timeout.
  // El guardado espera esta MISMA promesa (no un valor de estado) para que no importe qué tan
  // rápido el usuario llene el formulario y presione Guardar: siempre se espera la respuesta del
  // navegador (o su timeout) antes de enviar el viaje.
  const [sitioOrigenPromise] = useState(() => capturarUbicacion());
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => viajeVehiculoService.createViaje({
      vehiculoId,
      sedeId,
      kilometrajeActual: Number(kilometrajeActual),
      sitioDestino,
      fotografia: await readFileAsDataUrl(fotografiaFile!),
      diligencia,
      sitioOrigen: await sitioOrigenPromise,
      novedadesEstado: novedad === 'con' ? novedadDetalle : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viajes-vehiculo'] });
      onCreated('Viaje agregado');
    },
    onError: (err: any) => {
      setError({ field: 'vehiculo', message: err?.response?.data?.message ?? 'No se pudo guardar el viaje.' });
    },
  });

  const handleGuardar = () => {
    if (!vehiculoId) { setError({ field: 'vehiculo', message: 'Selecciona el vehículo.' }); return; }
    if (!sedeId) { setError({ field: 'sede', message: 'Selecciona la sede.' }); return; }
    if (!kilometrajeActual.trim()) { setError({ field: 'kilometrajeActual', message: 'Ingresa el kilometraje actual.' }); return; }
    if (!sitioDestino.trim()) { setError({ field: 'sitioDestino', message: 'Ingresa el sitio destino.' }); return; }
    if (!fotografiaFile) { setError({ field: 'fotografia', message: 'Selecciona o toma una foto del tablero.' }); return; }
    if (!diligencia.trim()) { setError({ field: 'diligencia', message: 'Ingresa la diligencia.' }); return; }
    if (novedad === 'con' && !novedadDetalle.trim()) { setError({ field: 'novedadDetalle', message: 'Describe la novedad.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`viaje-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo viaje</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Nombre *</label>
            <span style={styles.selectedTag}>{usuarioActual().nombreCompleto ?? '-'}</span>
          </div>

          <div style={styles.formGroup} id="viaje-field-vehiculo">
            <label style={styles.formLabel}>Vehículo *</label>
            <select
              style={{ ...styles.formInput, ...(error?.field === 'vehiculo' ? styles.inputError : {}) }}
              value={vehiculoId}
              onChange={e => { setVehiculoId(e.target.value); setError(null); }}
            >
              <option value="">Selecciona un vehículo...</option>
              {vehiculos.map(v => (
                <option key={v.id} value={v.id}>{v.placas} {v.nombre ? `— ${v.nombre}` : ''}</option>
              ))}
            </select>
            {error?.field === 'vehiculo' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup} id="viaje-field-sede">
            <label style={styles.formLabel}>Sede *</label>
            <select
              style={{ ...styles.formInput, ...(error?.field === 'sede' ? styles.inputError : {}) }}
              value={sedeId}
              onChange={e => { setSedeId(e.target.value); setError(null); }}
            >
              <option value="">Selecciona una sede...</option>
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            {error?.field === 'sede' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup} id="viaje-field-kilometrajeActual">
            <label style={styles.formLabel}>Kilometraje actual *</label>
            <div style={styles.stepperWrap}>
              <input
                type="text"
                inputMode="numeric"
                style={{ ...styles.formInput, paddingRight: '5rem', ...(error?.field === 'kilometrajeActual' ? styles.inputError : {}) }}
                value={kilometrajeActual}
                onChange={e => { setKilometrajeActual(e.target.value.replace(/[^\d]/g, '')); setError(null); }}
              />
              <div style={styles.stepperBtns}>
                <button type="button" style={styles.stepperBtn} onClick={() => setKilometrajeActual(String(Math.max(0, (Number(kilometrajeActual) || 0) - 100)))}>−</button>
                <button type="button" style={styles.stepperBtn} onClick={() => setKilometrajeActual(String((Number(kilometrajeActual) || 0) + 100))}>+</button>
              </div>
            </div>
            {error?.field === 'kilometrajeActual' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup} id="viaje-field-sitioDestino">
            <label style={styles.formLabel}>Sitio destino *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'sitioDestino' ? styles.inputError : {}) }}
              value={sitioDestino}
              onChange={e => { setSitioDestino(sanitizeText(e.target.value)); setError(null); }}
            />
            {error?.field === 'sitioDestino' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <FotoField
            file={fotografiaFile}
            error={error?.field === 'fotografia' ? error.message : undefined}
            onSelect={(file, err) => { setFotografiaFile(file); setError(err ? { field: 'fotografia', message: err } : null); }}
          />

          <div style={styles.formGroup} id="viaje-field-diligencia">
            <label style={styles.formLabel}>Diligencia *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'diligencia' ? styles.inputError : {}) }}
              value={diligencia}
              onChange={e => { setDiligencia(sanitizeText(e.target.value)); setError(null); }}
            />
            {error?.field === 'diligencia' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>¿Hay novedades?</label>
            <div style={styles.pillGrid}>
              <button
                type="button"
                style={{ ...styles.pillBtn, ...(novedad === 'sin' ? styles.pillBtnActive : {}) }}
                onMouseDown={e => e.preventDefault()}
                onClick={e => { setNovedad('sin'); e.currentTarget.blur(); }}
              >
                {novedad === 'sin' ? <CheckCircle size={14} /> : <Circle size={14} />} Sin novedades
              </button>
              <button
                type="button"
                style={{ ...styles.pillBtn, ...(novedad === 'con' ? styles.pillBtnActive : {}) }}
                onMouseDown={e => e.preventDefault()}
                onClick={e => { setNovedad('con'); e.currentTarget.blur(); }}
              >
                {novedad === 'con' ? <CheckCircle size={14} /> : <Circle size={14} />} Con novedades
              </button>
            </div>
          </div>

          {novedad === 'con' && (
            <div style={styles.formGroup} id="viaje-field-novedadDetalle">
              <label style={styles.formLabel}>Describe la novedad *</label>
              <textarea
                ref={autoResizeTextarea}
                style={{ ...styles.formInput, ...styles.textarea, ...(error?.field === 'novedadDetalle' ? styles.inputError : {}) }}
                value={novedadDetalle}
                onChange={e => { setNovedadDetalle(e.target.value); setError(null); autoResizeTextarea(e.target); }}
              />
              {error?.field === 'novedadDetalle' && <span style={styles.errorText}>{error.message}</span>}
            </div>
          )}

          <div style={styles.formActions}>
            <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
            <button style={styles.saveBtn} onClick={handleGuardar} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ViajeRow = memo(({ item, rowNumber, onSelect }: { item: ViajeVehiculoItem; rowNumber: number; onSelect: (item: ViajeVehiculoItem) => void }) => (
  <tr
    style={{ ...styles.tr, cursor: 'pointer' }}
    onClick={() => onSelect(item)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{rowNumber}</td>
    <td style={{ ...styles.td, fontWeight: 700, color: '#4d7a13' }}>{item.id}</td>
    <td style={styles.td}>{formatDateTime(item.marcaTiempo)}</td>
    <td style={styles.td}>{item.conductor ?? '-'}</td>
    <td style={styles.td}>{item.sede ?? '-'}</td>
    <td style={styles.td}><span style={styles.placasCode}>{item.vehiculo ?? '-'}</span></td>
    <td style={{ ...styles.td, textAlign: 'right' as const }}>{formatKm(item.kilometrajeActual)}</td>
    <td style={styles.td}>
      {item.sitioOrigen && esCoordenadaValida(item.sitioOrigen) ? (
        <a
          href={googleMapsUrl(item.sitioOrigen)}
          target="_blank"
          rel="noreferrer"
          style={styles.mapLink}
          onClick={e => e.stopPropagation()}
        >
          <MapPin size={13} /> Ver ubicación
        </a>
      ) : (
        <span>{item.sitioOrigen ?? '-'}</span>
      )}
    </td>
    <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
      {item.sitioDestino ?? '-'}
    </td>
    <td style={styles.td}>
      {item.fotoDisponible ? (
        <ViajeFoto id={item.id} size={36} />
      ) : (
        <span style={{ color: '#9ca3af', fontStyle: 'italic' as const, fontSize: '0.78rem' }}>No disponible</span>
      )}
    </td>
    <td style={{ ...styles.td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
      {item.diligencia ?? '-'}
    </td>
    <td style={{ ...styles.td, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
      {item.novedadesEstado ?? '-'}
    </td>
  </tr>
));

const ViajeCard = memo(({ item, onSelect }: { item: ViajeVehiculoItem; onSelect: (item: ViajeVehiculoItem) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.mobileCardId}>{item.id}</span>
      <span style={styles.mobileCardDate}>{formatDateTime(item.marcaTiempo)}</span>
    </div>
    <div style={styles.mobileCardMainRow}>
      {item.fotoDisponible ? (
        <ViajeFoto id={item.id} size={44} />
      ) : (
        <div style={{ ...styles.mobileCardPhotoEmpty }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardConductor}>{item.conductor ?? 'Sin conductor'}</div>
        <div style={styles.mobileCardSubtext}>
          <span style={styles.placasCode}>{item.vehiculo ?? '-'}</span>
          {item.sede && <> · {item.sede}</>}
        </div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={styles.mobileCardField}>
        <span style={styles.mobileCardFieldLabel}>Km actual</span>
        <span style={styles.mobileCardFieldValue}>{formatKm(item.kilometrajeActual)}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Destino</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.sitioDestino ?? '-'}</span>
      </div>
    </div>
  </div>
));

export default function ControlViajesPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ViajeVehiculoItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = (selected || showCreateModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected, showCreateModal]);

  const { data: vehiculos = [] } = useQuery<VehiculoCatalogoItem[]>({
    queryKey: ['viajes-vehiculos-catalogo'],
    queryFn: () => vehiculoCatalogoService.findAll({ page: 1, limit: 300 }).then(r => r.data),
    enabled: showCreateModal,
  });

  const { data: sedes = [] } = useQuery<SedeOption[]>({
    queryKey: ['viajes-sedes'],
    queryFn: () => programacionesService.getSedes(),
    enabled: showCreateModal,
  });

  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const query = { page, limit: 300, search: search || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['viajes-vehiculo', query],
    queryFn: () => viajeVehiculoService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const items = data?.data ?? [];

  return (
    <Layout>
      <div style={styles.pageWrapper}>
        <button
          type="button"
          onClick={() => navigate('/vehicular')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={{ ...styles.contentCard, ...(isStuck ? styles.contentCardStuck : {}) }}>
          <div style={styles.header}>
            <h1 style={styles.title}>Control de Viajes</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por conductor, placas o diligencia..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Agregar viaje
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${data?.total ?? 0} registros`}</span>
          </div>
        </div>

        <div ref={tableWrapRef} style={styles.tableWrap}>
          {isLoading && items.length === 0 ? (
            <div style={styles.empty}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : isMobile ? (
            <div style={styles.mobileCardList}>
              {items.map(item => (
                <ViajeCard key={item.id} item={item} onSelect={setSelected} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'ID', 'Marca de tiempo', 'Nombre', 'Sede', 'Vehículo', 'Kilometraje actual', 'Sitio origen', 'Sitio destino', 'Foto tablero', 'Diligencia', '¿Hay novedades?'].map((h, i) => (
                    <th key={i} style={{ ...styles.th, textAlign: i === 6 ? 'right' as const : 'left' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <ViajeRow key={item.id} item={item} rowNumber={(page - 1) * 300 + index + 1} onSelect={setSelected} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{ ...styles.pageBtn, ...(page === 1 ? styles.pageBtnDisabled : {}) }}
            >
              <MaterialIcon name="chevron_left" size={16} /> Anterior
            </button>
            <span style={styles.pageLabel}>Página {page} de {data.totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page === data.totalPages}
              style={{ ...styles.pageBtn, ...(page === data.totalPages ? styles.pageBtnDisabled : {}) }}
            >
              Siguiente <MaterialIcon name="chevron_right" size={16} />
            </button>
          </div>
        )}
      </div>

      {selected && <DetalleModal item={selected} onClose={() => setSelected(null)} />}
      {showCreateModal && (
        <NuevoViajeModal
          vehiculos={vehiculos}
          sedes={sedes}
          onClose={() => setShowCreateModal(false)}
          onCreated={msg => { setShowCreateModal(false); setToastMessage(msg); }}
        />
      )}
      <SuccessToast show={!!toastMessage} message={toastMessage ?? ''} onClose={() => setToastMessage(null)} />
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: { padding: '0.05rem 1.5rem 1.5rem' },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.25rem 0.1rem', border: 'none', background: 'transparent', color: '#6b7280', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const, transition: 'color 0.15s ease' },
  contentCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem', position: 'sticky' as const, top: '60px', zIndex: 10, boxShadow: '0 0 0 rgba(0,0,0,0)', transition: 'box-shadow 0.2s ease, border-color 0.2s ease' },
  contentCardStuck: { boxShadow: '0 8px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' },
  header: { marginBottom: '1.25rem' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  toolbar: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' as const },
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '280px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  totalLabel: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '16px', overflowX: 'auto' as const, overflowY: 'auto' as const, maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84375rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.7rem 0.875rem', fontWeight: 500, color: '#9ca3af', fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1 },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f0', verticalAlign: 'middle' as const, color: '#33342a', whiteSpace: 'nowrap' as const },
  tr: { backgroundColor: '#fff', transition: 'background-color 0.15s ease' },
  placasCode: { fontSize: '0.84375rem', fontWeight: 700, color: '#4d7a13' },
  mobileCardList: { display: 'flex', flexDirection: 'column' as const, gap: '0.75rem', padding: '0.75rem' },
  mobileCard: { backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '12px', padding: '0.85rem', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mobileCardTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  mobileCardId: { fontSize: '0.8rem', fontWeight: 700, color: '#4d7a13' },
  mobileCardDate: { fontSize: '0.75rem', color: '#9ca3af' },
  mobileCardMainRow: { display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' },
  mobileCardPhotoEmpty: { width: '44px', height: '44px', borderRadius: '8px', backgroundColor: '#f4f4ee', flexShrink: 0 },
  mobileCardConductor: { fontSize: '0.9rem', fontWeight: 700, color: '#16170f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardSubtext: { fontSize: '0.78rem', color: '#6b7280', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  mobileCardFieldsRow: { display: 'flex', gap: '1.25rem', paddingTop: '0.6rem', borderTop: '1px solid #f3f4f0' },
  mobileCardField: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  mobileCardFieldLabel: { fontSize: '0.65rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  mobileCardFieldValue: { fontSize: '0.82rem', fontWeight: 600, color: '#374151' },
  mapLink: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: '0.8rem' },
  estadoBadge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 },
  estadoActivo: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  estadoInactivo: { backgroundColor: '#f4f4ee', color: '#6b6b60' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  detalleRow: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f' },
  fotoGrande: { width: '100%', maxHeight: '260px', objectFit: 'cover' as const, borderRadius: '10px', border: '1px solid #eeeee6' },
  fotoEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', borderRadius: '10px', backgroundColor: '#f4f4ee', color: '#9ca3af', fontSize: '0.85rem', fontStyle: 'italic' as const },
  mapaFrame: { width: '100%', height: '180px', borderRadius: '10px', border: '1px solid #eeeee6', display: 'block', marginBottom: '0.5rem' },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  textarea: { minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  selectedTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  pillGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pillBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  pillBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  fotoRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  fotoThumb: { borderRadius: '8px', objectFit: 'cover' as const, flexShrink: 0 },
  fotoThumbEmpty: { backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fotoBtns: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  fotoBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' },
};
