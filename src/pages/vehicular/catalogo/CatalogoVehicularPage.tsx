import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus, CheckCircle, Circle, Camera, Upload, Car } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import {
  vehiculoCatalogoService,
  type VehiculoCatalogoItem,
} from '../../../services/vehiculoCatalogo.service';
import { programacionesService, type SedeOption } from '../../../services/programaciones.service';
import { useResponsiveStyles } from '../../../hooks/useResponsiveStyles';

const ESTADOS = ['Activo', 'Inactivo'];
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

// No confiamos en el filtrado nativo de type="number" — filtramos el valor explícitamente, solo dígitos.
const sanitizeInt = (value: string): string => value.replace(/[^\d]/g, '');

// Solo letras/acentos/espacios y puntuación básica de nombres — sin números (Placas y Modelo sí
// necesitan números por su naturaleza y no usan este filtro).
const sanitizeText = (value: string): string => value.replace(/[^A-Za-zÀ-ÿ\s.,'-]/g, '');

const formatKm = (value: number | null): string =>
  value === null || value === undefined ? '-' : `${value.toLocaleString('es-MX')} km`;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function VehiculoFoto({ id, size }: { id: string; size: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    vehiculoCatalogoService.fetchFotoBlob(id).then(blob => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  if (!src) return <div style={{ ...styles.fotoThumb, ...styles.fotoThumbEmpty, width: size, height: size }} />;
  return (
    <img
      src={src}
      alt=""
      style={{ ...styles.fotoThumb, width: size, height: size, cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); window.open(src, '_blank'); }}
    />
  );
}

const VehiculoRow = memo(({ item, rowNumber, onSelect }: { item: VehiculoCatalogoItem; rowNumber: number; onSelect: (item: VehiculoCatalogoItem) => void }) => (
  <tr
    style={styles.tr}
    onClick={() => onSelect(item)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{rowNumber}</td>
    <td style={styles.td}><span style={styles.placasCode}>{item.placas ?? '-'}</span></td>
    <td style={styles.td}>{item.nombre ?? '-'}</td>
    <td style={styles.td}>{item.marca ?? '-'}</td>
    <td style={styles.td}>{item.modelo ?? '-'}</td>
    <td style={styles.td}>
      {item.fotoDisponible ? (
        <VehiculoFoto id={item.id} size={36} />
      ) : (
        <span style={{ color: '#9ca3af', fontStyle: 'italic' as const, fontSize: '0.78rem' }}>No disponible</span>
      )}
    </td>
    <td style={{ ...styles.td, textAlign: 'right' as const }}>{formatKm(item.kmActual)}</td>
    <td style={styles.td}>{item.sedeNombre ?? '-'}</td>
    <td style={styles.td}>
      <span style={{ ...styles.estadoBadge, ...(item.estado === 'Activo' ? styles.estadoActivo : styles.estadoInactivo) }}>
        {item.estado ?? '-'}
      </span>
    </td>
  </tr>
));

const VehiculoCard = memo(({ item, onSelect }: { item: VehiculoCatalogoItem; onSelect: (item: VehiculoCatalogoItem) => void }) => (
  <div style={styles.mobileCard} onClick={() => onSelect(item)}>
    <div style={styles.mobileCardTopRow}>
      <span style={styles.placasCode}>{item.placas ?? '-'}</span>
      <span style={{ ...styles.estadoBadge, ...(item.estado === 'Activo' ? styles.estadoActivo : styles.estadoInactivo) }}>
        {item.estado ?? '-'}
      </span>
    </div>
    <div style={styles.mobileCardMainRow}>
      {item.fotoDisponible ? (
        <VehiculoFoto id={item.id} size={44} />
      ) : (
        <div style={styles.mobileCardPhotoEmpty} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={styles.mobileCardConductor}>{item.nombre ?? '-'}</div>
        <div style={styles.mobileCardSubtext}>{[item.marca, item.modelo].filter(Boolean).join(' ') || '-'}</div>
      </div>
    </div>
    <div style={styles.mobileCardFieldsRow}>
      <div style={styles.mobileCardField}>
        <span style={styles.mobileCardFieldLabel}>Km actual</span>
        <span style={styles.mobileCardFieldValue}>{formatKm(item.kmActual)}</span>
      </div>
      <div style={{ ...styles.mobileCardField, flex: 1, minWidth: 0 }}>
        <span style={styles.mobileCardFieldLabel}>Sede</span>
        <span style={{ ...styles.mobileCardFieldValue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.sedeNombre ?? '-'}</span>
      </div>
    </div>
  </div>
));

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleRow}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

function SedePicker({ value, onSelect, sedes }: { value: string; onSelect: (id: string) => void; sedes: SedeOption[] }) {
  return (
    <div style={styles.formGroup}>
      <label style={styles.formLabel}>Sede *</label>
      <div style={styles.pillGrid}>
        {sedes.map(s => (
          <button
            key={s.id}
            type="button"
            style={{ ...styles.pillBtn, ...(value === s.id ? styles.pillBtnActive : {}) }}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { onSelect(value === s.id ? '' : s.id); e.currentTarget.blur(); }}
          >
            {value === s.id ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
            {s.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}

function EstadoPicker({ value, onSelect }: { value: string; onSelect: (estado: string) => void }) {
  return (
    <div style={styles.formGroup}>
      <label style={styles.formLabel}>Estado *</label>
      <div style={styles.pillGrid}>
        {ESTADOS.map(e => (
          <button
            key={e}
            type="button"
            style={{ ...styles.pillBtn, ...(value === e ? styles.pillBtnActive : {}) }}
            onMouseDown={ev => ev.preventDefault()}
            onClick={ev => { onSelect(e); ev.currentTarget.blur(); }}
          >
            {value === e ? <CheckCircle size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0 }} />}
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function FotoField({ file, existingId, required, error, onSelect }: {
  file: File | null;
  existingId: string | null;
  required: boolean;
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
    <div style={styles.formGroup} id="vehiculo-field-fotografia">
      <label style={styles.formLabel}>Fotografía {required ? '*' : ''}</label>
      <div style={styles.fotoRow}>
        {localPreview ? (
          <img src={localPreview} alt="" style={{ ...styles.fotoThumb, width: 64, height: 64 }} />
        ) : existingId ? (
          <VehiculoFoto id={existingId} size={64} />
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

function VehiculoForm({ placas, nombre, marca, modelo, kmActual, sedeId, estado, fotografiaFile, existingFotoId, fotografiaRequired, error, sedes, onChange, onFotografiaChange }: {
  placas: string; nombre: string; marca: string; modelo: string; kmActual: string; sedeId: string; estado: string;
  fotografiaFile: File | null; existingFotoId: string | null; fotografiaRequired: boolean;
  error: { field: string; message: string } | null;
  sedes: SedeOption[];
  onChange: (patch: Partial<{ placas: string; nombre: string; marca: string; modelo: string; kmActual: string; sedeId: string; estado: string }>) => void;
  onFotografiaChange: (file: File | null, error?: string) => void;
}) {
  return (
    <>
      <div style={styles.formGroup} id="vehiculo-field-placas">
        <label style={styles.formLabel}>Placas *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'placas' ? styles.inputError : {}) }}
          value={placas}
          onChange={e => onChange({ placas: e.target.value.toUpperCase() })}
        />
        {error?.field === 'placas' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="vehiculo-field-nombre">
        <label style={styles.formLabel}>Nombre *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'nombre' ? styles.inputError : {}) }}
          value={nombre}
          onChange={e => onChange({ nombre: sanitizeText(e.target.value) })}
        />
        {error?.field === 'nombre' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="vehiculo-field-marca">
        <label style={styles.formLabel}>Marca *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'marca' ? styles.inputError : {}) }}
          value={marca}
          onChange={e => onChange({ marca: sanitizeText(e.target.value) })}
        />
        {error?.field === 'marca' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="vehiculo-field-modelo">
        <label style={styles.formLabel}>Modelo *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'modelo' ? styles.inputError : {}) }}
          value={modelo}
          onChange={e => onChange({ modelo: e.target.value })}
        />
        {error?.field === 'modelo' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <FotoField
        file={fotografiaFile}
        existingId={existingFotoId}
        required={fotografiaRequired}
        error={error?.field === 'fotografia' ? error.message : undefined}
        onSelect={onFotografiaChange}
      />

      <div style={styles.formGroup} id="vehiculo-field-kmActual">
        <label style={styles.formLabel}>Km actual *</label>
        <div style={styles.stepperWrap}>
          <input
            type="text"
            inputMode="numeric"
            style={{ ...styles.formInput, paddingRight: '5rem', ...(error?.field === 'kmActual' ? styles.inputError : {}) }}
            placeholder="0"
            value={kmActual}
            onChange={e => onChange({ kmActual: sanitizeInt(e.target.value) })}
          />
          <div style={styles.stepperBtns}>
            <button type="button" style={styles.stepperBtn} onClick={() => onChange({ kmActual: String(Math.max(0, (Number(kmActual) || 0) - 100)) })}>−</button>
            <button type="button" style={styles.stepperBtn} onClick={() => onChange({ kmActual: String((Number(kmActual) || 0) + 100) })}>+</button>
          </div>
        </div>
        {error?.field === 'kmActual' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div id="vehiculo-field-sedeId">
        <SedePicker value={sedeId} onSelect={id => onChange({ sedeId: id })} sedes={sedes} />
        {error?.field === 'sedeId' && <span style={styles.errorText}>{error.message}</span>}
      </div>
      <EstadoPicker value={estado} onSelect={e => onChange({ estado: e })} />
    </>
  );
}

function DetalleModal({ item, sedes, onClose, onUpdated, onDeleted }: {
  item: VehiculoCatalogoItem;
  sedes: SedeOption[];
  onClose: () => void;
  onUpdated: (message: string, updated: VehiculoCatalogoItem) => void;
  onDeleted: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMoreMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMoreMenu]);

  const [placas, setPlacas] = useState(item.placas ?? '');
  const [nombre, setNombre] = useState(item.nombre ?? '');
  const [marca, setMarca] = useState(item.marca ?? '');
  const [modelo, setModelo] = useState(item.modelo ?? '');
  const [kmActual, setKmActual] = useState(item.kmActual !== null ? String(item.kmActual) : '');
  const [sedeId, setSedeId] = useState(item.sedeId ?? '');
  const [estado, setEstado] = useState(item.estado ?? 'Activo');
  const [fotografiaFile, setFotografiaFile] = useState<File | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const startEditing = () => {
    setPlacas(item.placas ?? '');
    setNombre(item.nombre ?? '');
    setMarca(item.marca ?? '');
    setModelo(item.modelo ?? '');
    setKmActual(item.kmActual !== null ? String(item.kmActual) : '');
    setSedeId(item.sedeId ?? '');
    setEstado(item.estado ?? 'Activo');
    setFotografiaFile(null);
    setError(null);
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => vehiculoCatalogoService.updateVehiculo(item.id, {
      placas,
      nombre: nombre || undefined,
      marca: marca || undefined,
      modelo: modelo || undefined,
      fotografia: fotografiaFile ? await readFileAsDataUrl(fotografiaFile) : undefined,
      kmActual: kmActual.trim() !== '' ? Number(kmActual) : undefined,
      sedeId: sedeId || undefined,
      estado: estado || undefined,
    }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['vehiculos-catalogo'] });
      setEditing(false);
      onUpdated('Vehículo actualizado', updated);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => vehiculoCatalogoService.deleteVehiculo(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehiculos-catalogo'] });
      onDeleted('Vehículo eliminado');
    },
  });

  const handleGuardar = () => {
    if (!placas.trim()) { setError({ field: 'placas', message: 'Ingresa las placas del vehículo.' }); return; }
    setError(null);
    updateMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`vehiculo-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Vehículo</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!editing && !confirmDelete && (
              <div style={{ position: 'relative' as const }} ref={moreMenuRef}>
                <button
                  className="btn-press header-btn-secondary"
                  style={styles.iconMenuBtn}
                  onClick={() => setShowMoreMenu(o => !o)}
                >
                  <MaterialIcon name="more_horiz" size={20} />
                </button>
                {showMoreMenu && (
                  <div style={styles.moreMenu}>
                    <button
                      style={styles.moreMenuItem}
                      onClick={() => { setShowMoreMenu(false); startEditing(); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f4f4ee'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="edit" size={17} />
                      Editar
                    </button>
                    <div style={styles.moreMenuDivider} />
                    <button
                      style={{ ...styles.moreMenuItem, ...styles.moreMenuItemDanger }}
                      onClick={() => { setShowMoreMenu(false); setConfirmDelete(true); }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fdf0ec'; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <MaterialIcon name="delete" size={17} />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={styles.modalBody}>
          {confirmDelete ? (
            <div style={styles.confirmBox}>
              <span style={{ fontWeight: 600, color: '#16170f' }}>¿Eliminar el vehículo <strong>{item.placas ?? item.id}</strong>? Esta acción no se puede deshacer.</span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ) : editing ? (
            <>
              <VehiculoForm
                placas={placas} nombre={nombre} marca={marca} modelo={modelo} kmActual={kmActual} sedeId={sedeId} estado={estado}
                fotografiaFile={fotografiaFile} existingFotoId={item.fotoDisponible ? item.id : null} fotografiaRequired={false}
                error={error} sedes={sedes}
                onChange={patch => {
                  if (patch.placas !== undefined) setPlacas(patch.placas);
                  if (patch.nombre !== undefined) setNombre(patch.nombre);
                  if (patch.marca !== undefined) setMarca(patch.marca);
                  if (patch.modelo !== undefined) setModelo(patch.modelo);
                  if (patch.kmActual !== undefined) setKmActual(patch.kmActual);
                  if (patch.sedeId !== undefined) setSedeId(patch.sedeId);
                  if (patch.estado !== undefined) setEstado(patch.estado);
                  setError(null);
                }}
                onFotografiaChange={(file, err) => { setFotografiaFile(file); setError(err ? { field: 'fotografia', message: err } : null); }}
              />
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancelar</button>
                <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <DetalleRow label="Fotografía">
                {item.fotoDisponible ? (
                  <VehiculoFoto id={item.id} size={96} />
                ) : (
                  <span style={{ color: '#9ca3af', fontStyle: 'italic' as const, fontSize: '0.8rem' }}>No disponible</span>
                )}
              </DetalleRow>
              <DetalleRow label="Placas"><span style={styles.placasCode}>{item.placas ?? '-'}</span></DetalleRow>
              <DetalleRow label="Nombre">{item.nombre ?? '-'}</DetalleRow>
              <DetalleRow label="Marca">{item.marca ?? '-'}</DetalleRow>
              <DetalleRow label="Modelo">{item.modelo ?? '-'}</DetalleRow>
              <DetalleRow label="Km actual">{formatKm(item.kmActual)}</DetalleRow>
              <DetalleRow label="Sede">{item.sedeNombre ?? '-'}</DetalleRow>
              <DetalleRow label="Estado">
                <span style={{ ...styles.estadoBadge, ...(item.estado === 'Activo' ? styles.estadoActivo : styles.estadoInactivo) }}>
                  {item.estado ?? '-'}
                </span>
              </DetalleRow>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NuevoVehiculoModal({ sedes, onClose, onCreated }: {
  sedes: SedeOption[];
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [placas, setPlacas] = useState('');
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [kmActual, setKmActual] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [estado, setEstado] = useState('Activo');
  const [fotografiaFile, setFotografiaFile] = useState<File | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => vehiculoCatalogoService.createVehiculo({
      placas,
      nombre,
      marca,
      modelo,
      fotografia: await readFileAsDataUrl(fotografiaFile!),
      kmActual: Number(kmActual),
      sedeId,
      estado,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehiculos-catalogo'] });
      onCreated('Vehículo agregado');
    },
    onError: (err: any) => {
      setError({ field: 'placas', message: err?.response?.data?.message ?? 'No se pudo guardar el vehículo.' });
    },
  });

  const handleGuardar = () => {
    if (!placas.trim()) { setError({ field: 'placas', message: 'Ingresa las placas del vehículo.' }); return; }
    if (!nombre.trim()) { setError({ field: 'nombre', message: 'Ingresa el nombre del vehículo.' }); return; }
    if (!marca.trim()) { setError({ field: 'marca', message: 'Ingresa la marca.' }); return; }
    if (!modelo.trim()) { setError({ field: 'modelo', message: 'Ingresa el modelo.' }); return; }
    if (!fotografiaFile) { setError({ field: 'fotografia', message: 'Selecciona o toma una fotografía del vehículo.' }); return; }
    if (!kmActual.trim()) { setError({ field: 'kmActual', message: 'Ingresa el kilometraje actual.' }); return; }
    if (!sedeId) { setError({ field: 'sedeId', message: 'Selecciona la sede.' }); return; }
    if (!estado) { setError({ field: 'estado', message: 'Selecciona el estado.' }); return; }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`vehiculo-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo vehículo</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <VehiculoForm
            placas={placas} nombre={nombre} marca={marca} modelo={modelo} kmActual={kmActual} sedeId={sedeId} estado={estado}
            fotografiaFile={fotografiaFile} existingFotoId={null} fotografiaRequired
            error={error} sedes={sedes}
            onChange={patch => {
              if (patch.placas !== undefined) setPlacas(patch.placas);
              if (patch.nombre !== undefined) setNombre(patch.nombre);
              if (patch.marca !== undefined) setMarca(patch.marca);
              if (patch.modelo !== undefined) setModelo(patch.modelo);
              if (patch.kmActual !== undefined) setKmActual(patch.kmActual);
              if (patch.sedeId !== undefined) setSedeId(patch.sedeId);
              if (patch.estado !== undefined) setEstado(patch.estado);
              setError(null);
            }}
            onFotografiaChange={(file, err) => { setFotografiaFile(file); setError(err ? { field: 'fotografia', message: err } : null); }}
          />
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

export default function CatalogoVehicularPage() {
  const { isMobile } = useResponsiveStyles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<VehiculoCatalogoItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  useSmoothWheelScroll(tableWrapRef, [], 3);

  useEffect(() => {
    document.body.style.overflow = (selected || showCreateModal) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selected, showCreateModal]);

  const [isStuck, setIsStuck] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsStuck(window.scrollY > 4);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const query = { page, limit: 300, search: search || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['vehiculos-catalogo', query],
    queryFn: () => vehiculoCatalogoService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const { data: sedes = [] } = useQuery<SedeOption[]>({
    queryKey: ['vehiculos-sedes'],
    queryFn: () => programacionesService.getSedes(),
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
            <h1 style={styles.title}>Catálogo Vehicular</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por placas, nombre o marca..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nuevo vehículo
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
                <VehiculoCard key={item.id} item={item} onSelect={setSelected} />
              ))}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'Placas', 'Nombre', 'Marca', 'Modelo', 'Fotografía', 'Km actual', 'Sede', 'Estado'].map((h, i) => (
                    <th key={i} style={{ ...styles.th, textAlign: i === 6 ? 'right' as const : 'left' as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <VehiculoRow key={item.id} item={item} rowNumber={(page - 1) * 300 + index + 1} onSelect={setSelected} />
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

      {selected && (
        <DetalleModal
          item={selected}
          sedes={sedes}
          onClose={() => setSelected(null)}
          onUpdated={(msg, updated) => { setSelected(updated); setToastMessage(msg); }}
          onDeleted={msg => { setSelected(null); setToastMessage(msg); }}
        />
      )}
      {showCreateModal && (
        <NuevoVehiculoModal
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
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f0', verticalAlign: 'middle' as const, color: '#33342a' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  placasCode: { fontSize: '0.84375rem', fontWeight: 700, color: '#4d7a13' },
  estadoBadge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 },
  estadoActivo: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  estadoInactivo: { backgroundColor: '#f4f4ee', color: '#6b6b60' },
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
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  deleteBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  confirmBox: { display: 'flex', flexDirection: 'column' as const, gap: '1rem', padding: '1rem', backgroundColor: '#fdf0ec', border: '1px solid #f3cfc2', borderRadius: '10px' },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  pillGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pillBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  pillBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  stepperWrap: { position: 'relative' as const },
  stepperBtns: { position: 'absolute' as const, right: '0.5rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '0.35rem' },
  stepperBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1.75rem', height: '1.75rem', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#fff', color: '#374151', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', lineHeight: 1 },
  fotoRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  fotoThumb: { borderRadius: '8px', objectFit: 'cover' as const, flexShrink: 0 },
  fotoThumbEmpty: { backgroundColor: '#f4f4ee', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  fotoBtns: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  fotoBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' },
};
