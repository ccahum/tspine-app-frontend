import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, X, Plus, CheckCircle, Circle } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import { MaterialIcon } from '../../../components/icons/MaterialIcon';
import SuccessToast from '../../../components/SuccessToast';
import { useSmoothWheelScroll } from '../../../hooks/useSmoothWheelScroll';
import {
  tercerosAdminService,
  CLASIFICACIONES_TERCERO,
  TIPOS_CONTACTO,
  TIPOS_CUENTA,
  type TerceroItem,
  type ClasificacionTercero,
  type TercerosCatalogos,
  type TipoContacto,
  type TipoDeCuenta,
  type TipoCuenta,
  type CreateTerceroContactoPayload,
  type CreateTerceroCuentaPayload,
  type TerceroContactoItem,
  type TerceroCuentaItem,
} from '../../../services/tercerosAdmin.service';

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

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateString;
  }
};

const CLASIFICACION_LABEL: Record<ClasificacionTercero, string> = {
  PARTICULAR: 'Particular', DISTRIBUIDOR: 'Distribuidor', ASEGURADORA: 'Aseguradora',
  CLIENTE: 'Cliente', EMPLEADO: 'Empleado', HOSPITAL: 'Hospital', DOCTOR: 'Doctor',
  COMISIONISTA: 'Comisionista', INVERSIONISTA: 'Inversionista', EMPRESA: 'Empresa',
  PROVEEDOR: 'Proveedor', SEDE: 'Sede', ALMACEN: 'Almacén', GRUPO: 'Grupo', OTROS: 'Otros',
};

// Solo letras/acentos/espacios y puntuación básica de nombres — sin números.
const sanitizeText = (value: string): string => value.replace(/[^A-Za-zÀ-ÿ\s.,'-]/g, '');
const sanitizeInt = (value: string): string => value.replace(/[^\d]/g, '');

const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

const usuarioActual = (): { correo?: string | null } => {
  try {
    return JSON.parse(localStorage.getItem('usuario') ?? '{}');
  } catch {
    return {};
  }
};

const TerceroRow = memo(({ item, rowNumber, onSelect }: { item: TerceroItem; rowNumber: number; onSelect: (item: TerceroItem) => void }) => (
  <tr
    style={styles.tr}
    onClick={() => onSelect(item)}
    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f9fafb'; }}
    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fff'; }}
  >
    <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600, color: '#9ca3af', width: '40px' }}>{rowNumber}</td>
    <td style={styles.td}>{item.nombreCompleto}</td>
    <td style={styles.td}>{item.correo ?? '-'}</td>
    <td style={{ ...styles.td, maxWidth: '280px' }}>
      {item.clasificaciones.length === 0 ? (
        <span style={{ color: '#9ca3af', fontStyle: 'italic' as const }}>-</span>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.3rem' }}>
          {item.clasificaciones.map(c => (
            <span key={c} style={styles.clasifBadge}>{CLASIFICACION_LABEL[c]}</span>
          ))}
        </div>
      )}
    </td>
    <td style={styles.td}>{item.tipoContacto === null ? '-' : item.tipoContacto ? 'Externo' : 'Interno'}</td>
    <td style={styles.td}>{item.tipoPersona === null ? '-' : item.tipoPersona ? 'Moral' : 'Física'}</td>
    <td style={styles.td}>
      <span style={{ ...styles.estadoBadge, ...(item.activo ? styles.estadoActivo : styles.estadoInactivo) }}>
        {item.activo ? 'Activo' : 'Inactivo'}
      </span>
    </td>
  </tr>
));

function DetalleRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.detalleRow}>
      <span style={styles.detalleLabel}>{label}</span>
      <span style={styles.detalleValue}>{children}</span>
    </div>
  );
}

function detalleToForm(detalle: TerceroDetail): TerceroFormState {
  return {
    tipoContacto: detalle.tipoContacto ?? false,
    tipoPersona: detalle.tipoPersona ?? false,
    primerNombre: detalle.primerNombre ?? '',
    segundoNombre: detalle.segundoNombre ?? '',
    primerApellido: detalle.primerApellido ?? '',
    segundoApellido: detalle.segundoApellido ?? '',
    nombreCompleto: detalle.nombreCompleto ?? '',
    nombreComercial: detalle.nombreComercial ?? '',
    ciudadId: detalle.ciudadId ?? '',
    estadoId: detalle.estadoId ?? '',
    paisId: detalle.paisId ?? '',
    observaciones: detalle.observaciones ?? '',
    clasificaciones: detalle.clasificaciones,
    mir: detalle.mir ?? false,
    rfc: detalle.datosFiscales?.rfc ?? '',
    razonSocial: detalle.datosFiscales?.razonSocial ?? '',
    regimenFiscalId: detalle.datosFiscales?.regimenFiscalId ?? '',
    codigoPostalFiscal: detalle.datosFiscales?.codigoPostalFiscal ?? '',
    usoCfdiId: detalle.datosFiscales?.usoCfdiId ?? '',
    direccionFiscal: detalle.datosFiscales?.direccionFiscal ?? '',
    grupo: detalle.grupo,
    activo: detalle.activo,
    agregarFacturacion: !!(
      detalle.datosFiscales?.rfc || detalle.datosFiscales?.razonSocial || detalle.datosFiscales?.regimenFiscalId
      || detalle.datosFiscales?.codigoPostalFiscal || detalle.datosFiscales?.usoCfdiId || detalle.datosFiscales?.direccionFiscal
    ),
  };
}

function DetalleModal({ item, onClose, onUpdated }: { item: TerceroItem; onClose: () => void; onUpdated: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<TerceroFormState>(emptyTerceroForm);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [agregarContacto, setAgregarContacto] = useState(false);
  const [contactoForm, setContactoForm] = useState<CreateTerceroContactoPayload>({ tipo: 'Teléfono', dato: '', personaContacto: '', notas: '', principal: false });
  const [agregarCuenta, setAgregarCuenta] = useState(false);
  const [cuentaForm, setCuentaForm] = useState<CreateTerceroCuentaPayload>({ tipoDeCuenta: 'Interna', tipo: 'Efectivo', bancoId: '', noDeCuenta: '', clabeInterbancaria: '' });

  const { data: detalle, isLoading } = useQuery({
    queryKey: ['tercero-detalle', item.id],
    queryFn: () => tercerosAdminService.findOne(item.id),
  });

  const { data: catalogos } = useQuery<TercerosCatalogos>({
    queryKey: ['terceros-catalogos'],
    queryFn: () => tercerosAdminService.getCatalogos(),
    enabled: editing,
  });

  useEffect(() => {
    if (!showMoreMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showMoreMenu]);

  const updateForm = (patch: Partial<TerceroFormState>) => { setForm(f => ({ ...f, ...patch })); setError(null); };

  const startEditing = () => {
    if (!detalle) return;
    setForm(detalleToForm(detalle));
    setError(null);
    setAgregarContacto(false);
    setContactoForm({ tipo: 'Teléfono', dato: '', personaContacto: '', notas: '', principal: false });
    setAgregarCuenta(false);
    setCuentaForm({ tipoDeCuenta: 'Interna', tipo: 'Efectivo', bancoId: '', noDeCuenta: '', clabeInterbancaria: '' });
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      await tercerosAdminService.updateTercero(item.id, {
        tipoContacto: form.tipoContacto,
        tipoPersona: form.tipoPersona,
        primerNombre: form.primerNombre.trim(),
        segundoNombre: form.tipoPersona ? undefined : (form.segundoNombre.trim() || undefined),
        primerApellido: form.tipoPersona ? undefined : (form.primerApellido.trim() || undefined),
        segundoApellido: form.tipoPersona ? undefined : (form.segundoApellido.trim() || undefined),
        nombreCompleto: form.nombreCompleto.trim() || undefined,
        nombreComercial: form.nombreComercial.trim() || undefined,
        ciudadId: form.ciudadId || undefined,
        estadoId: form.estadoId || undefined,
        paisId: form.paisId || undefined,
        observaciones: form.observaciones.trim() || undefined,
        clasificaciones: form.clasificaciones,
        mir: form.mir,
        grupo: form.grupo,
        activo: form.activo,
        datosFiscales: datosFiscalesFromForm(form),
      });
      const esEfectivo = cuentaForm.tipo === 'Efectivo';
      await Promise.all([
        ...(agregarContacto ? [tercerosAdminService.createContacto(item.id, {
          tipo: contactoForm.tipo,
          dato: contactoForm.dato.trim(),
          personaContacto: contactoForm.personaContacto?.trim() || undefined,
          notas: contactoForm.notas?.trim() || undefined,
          principal: contactoForm.principal,
        })] : []),
        ...(agregarCuenta ? [tercerosAdminService.createCuenta(item.id, {
          tipoDeCuenta: cuentaForm.tipoDeCuenta,
          tipo: cuentaForm.tipo,
          bancoId: esEfectivo ? undefined : cuentaForm.bancoId,
          noDeCuenta: esEfectivo ? undefined : cuentaForm.noDeCuenta?.trim(),
          clabeInterbancaria: esEfectivo ? undefined : (cuentaForm.clabeInterbancaria?.trim() || undefined),
        })] : []),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terceros-admin'] });
      queryClient.invalidateQueries({ queryKey: ['tercero-detalle', item.id] });
      setEditing(false);
      onUpdated('Tercero actualizado');
    },
    onError: (err: any) => {
      setError({ field: 'primerNombre', message: err?.response?.data?.message ?? 'No se pudo actualizar el tercero.' });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => tercerosAdminService.updateTercero(item.id, { activo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terceros-admin'] });
      queryClient.invalidateQueries({ queryKey: ['tercero-detalle', item.id] });
      onUpdated('Tercero marcado como inactivo');
      onClose();
    },
  });

  const handleGuardar = () => {
    if (!form.primerNombre.trim()) { setError({ field: 'primerNombre', message: 'Ingresa el primer nombre.' }); return; }
    if (!form.paisId) { setError({ field: 'paisId', message: 'Selecciona el país.' }); return; }
    if (!form.estadoId) { setError({ field: 'estadoId', message: 'Selecciona el estado.' }); return; }
    if (!form.ciudadId) { setError({ field: 'ciudadId', message: 'Selecciona la ciudad.' }); return; }
    if (!form.tipoPersona) {
      if (!form.segundoNombre.trim()) { setError({ field: 'segundoNombre', message: 'Ingresa el segundo nombre.' }); return; }
      if (!form.primerApellido.trim()) { setError({ field: 'primerApellido', message: 'Ingresa el primer apellido.' }); return; }
      if (!form.segundoApellido.trim()) { setError({ field: 'segundoApellido', message: 'Ingresa el segundo apellido.' }); return; }
    }
    if (form.agregarFacturacion) {
      if (!form.rfc.trim()) { setError({ field: 'rfc', message: 'Ingresa el RFC.' }); return; }
      if (!form.razonSocial.trim()) { setError({ field: 'razonSocial', message: 'Ingresa la razón social.' }); return; }
      if (!form.regimenFiscalId) { setError({ field: 'regimenFiscalId', message: 'Selecciona el régimen fiscal.' }); return; }
      if (!form.codigoPostalFiscal.trim()) { setError({ field: 'codigoPostalFiscal', message: 'Ingresa el código postal fiscal.' }); return; }
      if (!form.usoCfdiId) { setError({ field: 'usoCfdiId', message: 'Selecciona el uso CFDI.' }); return; }
      if (!form.direccionFiscal.trim()) { setError({ field: 'direccionFiscal', message: 'Ingresa la dirección fiscal.' }); return; }
    }
    if (agregarContacto) {
      if (!contactoForm.dato.trim()) { setError({ field: 'contactoDato', message: 'Ingresa este dato.' }); return; }
      if (!contactoForm.personaContacto?.trim()) { setError({ field: 'personaContacto', message: 'Ingresa la persona de contacto.' }); return; }
    }
    if (agregarCuenta) {
      if (!cuentaForm.tipoDeCuenta) { setError({ field: 'cuentaTipoDeCuenta', message: 'Selecciona el tipo de cuenta.' }); return; }
      if (!cuentaForm.tipo) { setError({ field: 'cuentaTipo', message: 'Selecciona el tipo.' }); return; }
      if (cuentaForm.tipo !== 'Efectivo') {
        if (!cuentaForm.bancoId) { setError({ field: 'cuentaBanco', message: 'Selecciona el banco o caja.' }); return; }
        if (!cuentaForm.noDeCuenta?.trim()) { setError({ field: 'cuentaNoDeCuenta', message: 'Ingresa el número de cuenta.' }); return; }
      }
    }
    setError(null);
    updateMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`tercero-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{item.nombreCompleto}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!editing && !confirmDelete && detalle && (
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
          {isLoading || !detalle ? (
            <div style={styles.empty}>Cargando...</div>
          ) : confirmDelete ? (
            <div style={styles.confirmBox}>
              <span style={{ fontWeight: 600, color: '#16170f' }}>
                ¿Marcar como <strong>inactivo</strong> a <strong>{detalle.nombreCompleto}</strong>? No se borra de la base de datos — solo deja de contar como activo. Puedes reactivarlo después editándolo.
              </span>
              <div style={styles.formActions}>
                <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button style={styles.deleteBtn} onClick={() => deactivateMutation.mutate()} disabled={deactivateMutation.isPending}>
                  {deactivateMutation.isPending ? 'Guardando...' : 'Marcar inactivo'}
                </button>
              </div>
            </div>
          ) : editing ? (
            catalogos ? (
              <>
                <TerceroFormFields
                  form={form}
                  onChange={updateForm}
                  catalogos={catalogos}
                  error={error}
                  extraSections={
                    <>
                      <span style={styles.sectionHeader}>Datos de contacto</span>
                      {detalle.contactos.length === 0 ? (
                        <span style={styles.subListEmpty}>Sin datos de contacto registrados.</span>
                      ) : (
                        <div style={styles.subList}>
                          {detalle.contactos.map(c => (
                            <ContactoListItem key={c.id} terceroId={item.id} contacto={c} />
                          ))}
                        </div>
                      )}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>¿Agregar un nuevo dato de contacto?</label>
                        <SiNoPicker value={agregarContacto} onChange={setAgregarContacto} />
                      </div>
                      {agregarContacto && (
                        <ContactoFields
                          value={contactoForm}
                          onChange={patch => { setContactoForm(f => ({ ...f, ...patch })); setError(null); }}
                          error={error}
                        />
                      )}

                      <span style={styles.sectionHeader}>Datos bancarios</span>
                      {detalle.cuentas.length === 0 ? (
                        <span style={styles.subListEmpty}>Sin cuentas bancarias registradas.</span>
                      ) : (
                        <div style={styles.subList}>
                          {detalle.cuentas.map(c => (
                            <CuentaListItem key={c.id} terceroId={item.id} cuenta={c} />
                          ))}
                        </div>
                      )}
                      <div style={styles.formGroup}>
                        <label style={styles.formLabel}>¿Agregar una nueva cuenta bancaria?</label>
                        <SiNoPicker value={agregarCuenta} onChange={setAgregarCuenta} />
                      </div>
                      {agregarCuenta && (
                        <CuentaFields
                          value={cuentaForm}
                          catalogos={catalogos}
                          onChange={patch => { setCuentaForm(f => ({ ...f, ...patch })); setError(null); }}
                          error={error}
                        />
                      )}
                    </>
                  }
                />
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Activo</label>
                  <SiNoPicker value={form.activo} onChange={v => updateForm({ activo: v })} />
                </div>
                <div style={styles.formActions}>
                  <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancelar</button>
                  <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : (
              <div style={styles.empty}>Cargando catálogos...</div>
            )
          ) : (
            <>
              <span style={styles.sectionHeader}>Datos principales</span>
              <div style={styles.optionalBox}>
                <DetalleRow label="Nombre completo">{detalle.nombreCompleto}</DetalleRow>
                <DetalleRow label="Primer nombre">{detalle.primerNombre ?? '-'}</DetalleRow>
                <DetalleRow label="Nombre comercial">{detalle.nombreComercial ?? '-'}</DetalleRow>
                <DetalleRow label="Correo">{detalle.correo ?? '-'}</DetalleRow>
                <DetalleRow label="Tipo de contacto">{detalle.tipoContacto === null ? '-' : detalle.tipoContacto ? 'Externo' : 'Interno'}</DetalleRow>
                <DetalleRow label="Tipo de persona">{detalle.tipoPersona === null ? '-' : detalle.tipoPersona ? 'Moral' : 'Física'}</DetalleRow>
                <DetalleRow label="Ciudad">{detalle.ciudad ?? '-'}</DetalleRow>
                <DetalleRow label="Estado">{detalle.estado ?? '-'}</DetalleRow>
                <DetalleRow label="País">{detalle.pais ?? '-'}</DetalleRow>
                <DetalleRow label="Observaciones">{detalle.observaciones ?? '-'}</DetalleRow>
                <DetalleRow label="¿MIR?">{detalle.mir ? 'Sí' : 'No'}</DetalleRow>
                <DetalleRow label="Registrado por">{detalle.creadoPor ?? '-'}</DetalleRow>
                <DetalleRow label="Registrado el">{formatDateTime(detalle.creadoEn)}</DetalleRow>
                <DetalleRow label="Activo">
                  <span style={{ ...styles.estadoBadge, ...(detalle.activo ? styles.estadoActivo : styles.estadoInactivo) }}>
                    {detalle.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </DetalleRow>
              </div>

              <span style={styles.sectionHeader}>Datos de contacto</span>
              {detalle.contactos.length === 0 ? (
                <span style={styles.subListEmpty}>Sin datos de contacto registrados.</span>
              ) : (
                <div style={styles.subList}>
                  {detalle.contactos.map(c => (
                    <ContactoListItem key={c.id} terceroId={item.id} contacto={c} />
                  ))}
                </div>
              )}

              <span style={styles.sectionHeader}>Otros datos</span>
              {!detalle.fechaNacimiento && !detalle.cargo && !detalle.perfil && !detalle.sede && !detalle.fotoPerfilUrl ? (
                <span style={styles.subListEmpty}>No hay datos relacionados</span>
              ) : (
                <>
                  <DetalleRow label="Fecha de nacimiento">{formatDate(detalle.fechaNacimiento)}</DetalleRow>
                  <DetalleRow label="Cargo">{detalle.cargo ?? '-'}</DetalleRow>
                  <DetalleRow label="Perfil">{detalle.perfil ?? '-'}</DetalleRow>
                  <DetalleRow label="Sede">{detalle.sede ?? '-'}</DetalleRow>
                  <DetalleRow label="Foto de perfil">
                    {detalle.fotoPerfilUrl ? (
                      /^https?:\/\//.test(detalle.fotoPerfilUrl) ? (
                        <a href={detalle.fotoPerfilUrl} target="_blank" rel="noreferrer" style={styles.mapLink}>Ver foto</a>
                      ) : detalle.fotoPerfilUrl
                    ) : '-'}
                  </DetalleRow>
                </>
              )}

              <span style={styles.sectionHeader}>Datos bancarios</span>
              {detalle.cuentas.length === 0 ? (
                <span style={styles.subListEmpty}>Sin cuentas bancarias registradas.</span>
              ) : (
                <div style={styles.subList}>
                  {detalle.cuentas.map(c => (
                    <CuentaListItem key={c.id} terceroId={item.id} cuenta={c} />
                  ))}
                </div>
              )}

              <span style={styles.sectionHeader}>Clasificación</span>
              {detalle.clasificaciones.length === 0 ? (
                <span style={styles.subListEmpty}>Sin clasificación asignada.</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.3rem' }}>
                  {detalle.clasificaciones.map(c => (
                    <span key={c} style={styles.clasifBadge}>{CLASIFICACION_LABEL[c]}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ClasificacionPicker({ value, onToggle }: { value: ClasificacionTercero[]; onToggle: (c: ClasificacionTercero) => void }) {
  return (
    <div style={styles.pillGrid}>
      {CLASIFICACIONES_TERCERO.map(c => {
        const active = value.includes(c);
        return (
          <button
            key={c}
            type="button"
            style={{ ...styles.pillBtn, ...(active ? styles.pillBtnActive : {}) }}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { onToggle(c); e.currentTarget.blur(); }}
          >
            {active ? <CheckCircle size={14} /> : <Circle size={14} />} {CLASIFICACION_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}

function SiNoPicker({ value, onChange, siLabel = 'Sí', noLabel = 'No' }: { value: boolean; onChange: (v: boolean) => void; siLabel?: string; noLabel?: string }) {
  return (
    <div style={styles.pillGrid}>
      <button
        type="button"
        style={{ ...styles.pillBtn, ...(!value ? styles.pillBtnActive : {}) }}
        onMouseDown={e => e.preventDefault()}
        onClick={e => { onChange(false); e.currentTarget.blur(); }}
      >
        {!value ? <CheckCircle size={14} /> : <Circle size={14} />} {noLabel}
      </button>
      <button
        type="button"
        style={{ ...styles.pillBtn, ...(value ? styles.pillBtnActive : {}) }}
        onMouseDown={e => e.preventDefault()}
        onClick={e => { onChange(true); e.currentTarget.blur(); }}
      >
        {value ? <CheckCircle size={14} /> : <Circle size={14} />} {siLabel}
      </button>
    </div>
  );
}

const DATO_CONTACTO_LABEL: Record<TipoContacto, string> = {
  'Teléfono': 'Ingresa el número telefónico',
  'Celular': 'Ingresa el número de celular',
  'Correo': 'Ingresa el correo electrónico',
  'Dirección': 'Ingresa la dirección',
};

const sanitizeDatoContacto = (tipo: TipoContacto, value: string): string => {
  switch (tipo) {
    case 'Teléfono': return value.replace(/[^\d]/g, '');
    case 'Celular': return value.replace(/[^\d]/g, '').slice(0, 10);
    case 'Correo': return value.replace(/[^A-Za-z0-9@._+-]/g, '');
    case 'Dirección': return value.replace(/[^A-Za-zÀ-ÿ0-9\s.,#-]/g, '');
    default: return value;
  }
};

function ContactoFields({ value, onChange, error, idPrefix = '' }: {
  value: CreateTerceroContactoPayload;
  onChange: (patch: Partial<CreateTerceroContactoPayload>) => void;
  error?: { field: string; message: string } | null;
  idPrefix?: string;
}) {
  return (
    <div style={styles.optionalBox}>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Tipo *</label>
        <select
          style={styles.formInput}
          value={value.tipo}
          onChange={e => {
            const tipo = e.target.value as TipoContacto;
            onChange({ tipo, dato: sanitizeDatoContacto(tipo, value.dato) });
          }}
        >
          {TIPOS_CONTACTO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={styles.formGroup} id={`${idPrefix}tercero-field-contactoDato`}>
        <label style={styles.formLabel}>{DATO_CONTACTO_LABEL[value.tipo]} *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'contactoDato' ? styles.inputError : {}) }}
          value={value.dato}
          onChange={e => onChange({ dato: sanitizeDatoContacto(value.tipo, e.target.value) })}
          inputMode={value.tipo === 'Teléfono' || value.tipo === 'Celular' ? 'numeric' : 'text'}
          maxLength={value.tipo === 'Celular' ? 10 : undefined}
        />
        {error?.field === 'contactoDato' && <span style={styles.errorText}>{error.message}</span>}
      </div>
      <div style={styles.formGroup} id={`${idPrefix}tercero-field-personaContacto`}>
        <label style={styles.formLabel}>Persona de contacto *</label>
        <input style={{ ...styles.formInput, ...(error?.field === 'personaContacto' ? styles.inputError : {}) }} value={value.personaContacto ?? ''} onChange={e => onChange({ personaContacto: sanitizeText(e.target.value) })} />
        {error?.field === 'personaContacto' && <span style={styles.errorText}>{error.message}</span>}
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Notas</label>
        <input style={styles.formInput} value={value.notas ?? ''} onChange={e => onChange({ notas: e.target.value })} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Principal</label>
        <SiNoPicker value={!!value.principal} onChange={v => onChange({ principal: v })} />
      </div>
    </div>
  );
}

function CuentaFields({ value, catalogos, onChange, error, idPrefix = '' }: {
  value: CreateTerceroCuentaPayload;
  catalogos: TercerosCatalogos;
  onChange: (patch: Partial<CreateTerceroCuentaPayload>) => void;
  error?: { field: string; message: string } | null;
  idPrefix?: string;
}) {
  const esEfectivo = value.tipo === 'Efectivo';

  return (
    <div style={styles.optionalBox}>
      <div style={styles.formGroup} id={`${idPrefix}tercero-field-cuentaTipoDeCuenta`}>
        <label style={styles.formLabel}>Tipo de cuenta *</label>
        <SiNoPicker value={value.tipoDeCuenta === 'Externa'} onChange={v => onChange({ tipoDeCuenta: v ? 'Externa' : 'Interna' })} siLabel="Externa" noLabel="Interna" />
      </div>
      <div style={styles.formGroup} id={`${idPrefix}tercero-field-cuentaTipo`}>
        <label style={styles.formLabel}>Tipo *</label>
        <select style={styles.formInput} value={value.tipo} onChange={e => onChange({ tipo: e.target.value as TipoCuenta })}>
          {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      {!esEfectivo && (
        <>
          <div style={styles.formGroup} id={`${idPrefix}tercero-field-cuentaBanco`}>
            <label style={styles.formLabel}>Banco / Caja *</label>
            <select style={{ ...styles.formInput, ...(error?.field === 'cuentaBanco' ? styles.inputError : {}) }} value={value.bancoId ?? ''} onChange={e => onChange({ bancoId: e.target.value })}>
              <option value="">Selecciona...</option>
              {catalogos.bancos.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
          </div>
          <div style={styles.formGroup} id={`${idPrefix}tercero-field-cuentaNoDeCuenta`}>
            <label style={styles.formLabel}>No. de cuenta *</label>
            <input style={{ ...styles.formInput, ...(error?.field === 'cuentaNoDeCuenta' ? styles.inputError : {}) }} value={value.noDeCuenta ?? ''} onChange={e => onChange({ noDeCuenta: sanitizeInt(e.target.value) })} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>CLABE interbancaria</label>
            <input style={styles.formInput} value={value.clabeInterbancaria ?? ''} onChange={e => onChange({ clabeInterbancaria: sanitizeInt(e.target.value) })} />
          </div>
        </>
      )}
    </div>
  );
}

function ContactoListItem({ terceroId, contacto }: { terceroId: string; contacto: TerceroContactoItem }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState<CreateTerceroContactoPayload>({
    tipo: contacto.tipo as TipoContacto,
    dato: contacto.dato,
    personaContacto: contacto.personaContacto ?? '',
    notas: contacto.notas ?? '',
    principal: contacto.principal,
  });
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  const updateMutation = useMutation({
    mutationFn: () => tercerosAdminService.updateContacto(terceroId, contacto.id, {
      tipo: form.tipo,
      dato: form.dato.trim(),
      personaContacto: form.personaContacto?.trim() || undefined,
      notas: form.notas?.trim() || undefined,
      principal: form.principal,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tercero-detalle', terceroId] });
      setEditing(false);
    },
    onError: (err: any) => setError({ field: 'contactoDato', message: err?.response?.data?.message ?? 'No se pudo actualizar el dato de contacto.' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => tercerosAdminService.deleteContacto(terceroId, contacto.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tercero-detalle', terceroId] }),
  });

  const handleGuardar = () => {
    if (!form.dato.trim()) { setError({ field: 'contactoDato', message: 'Ingresa este dato.' }); return; }
    if (!form.personaContacto?.trim()) { setError({ field: 'personaContacto', message: 'Ingresa la persona de contacto.' }); return; }
    setError(null);
    updateMutation.mutate();
  };

  if (confirmDelete) {
    return (
      <div style={styles.subListItem}>
        <span style={{ fontSize: '0.85rem', color: '#33342a' }}>¿Eliminar este dato de contacto?</span>
        <div style={styles.formActions}>
          <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
          <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <>
        <ContactoFields
          value={form}
          onChange={patch => { setForm(f => ({ ...f, ...patch })); setError(null); }}
          error={error}
          idPrefix={`contacto-${contacto.id}-`}
        />
        <div style={styles.formActions}>
          <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancelar</button>
          <button style={styles.saveBtn} onClick={handleGuardar} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </>
    );
  }

  return (
    <div style={styles.subListItem}>
      <div style={styles.subListItemHeader}>
        <span style={styles.subListTipo}>{contacto.tipo}</span>
        {contacto.principal && <span style={styles.principalBadge}>Principal</span>}
        <div style={styles.itemActionsRow}>
          <button type="button" style={styles.itemActionBtn} onClick={() => setEditing(true)}><MaterialIcon name="edit" size={15} /></button>
          <button type="button" style={styles.itemActionBtn} onClick={() => setConfirmDelete(true)}><MaterialIcon name="delete" size={15} /></button>
        </div>
      </div>
      <span style={styles.subListDato}>{contacto.dato}</span>
      {contacto.personaContacto && <span style={styles.subListDetalle}>Persona de contacto: {contacto.personaContacto}</span>}
      {contacto.notas && <span style={styles.subListDetalle}>{contacto.notas}</span>}
    </div>
  );
}

function CuentaListItem({ terceroId, cuenta }: { terceroId: string; cuenta: TerceroCuentaItem }) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => tercerosAdminService.deleteCuenta(terceroId, cuenta.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tercero-detalle', terceroId] }),
    onError: (err: any) => setDeleteError(err?.response?.data?.message ?? 'No se pudo eliminar la cuenta.'),
  });

  if (confirmDelete) {
    return (
      <div style={styles.subListItem}>
        <span style={{ fontSize: '0.85rem', color: '#33342a' }}>¿Eliminar esta cuenta bancaria?</span>
        {deleteError && <span style={styles.errorText}>{deleteError}</span>}
        <div style={styles.formActions}>
          <button style={styles.cancelBtn} onClick={() => setConfirmDelete(false)}>Cancelar</button>
          <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.subListItem}>
      <div style={styles.subListItemHeader}>
        <span style={styles.subListTipo}>{[cuenta.tipoDeCuenta, cuenta.tipo].filter(Boolean).join(' · ') || '-'}</span>
        <div style={styles.itemActionsRow}>
          <button type="button" style={styles.itemActionBtn} onClick={() => { setDeleteError(null); setConfirmDelete(true); }}><MaterialIcon name="delete" size={15} /></button>
        </div>
      </div>
      {cuenta.banco && <span style={styles.subListDato}>{cuenta.banco}</span>}
      {cuenta.noDeCuenta && <span style={styles.subListDetalle}>No. de cuenta: {cuenta.noDeCuenta}</span>}
      {cuenta.clabeInterbancaria && <span style={styles.subListDetalle}>CLABE: {cuenta.clabeInterbancaria}</span>}
    </div>
  );
}

type TerceroFormState = {
  tipoContacto: boolean;
  tipoPersona: boolean;
  primerNombre: string;
  segundoNombre: string;
  primerApellido: string;
  segundoApellido: string;
  nombreCompleto: string;
  nombreComercial: string;
  ciudadId: string;
  estadoId: string;
  paisId: string;
  observaciones: string;
  clasificaciones: ClasificacionTercero[];
  mir: boolean;
  rfc: string;
  razonSocial: string;
  regimenFiscalId: string;
  codigoPostalFiscal: string;
  usoCfdiId: string;
  direccionFiscal: string;
  grupo: boolean;
  activo: boolean;
  agregarFacturacion: boolean;
};

const emptyTerceroForm: TerceroFormState = {
  tipoContacto: false, // Interno = false
  tipoPersona: false, // Física = false
  primerNombre: '', segundoNombre: '', primerApellido: '', segundoApellido: '', nombreCompleto: '', nombreComercial: '',
  ciudadId: '', estadoId: '', paisId: '', observaciones: '',
  clasificaciones: [], mir: false,
  rfc: '', razonSocial: '', regimenFiscalId: '', codigoPostalFiscal: '', usoCfdiId: '', direccionFiscal: '',
  grupo: false,
  activo: true,
  agregarFacturacion: false,
};

function TerceroFormFields({ form, onChange, catalogos, error, extraSections }: {
  form: TerceroFormState;
  onChange: (patch: Partial<TerceroFormState>) => void;
  catalogos: TercerosCatalogos;
  error: { field: string; message: string } | null;
  extraSections?: React.ReactNode;
}) {
  const toggleClasificacion = (c: ClasificacionTercero) => {
    onChange({ clasificaciones: form.clasificaciones.includes(c) ? form.clasificaciones.filter(x => x !== c) : [...form.clasificaciones, c] });
  };

  const ciudadesFiltradas = form.estadoId ? catalogos.ciudades.filter(c => c.estadoId === form.estadoId) : catalogos.ciudades;
  const estadosFiltrados = form.paisId ? catalogos.estados.filter(e => e.paisId === form.paisId) : catalogos.estados;

  const toggleFacturacion = (v: boolean) => {
    onChange({
      agregarFacturacion: v,
      ...(!v ? { rfc: '', razonSocial: '', regimenFiscalId: '', codigoPostalFiscal: '', usoCfdiId: '', direccionFiscal: '' } : {}),
    });
  };

  // Física: Nombre completo/comercial = Primer nombre + Segundo nombre + Primer apellido + Segundo
  // apellido. Moral: solo se pide Primer nombre, y ambos se llenan con eso — no se piden apellidos.
  useEffect(() => {
    const nombreCalculado = form.tipoPersona
      ? form.primerNombre.trim()
      : [form.primerNombre, form.segundoNombre, form.primerApellido, form.segundoApellido].map(s => s.trim()).filter(Boolean).join(' ');
    if (form.nombreCompleto !== nombreCalculado || form.nombreComercial !== nombreCalculado) {
      onChange({ nombreCompleto: nombreCalculado, nombreComercial: nombreCalculado });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tipoPersona, form.primerNombre, form.segundoNombre, form.primerApellido, form.segundoApellido]);

  return (
    <>
      <span style={styles.sectionHeader}>Datos principales</span>
      <div style={styles.optionalBox}>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Tipo de contacto *</label>
        <SiNoPicker value={form.tipoContacto} onChange={v => onChange({ tipoContacto: v })} siLabel="Externo" noLabel="Interno" />
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Tipo de persona *</label>
        <SiNoPicker value={form.tipoPersona} onChange={v => onChange({ tipoPersona: v })} siLabel="Moral" noLabel="Física" />
      </div>

      <div style={styles.formGroup} id="tercero-field-primerNombre">
        <label style={styles.formLabel}>Primer nombre *</label>
        <input
          style={{ ...styles.formInput, ...(error?.field === 'primerNombre' ? styles.inputError : {}) }}
          value={form.primerNombre}
          onChange={e => onChange({ primerNombre: sanitizeText(e.target.value) })}
        />
        {error?.field === 'primerNombre' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      {!form.tipoPersona && (
        <>
          <div style={styles.formGroup} id="tercero-field-segundoNombre">
            <label style={styles.formLabel}>Segundo nombre *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'segundoNombre' ? styles.inputError : {}) }}
              value={form.segundoNombre}
              onChange={e => onChange({ segundoNombre: sanitizeText(e.target.value) })}
            />
            {error?.field === 'segundoNombre' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup} id="tercero-field-primerApellido">
            <label style={styles.formLabel}>Primer apellido *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'primerApellido' ? styles.inputError : {}) }}
              value={form.primerApellido}
              onChange={e => onChange({ primerApellido: sanitizeText(e.target.value) })}
            />
            {error?.field === 'primerApellido' && <span style={styles.errorText}>{error.message}</span>}
          </div>

          <div style={styles.formGroup} id="tercero-field-segundoApellido">
            <label style={styles.formLabel}>Segundo apellido *</label>
            <input
              style={{ ...styles.formInput, ...(error?.field === 'segundoApellido' ? styles.inputError : {}) }}
              value={form.segundoApellido}
              onChange={e => onChange({ segundoApellido: sanitizeText(e.target.value) })}
            />
            {error?.field === 'segundoApellido' && <span style={styles.errorText}>{error.message}</span>}
          </div>
        </>
      )}

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Nombre completo</label>
        <span style={styles.readOnlyField}>{form.nombreCompleto || '-'}</span>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Nombre comercial</label>
        <span style={styles.readOnlyField}>{form.nombreComercial || '-'}</span>
      </div>

      <div style={styles.formGroup} id="tercero-field-paisId">
        <label style={styles.formLabel}>País *</label>
        <select
          style={{ ...styles.formInput, ...(error?.field === 'paisId' ? styles.inputError : {}) }}
          value={form.paisId}
          onChange={e => onChange({ paisId: e.target.value, estadoId: '', ciudadId: '' })}
        >
          <option value="">Selecciona...</option>
          {catalogos.paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {error?.field === 'paisId' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="tercero-field-estadoId">
        <label style={styles.formLabel}>Estado *</label>
        <select
          style={{ ...styles.formInput, ...(error?.field === 'estadoId' ? styles.inputError : {}) }}
          value={form.estadoId}
          onChange={e => onChange({ estadoId: e.target.value, ciudadId: '' })}
        >
          <option value="">Selecciona...</option>
          {estadosFiltrados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        {error?.field === 'estadoId' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup} id="tercero-field-ciudadId">
        <label style={styles.formLabel}>Ciudad *</label>
        <select
          style={{ ...styles.formInput, ...(error?.field === 'ciudadId' ? styles.inputError : {}) }}
          value={form.ciudadId}
          onChange={e => onChange({ ciudadId: e.target.value })}
        >
          <option value="">Selecciona...</option>
          {ciudadesFiltradas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {error?.field === 'ciudadId' && <span style={styles.errorText}>{error.message}</span>}
      </div>

      <div style={styles.formGroup}>
        <label style={styles.formLabel}>Observaciones</label>
        <textarea
          ref={autoResizeTextarea}
          style={{ ...styles.formInput, ...styles.textarea }}
          value={form.observaciones}
          onChange={e => { onChange({ observaciones: e.target.value }); autoResizeTextarea(e.target); }}
        />
      </div>
      </div>

      {extraSections}

      <span style={styles.sectionHeader}>Clasificación</span>
      <div style={styles.formGroup}>
        <ClasificacionPicker value={form.clasificaciones} onToggle={toggleClasificacion} />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>¿MIR?</label>
        <SiNoPicker value={form.mir} onChange={v => onChange({ mir: v })} />
      </div>

      <span style={styles.sectionHeader}>Datos de facturación</span>
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>¿Agregar datos de facturación?</label>
        <SiNoPicker value={form.agregarFacturacion} onChange={toggleFacturacion} />
      </div>
      {form.agregarFacturacion && (
        <div style={styles.optionalBox}>
          <div style={styles.formGroup} id="tercero-field-rfc">
            <label style={styles.formLabel}>RFC *</label>
            <input style={{ ...styles.formInput, ...(error?.field === 'rfc' ? styles.inputError : {}) }} value={form.rfc} onChange={e => onChange({ rfc: e.target.value.toUpperCase() })} />
            {error?.field === 'rfc' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup} id="tercero-field-razonSocial">
            <label style={styles.formLabel}>Razón social *</label>
            <input style={{ ...styles.formInput, ...(error?.field === 'razonSocial' ? styles.inputError : {}) }} value={form.razonSocial} onChange={e => onChange({ razonSocial: e.target.value })} />
            {error?.field === 'razonSocial' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup} id="tercero-field-regimenFiscalId">
            <label style={styles.formLabel}>Régimen fiscal *</label>
            <select style={{ ...styles.formInput, ...(error?.field === 'regimenFiscalId' ? styles.inputError : {}) }} value={form.regimenFiscalId} onChange={e => onChange({ regimenFiscalId: e.target.value })}>
              <option value="">Selecciona...</option>
              {catalogos.regimenesFiscales.map(r => <option key={r.id} value={r.id}>{r.descripcion}</option>)}
            </select>
            {error?.field === 'regimenFiscalId' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup} id="tercero-field-codigoPostalFiscal">
            <label style={styles.formLabel}>Código postal fiscal *</label>
            <input style={{ ...styles.formInput, ...(error?.field === 'codigoPostalFiscal' ? styles.inputError : {}) }} value={form.codigoPostalFiscal} onChange={e => onChange({ codigoPostalFiscal: sanitizeInt(e.target.value) })} />
            {error?.field === 'codigoPostalFiscal' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup} id="tercero-field-usoCfdiId">
            <label style={styles.formLabel}>Uso CFDI *</label>
            <select style={{ ...styles.formInput, ...(error?.field === 'usoCfdiId' ? styles.inputError : {}) }} value={form.usoCfdiId} onChange={e => onChange({ usoCfdiId: e.target.value })}>
              <option value="">Selecciona...</option>
              {catalogos.usosCfdi.map(u => <option key={u.id} value={u.id}>{u.descripcion}</option>)}
            </select>
            {error?.field === 'usoCfdiId' && <span style={styles.errorText}>{error.message}</span>}
          </div>
          <div style={styles.formGroup} id="tercero-field-direccionFiscal">
            <label style={styles.formLabel}>Dirección fiscal *</label>
            <input style={{ ...styles.formInput, ...(error?.field === 'direccionFiscal' ? styles.inputError : {}) }} value={form.direccionFiscal} onChange={e => onChange({ direccionFiscal: e.target.value })} />
            {error?.field === 'direccionFiscal' && <span style={styles.errorText}>{error.message}</span>}
          </div>
        </div>
      )}
      <div style={styles.formGroup}>
        <label style={styles.formLabel}>¿Grupo?</label>
        <SiNoPicker value={form.grupo} onChange={v => onChange({ grupo: v })} />
      </div>
    </>
  );
}

function datosFiscalesFromForm(form: TerceroFormState) {
  const hayDatosFiscales = !!(form.rfc.trim() || form.razonSocial.trim() || form.regimenFiscalId || form.codigoPostalFiscal.trim() || form.usoCfdiId || form.direccionFiscal.trim());
  if (!hayDatosFiscales) return undefined;
  return {
    rfc: form.rfc.trim() || undefined,
    razonSocial: form.razonSocial.trim() || undefined,
    regimenFiscalId: form.regimenFiscalId || undefined,
    codigoPostalFiscal: form.codigoPostalFiscal.trim() || undefined,
    usoCfdiId: form.usoCfdiId || undefined,
    direccionFiscal: form.direccionFiscal.trim() || undefined,
  };
}

function NuevoTerceroModal({ catalogos, onClose, onCreated }: {
  catalogos: TercerosCatalogos;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TerceroFormState>(emptyTerceroForm);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [agregarContacto, setAgregarContacto] = useState(false);
  const [contactoForm, setContactoForm] = useState<CreateTerceroContactoPayload>({ tipo: 'Teléfono', dato: '', personaContacto: '', notas: '', principal: false });
  const [agregarCuenta, setAgregarCuenta] = useState(false);
  const [cuentaForm, setCuentaForm] = useState<CreateTerceroCuentaPayload>({ tipoDeCuenta: 'Interna', tipo: 'Efectivo', bancoId: '', noDeCuenta: '', clabeInterbancaria: '' });

  const updateForm = (patch: Partial<TerceroFormState>) => { setForm(f => ({ ...f, ...patch })); setError(null); };

  const createMutation = useMutation({
    mutationFn: async () => {
      const tercero = await tercerosAdminService.createTercero({
        tipoContacto: form.tipoContacto,
        tipoPersona: form.tipoPersona,
        primerNombre: form.primerNombre.trim(),
        segundoNombre: form.tipoPersona ? undefined : (form.segundoNombre.trim() || undefined),
        primerApellido: form.tipoPersona ? undefined : (form.primerApellido.trim() || undefined),
        segundoApellido: form.tipoPersona ? undefined : (form.segundoApellido.trim() || undefined),
        nombreCompleto: form.nombreCompleto.trim() || undefined,
        nombreComercial: form.nombreComercial.trim() || undefined,
        ciudadId: form.ciudadId || undefined,
        estadoId: form.estadoId || undefined,
        paisId: form.paisId || undefined,
        observaciones: form.observaciones.trim() || undefined,
        clasificaciones: form.clasificaciones.length ? form.clasificaciones : undefined,
        mir: form.mir,
        grupo: form.grupo,
        datosFiscales: datosFiscalesFromForm(form),
      });
      const esEfectivo = cuentaForm.tipo === 'Efectivo';
      await Promise.all([
        ...(agregarContacto ? [tercerosAdminService.createContacto(tercero.id, {
          tipo: contactoForm.tipo,
          dato: contactoForm.dato.trim(),
          personaContacto: contactoForm.personaContacto?.trim() || undefined,
          notas: contactoForm.notas?.trim() || undefined,
          principal: contactoForm.principal,
        })] : []),
        ...(agregarCuenta ? [tercerosAdminService.createCuenta(tercero.id, {
          tipoDeCuenta: cuentaForm.tipoDeCuenta,
          tipo: cuentaForm.tipo,
          bancoId: esEfectivo ? undefined : cuentaForm.bancoId,
          noDeCuenta: esEfectivo ? undefined : cuentaForm.noDeCuenta?.trim(),
          clabeInterbancaria: esEfectivo ? undefined : (cuentaForm.clabeInterbancaria?.trim() || undefined),
        })] : []),
      ]);
      return tercero;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terceros-admin'] });
      onCreated('Tercero agregado');
    },
    onError: (err: any) => {
      setError({ field: 'primerNombre', message: err?.response?.data?.message ?? 'No se pudo guardar el tercero.' });
    },
  });

  const handleGuardar = () => {
    if (!form.primerNombre.trim()) { setError({ field: 'primerNombre', message: 'Ingresa el primer nombre.' }); return; }
    if (!form.paisId) { setError({ field: 'paisId', message: 'Selecciona el país.' }); return; }
    if (!form.estadoId) { setError({ field: 'estadoId', message: 'Selecciona el estado.' }); return; }
    if (!form.ciudadId) { setError({ field: 'ciudadId', message: 'Selecciona la ciudad.' }); return; }
    if (!form.tipoPersona) {
      if (!form.segundoNombre.trim()) { setError({ field: 'segundoNombre', message: 'Ingresa el segundo nombre.' }); return; }
      if (!form.primerApellido.trim()) { setError({ field: 'primerApellido', message: 'Ingresa el primer apellido.' }); return; }
      if (!form.segundoApellido.trim()) { setError({ field: 'segundoApellido', message: 'Ingresa el segundo apellido.' }); return; }
    }
    if (form.agregarFacturacion) {
      if (!form.rfc.trim()) { setError({ field: 'rfc', message: 'Ingresa el RFC.' }); return; }
      if (!form.razonSocial.trim()) { setError({ field: 'razonSocial', message: 'Ingresa la razón social.' }); return; }
      if (!form.regimenFiscalId) { setError({ field: 'regimenFiscalId', message: 'Selecciona el régimen fiscal.' }); return; }
      if (!form.codigoPostalFiscal.trim()) { setError({ field: 'codigoPostalFiscal', message: 'Ingresa el código postal fiscal.' }); return; }
      if (!form.usoCfdiId) { setError({ field: 'usoCfdiId', message: 'Selecciona el uso CFDI.' }); return; }
      if (!form.direccionFiscal.trim()) { setError({ field: 'direccionFiscal', message: 'Ingresa la dirección fiscal.' }); return; }
    }
    if (agregarContacto) {
      if (!contactoForm.dato.trim()) { setError({ field: 'contactoDato', message: 'Ingresa este dato.' }); return; }
      if (!contactoForm.personaContacto?.trim()) { setError({ field: 'personaContacto', message: 'Ingresa la persona de contacto.' }); return; }
    }
    if (agregarCuenta) {
      if (!cuentaForm.tipoDeCuenta) { setError({ field: 'cuentaTipoDeCuenta', message: 'Selecciona el tipo de cuenta.' }); return; }
      if (!cuentaForm.tipo) { setError({ field: 'cuentaTipo', message: 'Selecciona el tipo.' }); return; }
      if (cuentaForm.tipo !== 'Efectivo') {
        if (!cuentaForm.bancoId) { setError({ field: 'cuentaBanco', message: 'Selecciona el banco o caja.' }); return; }
        if (!cuentaForm.noDeCuenta?.trim()) { setError({ field: 'cuentaNoDeCuenta', message: 'Ingresa el número de cuenta.' }); return; }
      }
    }
    setError(null);
    createMutation.mutate();
  };

  useEffect(() => {
    if (!error) return;
    document.getElementById(`tercero-field-${error.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  return (
    <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={onClose}>
      <div className="modal-content-anim" style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nuevo tercero</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={styles.modalBody}>
          <span style={styles.sectionHeader}>Registro</span>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Registrado por *</label>
            <span style={styles.selectedTag}>{usuarioActual().correo ?? '-'}</span>
          </div>

          <TerceroFormFields
            form={form}
            onChange={updateForm}
            catalogos={catalogos}
            error={error}
            extraSections={
              <>
                <span style={styles.sectionHeader}>Datos de contacto</span>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>¿Agregar datos de contacto?</label>
                  <SiNoPicker value={agregarContacto} onChange={setAgregarContacto} />
                </div>
                {agregarContacto && (
                  <ContactoFields
                    value={contactoForm}
                    onChange={patch => { setContactoForm(f => ({ ...f, ...patch })); setError(null); }}
                    error={error}
                  />
                )}

                <span style={styles.sectionHeader}>Datos bancarios</span>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>¿Agregar datos bancarios?</label>
                  <SiNoPicker value={agregarCuenta} onChange={setAgregarCuenta} />
                </div>
                {agregarCuenta && (
                  <CuentaFields
                    value={cuentaForm}
                    catalogos={catalogos}
                    onChange={patch => { setCuentaForm(f => ({ ...f, ...patch })); setError(null); }}
                    error={error}
                  />
                )}
              </>
            }
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

export default function TercerosAdminPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [clasifFiltro, setClasifFiltro] = useState<ClasificacionTercero | ''>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TerceroItem | null>(null);
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

  const query = { page, limit: 300, search: search || undefined, clasificacion: clasifFiltro || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['terceros-admin', query],
    queryFn: () => tercerosAdminService.findAll(query),
    placeholderData: keepPreviousData,
  });

  const { data: catalogos } = useQuery<TercerosCatalogos>({
    queryKey: ['terceros-catalogos'],
    queryFn: () => tercerosAdminService.getCatalogos(),
    enabled: showCreateModal,
  });

  const items = data?.data ?? [];

  return (
    <Layout>
      <div style={styles.pageWrapper}>
        <button
          type="button"
          onClick={() => navigate('/administracion')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = '#4d7a13'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
        >
          <MaterialIcon name="arrow_back" size={16} />
          Volver
        </button>

        <div style={{ ...styles.contentCard, ...(isStuck ? styles.contentCardStuck : {}) }}>
          <div style={styles.header}>
            <h1 style={styles.title}>Terceros</h1>
          </div>

          <div style={styles.toolbar}>
            <div style={styles.searchWrap}>
              <Search size={15} color="#9ca3af" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                style={styles.searchInput}
                placeholder="Buscar por nombre o correo..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            <select
              style={styles.filterSelect}
              value={clasifFiltro}
              onChange={e => { setClasifFiltro(e.target.value as ClasificacionTercero | ''); setPage(1); }}
            >
              <option value="">Todos los tipos</option>
              {CLASIFICACIONES_TERCERO.map(c => (
                <option key={c} value={c}>{CLASIFICACION_LABEL[c]}</option>
              ))}
            </select>

            <button className="btn-press header-btn-primary" style={styles.pillBtnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Agregar tercero
            </button>

            <span style={styles.totalLabel}>{isLoading ? '...' : `${data?.total ?? 0} registros`}</span>
          </div>
        </div>

        <div ref={tableWrapRef} style={styles.tableWrap}>
          {isLoading && items.length === 0 ? (
            <div style={styles.empty}>Cargando...</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>Sin registros</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thead}>
                  {['#', 'Nombre completo', 'Correo', 'Tipos', 'Contacto', 'Persona', 'Estado'].map((h, i) => (
                    <th key={i} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <TerceroRow key={item.id} item={item} rowNumber={(page - 1) * 300 + index + 1} onSelect={setSelected} />
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
          onClose={() => setSelected(null)}
          onUpdated={msg => setToastMessage(msg)}
        />
      )}
      {showCreateModal && catalogos && (
        <NuevoTerceroModal
          catalogos={catalogos}
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
  searchWrap: { position: 'relative' as const, flex: 1, minWidth: '240px' },
  searchInput: { width: '100%', padding: '0.6rem 0.75rem 0.6rem 2.25rem', border: 'none', backgroundColor: '#f5f5f0', borderRadius: '10px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, color: '#374151' },
  filterSelect: { padding: '0.6rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.85rem', backgroundColor: '#fff', color: '#374151', minWidth: '160px' },
  totalLabel: { fontSize: '0.8rem', color: '#9ca3af', whiteSpace: 'nowrap' as const, marginLeft: 'auto' },
  tableWrap: { backgroundColor: '#fff', borderRadius: '16px', overflowX: 'auto' as const, overflowY: 'auto' as const, maxHeight: 'calc(100vh - 260px)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #eeeee6' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84375rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.7rem 0.875rem', fontWeight: 500, color: '#9ca3af', fontSize: '0.68rem', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, backgroundColor: '#f9fafb', zIndex: 1, textAlign: 'left' as const },
  td: { padding: '0.65rem 0.875rem', borderBottom: '1px solid #f3f4f0', verticalAlign: 'middle' as const, color: '#33342a' },
  tr: { backgroundColor: '#fff', cursor: 'pointer', transition: 'background-color 0.15s ease' },
  clasifBadge: { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: '#eef2ff', color: '#4338ca' },
  subListEmpty: { fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' as const },
  subList: { display: 'flex', flexDirection: 'column' as const, gap: '0.6rem' },
  subListItem: { display: 'flex', flexDirection: 'column' as const, gap: '0.2rem', padding: '0.6rem 0.75rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px' },
  subListItemHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  subListTipo: { fontSize: '0.7rem', fontWeight: 700, color: '#4d7a13', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  subListDato: { fontSize: '0.9rem', fontWeight: 600, color: '#16170f' },
  subListDetalle: { fontSize: '0.8rem', color: '#6b6b60' },
  principalBadge: { display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700, backgroundColor: '#e9f2d8', color: '#3f6510' },
  deleteBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
  confirmBox: { display: 'flex', flexDirection: 'column' as const, gap: '1rem', padding: '1rem', backgroundColor: '#fdf0ec', border: '1px solid #f3cfc2', borderRadius: '10px' },
  iconMenuBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', color: '#33342a', flexShrink: 0, backgroundColor: 'transparent' },
  moreMenu: { position: 'absolute' as const, top: 'calc(100% + 8px)', right: 0, backgroundColor: '#fff', border: '1px solid #eeeee6', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden', zIndex: 200, padding: '0.35rem' },
  moreMenuItem: { display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '0.84375rem', color: '#33342a', fontWeight: 600, textAlign: 'left' as const },
  moreMenuItemDanger: { color: '#c65b3f' },
  moreMenuDivider: { height: '1px', backgroundColor: '#eeeee6', margin: '0.3rem 0' },
  estadoBadge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 },
  estadoActivo: { backgroundColor: '#e9f2d8', color: '#3f6510' },
  estadoInactivo: { backgroundColor: '#f4f4ee', color: '#6b6b60' },
  empty: { textAlign: 'center' as const, padding: '3rem', color: '#9ca3af' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' },
  pageLabel: { fontSize: '0.875rem', fontWeight: 600, color: '#33342a' },
  pageBtn: { display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.5rem 1rem', backgroundColor: '#e9f2d8', color: '#3f6510', border: '1px solid #dbe8c2', borderRadius: '10px', cursor: 'pointer', fontWeight: 600, fontSize: '0.84375rem' },
  pageBtnDisabled: { backgroundColor: '#f4f4ee', borderColor: '#eeeee6', color: '#c7c7ba', cursor: 'not-allowed' as const },
  modalOverlay: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '16px', width: '90%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #eeeee6', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', position: 'sticky' as const, top: 0, zIndex: 1 },
  modalTitle: { fontSize: '1.1rem', fontWeight: 700, color: '#16170f', margin: 0 },
  closeBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', border: 'none', backgroundColor: '#f4f4ee', borderRadius: '8px', cursor: 'pointer', color: '#6b6b60' },
  modalBody: { padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1.1rem' },
  sectionHeader: { fontSize: '0.8rem', fontWeight: 700, color: '#4d7a13', textTransform: 'uppercase' as const, letterSpacing: '0.04em', borderBottom: '1px solid #eeeee6', paddingBottom: '0.4rem', marginTop: '0.4rem' },
  optionalBox: { display: 'flex', flexDirection: 'column' as const, gap: '0.85rem', padding: '0.9rem', backgroundColor: '#f9fafb', border: '1px solid #eeeee6', borderRadius: '10px' },
  itemActionsRow: { display: 'flex', alignItems: 'center', gap: '0.2rem', marginLeft: 'auto' },
  itemActionBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: '#9ca3af', cursor: 'pointer' },
  detalleRow: { display: 'flex', flexDirection: 'column' as const, gap: '0.3rem' },
  detalleLabel: { fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  detalleValue: { fontSize: '0.9375rem', fontWeight: 400, color: '#16170f' },
  pillBtnPrimary: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem', border: '1px solid #dbe8c2', borderRadius: '12px', color: '#3f6510', fontWeight: 600, fontSize: '0.84375rem', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '0.4rem' },
  formLabel: { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  formInput: { padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' as const },
  readOnlyField: { display: 'block', padding: '0.55rem 0.7rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb', fontSize: '0.85rem', color: '#6b7280' },
  textarea: { minHeight: '44px', resize: 'none' as const, overflow: 'hidden' as const },
  inputError: { borderColor: '#dc2626' },
  errorText: { fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 },
  selectedTag: { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#333', fontSize: '0.8rem', fontWeight: 600, width: 'fit-content' as const },
  pillGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' },
  pillBtn: { display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', outline: 'none', boxShadow: 'none', appearance: 'none' as const, WebkitAppearance: 'none' as const },
  pillBtnActive: { backgroundColor: '#6b8c1f', border: '1px solid #6b8c1f', color: '#fff' },
  formActions: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn: { padding: '0.5rem 1.25rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#333' },
  saveBtn: { padding: '0.5rem 1.25rem', backgroundColor: '#6b8c1f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' },
};
