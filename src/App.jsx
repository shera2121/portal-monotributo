import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Fingerprint,
  LogOut,
  RefreshCw,
  RotateCcw,
  Share2,
  Shield,
  X
} from 'lucide-react';
import { ESTUDIO_INFO } from './config.js';
import {
  analyzeReceipt,
  estaEnModoDemo,
  getAdminDirectory,
  getPortalData,
  guardarAppsScriptUrl,
  obtenerAppsScriptUrl,
  requestConstancia,
  requestInvoice,
  requestVep,
  resetearDatosDemo,
  savePushSubscription,
  uploadReceipt
} from './services/api.js';
import { calcularEstadoMonotributo, formatCUIT } from './utils/fiscalCalculations.js';
import {
  eliminarStorageSeguro,
  guardarJsonSeguro,
  leerJsonSeguro
} from './utils/storage.js';
import BottomNav from './components/BottomNav.jsx';
import CargarComprobanteTab from './components/CargarComprobanteTab.jsx';
import FacturarTab from './components/FacturarTab.jsx';
import HistorialTab from './components/HistorialTab.jsx';
import InicioTab from './components/InicioTab.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import SimuladorTab from './components/SimuladorTab.jsx';
import PrivacyPolicyModal, {
  PRIVACY_CONSENT_STORAGE_KEY,
  PRIVACY_POLICY_VERSION
} from './components/PrivacyPolicyModal.jsx';
import {
  autenticarConBiometria,
  eliminarPerfilBiometrico,
  obtenerPerfilBiometrico,
  registrarBiometriaDispositivo,
  verificarDisponibilidadBiometria
} from './utils/biometricAuth.js';

const SESSION_KEY = 'gr_portal_session_v2';

export default function App() {
  // Leer parámetros de enlace privado (?cuit=...&chat_id=...&exp=...&sig=...&k=...)
  const parametrosUrl = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cuitParam = (params.get('cuit') || '').replace(/\D/g, '');
      const chatIdParam = (params.get('chat_id') || params.get('id') || params.get('pin') || '').trim();
      const expParam = (params.get('exp') || '').trim();
      const sigParam = (params.get('sig') || '').trim();
      const seccionParam = (params.get('seccion') || '').trim().toLowerCase();
      const kParam = params.get('k') || '';
      let scriptDecodificado = '';
      if (kParam) {
        try {
          scriptDecodificado = atob(kParam);
          if (scriptDecodificado.startsWith('https://script.google.com/')) {
            guardarAppsScriptUrl(scriptDecodificado);
          }
        } catch {
          // Ignorar parámetro malformado
        }
      }
      return { cuitParam, chatIdParam, expParam, sigParam, seccionParam, scriptDecodificado };
    } catch {
      return { cuitParam: '', chatIdParam: '', expParam: '', sigParam: '', seccionParam: '', scriptDecodificado: '' };
    }
  }, []);

  const modoDemo = estaEnModoDemo();

  const [sesion, setSesion] = useState(() => leerJsonSeguro(SESSION_KEY, null));
  const [portalData, setPortalData] = useState(null);
  const [tabActiva, setTabActiva] = useState('inicio');
  const [cargando, setCargando] = useState(false);
  const [errorLogin, setErrorLogin] = useState('');
  const [notificacion, setNotificacion] = useState(null);

  // Modal Modo Estudio (compatibilidad con contador)
  const [modalEstudio, setModalEstudio] = useState(false);
  const [urlScriptInput, setUrlScriptInput] = useState(() => obtenerAppsScriptUrl());
  const [claveEstudioInput, setClaveEstudioInput] = useState('');
  const [directorioEstudio, setDirectorioEstudio] = useState([]);
  const [cargandoEstudio, setCargandoEstudio] = useState(false);

  // Política de Privacidad y Términos (Ley 25.326)
  const [modalPrivacidad, setModalPrivacidad] = useState(false);
  const [privacidadAceptada, setPrivacidadAceptada] = useState(() => {
    const saved = leerJsonSeguro(PRIVACY_CONSENT_STORAGE_KEY, null);
    return Boolean(saved?.accepted && saved?.version === PRIVACY_POLICY_VERSION);
  });

  // Biometría / PIN del celular (WebAuthn)
  const [biometriaDisponible, setBiometriaDisponible] = useState(false);
  const [motivoSinBiometria, setMotivoSinBiometria] = useState('');
  const [perfilBiometrico, setPerfilBiometrico] = useState(() => obtenerPerfilBiometrico());
  const [activandoBiometria, setActivandoBiometria] = useState(false);
  const [bannerBiometriaOculto, setBannerBiometriaOculto] = useState(false);

  useEffect(() => {
    verificarDisponibilidadBiometria().then(({ disponible, motivo }) => {
      setBiometriaDisponible(disponible);
      setMotivoSinBiometria(motivo || '');
    });
  }, []);

  const registrarConsentimientoPrivacidad = (aceptado) => {
    setPrivacidadAceptada(aceptado);
    if (aceptado) {
      guardarJsonSeguro(PRIVACY_CONSENT_STORAGE_KEY, {
        accepted: true,
        version: PRIVACY_POLICY_VERSION,
        timestamp: new Date().toISOString()
      });
    } else {
      eliminarStorageSeguro(PRIVACY_CONSENT_STORAGE_KEY);
    }
  };

  const mostrarToast = (mensaje, tipo = 'exito') => {
    setNotificacion({ mensaje, tipo });
    setTimeout(() => {
      setNotificacion((actual) => (actual?.mensaje === mensaje ? null : actual));
    }, 4000);
  };

  const cargarDatosCliente = async (credenciales, { silencioso = false } = {}) => {
    if (!silencioso) setCargando(true);
    setErrorLogin('');
    try {
      const consentimientoActual =
        leerJsonSeguro(PRIVACY_CONSENT_STORAGE_KEY, null) ||
        (privacidadAceptada
          ? {
              accepted: true,
              version: PRIVACY_POLICY_VERSION,
              timestamp: new Date().toISOString()
            }
          : null);

      const data = await getPortalData({
        ...credenciales,
        consentimiento: consentimientoActual
      });
      setPortalData(data);
      const nuevaSesion = {
        cuit: data.cliente.CUIT,
        pin: credenciales.pin || data.cliente.PIN || data.cliente.Chat_ID
      };
      setSesion(nuevaSesion);
      guardarJsonSeguro(SESSION_KEY, nuevaSesion);
      return true;
    } catch (err) {
      const msg = err?.message || 'No se pudo iniciar sesión. Revisá tus datos.';
      setErrorLogin(msg);
      if (!silencioso) mostrarToast(msg, 'error');
      return false;
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  const handleActivarBiometria = async () => {
    if (!sesion || !clienteActual) return;
    setActivandoBiometria(true);
    try {
      const perfil = await registrarBiometriaDispositivo({
        cuit: sesion.cuit,
        pin: sesion.pin,
        nombre: clienteActual.Cliente
      });
      if (!perfil?.credentialId) {
        throw new Error('No se pudo validar la credencial biométrica.');
      }
      setPerfilBiometrico(perfil);
      setBannerBiometriaOculto(true);
      mostrarToast('¡Listo! Activaste el ingreso con huella / rostro o PIN del celular.');
    } catch (err) {
      // Nunca marcar la biometría como activa si falla o se cancela
      setPerfilBiometrico(obtenerPerfilBiometrico());
      mostrarToast(
        err?.message || 'No se pudo activar el ingreso biométrico en este dispositivo.',
        'error'
      );
    } finally {
      setActivandoBiometria(false);
    }
  };

  const handleLoginBiometrico = async () => {
    // Bloqueo estricto: solo inicia sesión si WebAuthn resuelve con verified === true
    const res = await autenticarConBiometria();
    if (!res || res.ok !== true || res.verified !== true) {
      throw new Error(
        'No se pudo validar la huella o el PIN del celular. Intentá nuevamente o ingresá con tu CUIT y PIN del estudio.'
      );
    }
    const ok = await cargarDatosCliente({ cuit: res.cuit, pin: res.pin });
    if (!ok) {
      throw new Error('No se pudo validar tu acceso con el estudio. Ingresá con tu CUIT y PIN.');
    }
  };

  const handleEliminarBiometria = () => {
    eliminarPerfilBiometrico();
    setPerfilBiometrico(null);
    mostrarToast('Se quitó el acceso rápido biométrico de este dispositivo.');
  };

  // Auto-login al abrir la app:
  // - Si el usuario tiene biometría activada en este dispositivo, NO hace auto-login silencioso
  //   (exige pasar por huella / rostro / PIN del celular o ingresar CUIT + PIN manualmente).
  useEffect(() => {
    if (parametrosUrl.sigParam && parametrosUrl.chatIdParam) {
      cargarDatosCliente({
        cuit: parametrosUrl.cuitParam,
        pin: parametrosUrl.chatIdParam,
        urlParams: parametrosUrl
      });
      return;
    }

    const tieneBiometriaActiva = Boolean(obtenerPerfilBiometrico());
    if (!tieneBiometriaActiva && sesion?.cuit && sesion?.pin && !portalData) {
      cargarDatosCliente(sesion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresco silencioso en modo producción cada 5 minutos
  useEffect(() => {
    if (!sesion || !portalData || modoDemo) return undefined;
    const id = setInterval(() => {
      cargarDatosCliente(sesion, { silencioso: true });
    }, ESTUDIO_INFO.intervaloSincronizacionMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, Boolean(portalData), modoDemo]);

  const clienteActual = portalData?.cliente || null;

  // Cálculos 100% REALES (nunca reciben ni mezclan montos del Simulador)
  const calculosReales = useMemo(() => {
    return calcularEstadoMonotributo(clienteActual, 0, 0);
  }, [clienteActual]);

  const alertasNoLeidas = useMemo(
    () => (portalData?.alertasArca || []).filter((a) => !a.leida).length,
    [portalData]
  );

  const handleCerrarSesion = () => {
    eliminarStorageSeguro(SESSION_KEY);
    setSesion(null);
    setPortalData(null);
    setTabActiva('inicio');
    setErrorLogin('');
    mostrarToast('Sesión cerrada correctamente.');
  };

  const handleRefrescar = async () => {
    if (!sesion) return;
    const ok = await cargarDatosCliente(sesion);
    if (ok) mostrarToast('Datos actualizados.');
  };

  const handleSolicitarVep = async (payload) => {
    try {
      const res = await requestVep({ cuit: sesion.cuit, pin: sesion.pin, payload });
      if (res?.portalData) {
        setPortalData(res.portalData);
      } else {
        await cargarDatosCliente(sesion, { silencioso: true });
      }
      mostrarToast(`Solicitud de VEP (${payload.impuesto}) enviada al estudio.`);
    } catch (err) {
      mostrarToast(err.message || 'No se pudo enviar la solicitud de VEP.', 'error');
    }
  };

  const handleSolicitarConstancia = async (payload) => {
    try {
      const res = await requestConstancia({ cuit: sesion.cuit, pin: sesion.pin, payload });
      if (res?.portalData) {
        setPortalData(res.portalData);
      } else {
        await cargarDatosCliente(sesion, { silencioso: true });
      }
      mostrarToast('Pedido de constancia actualizada enviado al estudio.');
    } catch (err) {
      mostrarToast(err.message || 'No se pudo solicitar la constancia.', 'error');
    }
  };

  const handleSolicitarFactura = async (payload) => {
    const esClienteAutomatico = Boolean(
      clienteActual?.facturacionAutomatica ||
        /autom[aá]tico|automatico_ws|direct/i.test(
          String(clienteActual?.Modalidad_ARCA || clienteActual?.Modo_Facturacion || '')
        )
    );
    if (
      esClienteAutomatico &&
      (payload?.verificacionBiometrica !== true || !payload?.biometricCredentialId)
    ) {
      const msgBloqueo =
        'Emisión bloqueada por seguridad: se requiere validación biométrica (huella dactilar) para emitir en modo AUTOMATICO_WS.';
      mostrarToast(msgBloqueo, 'error');
      throw new Error(msgBloqueo);
    }

    // Sincronizar estado local de perfil biométrico si se registró recién durante la emisión
    const perfilActualizado = obtenerPerfilBiometrico();
    if (perfilActualizado) {
      setPerfilBiometrico(perfilActualizado);
    }

    try {
      const res = await requestInvoice({ cuit: sesion.cuit, pin: sesion.pin, payload });
      if (res?.portalData) {
        setPortalData(res.portalData);
      } else {
        await cargarDatosCliente(sesion, { silencioso: true });
      }
      if (res?.pendientePorWsaa || res?.codigo === 'WSAA_TA_YA_VIGENTE') {
        mostrarToast(
          res?.message ||
            `${payload.tipoComprobante} resguardada como “Pendiente” porque ARCA tiene una sesión previa activa.`,
          'error'
        );
        return res;
      }
      const nroEmitido = res?.nroFormateado || res?.ncFormateada || '';
      const fueEmitida =
        Boolean(res?.cae) || String(res?.estado || '').toUpperCase().includes('EMITIDA');
      if (fueEmitida) {
        mostrarToast(
          `${payload.tipoComprobante}${nroEmitido ? ` N° ${nroEmitido}` : ''} emitida en ARCA${res?.cae ? ` (CAE: ${res.cae})` : ''}.`
        );
      } else {
        mostrarToast(`${payload.tipoComprobante} enviada con estado “Solicitada”.`);
      }
      return res;
    } catch (err) {
      mostrarToast(err.message || 'Error al solicitar el comprobante.', 'error');
      throw err;
    }
  };

  const handleSubirComprobante = async (payload) => {
    try {
      const res = await uploadReceipt({ cuit: sesion.cuit, pin: sesion.pin, payload });
      if (res?.portalData) {
        setPortalData(res.portalData);
      } else {
        await cargarDatosCliente(sesion, { silencioso: true });
      }
      if (res?.resumenConciliacion) {
        mostrarToast(res.mensaje || 'Extracto procesado y conciliado con éxito.');
      } else {
        mostrarToast(res?.mensaje || 'Comprobante enviado al estudio. Quedó “En revisión”.');
        setTabActiva('historial');
      }
      return res;
    } catch (err) {
      mostrarToast(err.message || 'No se pudo subir el comprobante.', 'error');
      throw err;
    }
  };

  const handleConsultarDirectorioEstudio = async (e) => {
    e.preventDefault();
    setCargandoEstudio(true);
    try {
      const lista = await getAdminDirectory({
        adminKey: claveEstudioInput,
        urlManual: urlScriptInput
      });
      setDirectorioEstudio(lista);
      mostrarToast(`Directorio cargado (${lista.length} clientes).`);
    } catch (err) {
      mostrarToast(err.message || 'No se pudo acceder al Modo Estudio.', 'error');
    } finally {
      setCargandoEstudio(false);
    }
  };

  const copiarLinkPrivado = (cli) => {
    let link = cli.Link_Privado || '';
    if (!link) {
      const params = new URLSearchParams();
      params.set('cuit', cli.CUIT);
      params.set('pin', cli.Chat_ID !== 'S/D' ? cli.Chat_ID : cli.CUIT);
      if (urlScriptInput.startsWith('https://script.google.com/')) {
        try {
          params.set('k', btoa(urlScriptInput.trim()));
        } catch {
          // Ignorar
        }
      }
      link = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    }
    navigator.clipboard?.writeText(link).then(() => {
      mostrarToast(`Enlace de ${cli.Cliente} copiado.`);
    });
  };

  return (
    <>
      {/* TOAST FLOTANTE */}
      {notificacion && (
        <div className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
          <div
            className={`max-w-md w-full pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-extrabold ${
              notificacion.tipo === 'error'
                ? 'bg-red-600 text-white border-red-700'
                : 'bg-petroleo text-white border-petroleo-dark'
            }`}
          >
            {notificacion.tipo === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-hueso" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-hueso" />
            )}
            <span className="leading-snug">{notificacion.mensaje}</span>
          </div>
        </div>
      )}

      {/* PANTALLA DE LOGIN SI NO HAY CLIENTE ACTIVO */}
      {!clienteActual ? (
        <LoginScreen
          onLogin={(creds) => cargarDatosCliente(creds)}
          cargando={cargando}
          errorExterno={errorLogin}
          modoDemo={modoDemo}
          onAbrirModoEstudio={() => setModalEstudio(true)}
          privacidadAceptada={privacidadAceptada}
          onTogglePrivacidad={registrarConsentimientoPrivacidad}
          onAbrirPrivacidad={() => setModalPrivacidad(true)}
          biometriaDisponible={biometriaDisponible}
          motivoSinBiometria={motivoSinBiometria}
          perfilBiometrico={perfilBiometrico}
          onLoginBiometrico={handleLoginBiometrico}
          onEliminarBiometria={handleEliminarBiometria}
        />
      ) : (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
          {/* BARRA SUPERIOR FIJA (CENTRADA PARA MÓVIL Y PROLIJA EN PC) */}
          <header className="sticky top-0 z-30 bg-petroleo text-white border-b-4 border-ladrillo shadow-md">
            <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-white p-0.5 flex items-center justify-center shadow-sm ring-2 ring-white/25 shrink-0 overflow-hidden">
                  <img
                    src="/logo-gr.png"
                    alt="GR Estudio Digital"
                    className="w-full h-full object-contain rounded-full"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-sm font-black tracking-tight truncate">
                      {ESTUDIO_INFO.nombreCorto}
                    </h1>
                    {modoDemo && (
                      <span className="text-[9px] font-black uppercase bg-hueso text-petroleo px-1.5 py-0.5 rounded-md">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-petroleo-100 truncate">
                    {clienteActual.Cliente}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {modoDemo && (
                  <button
                    type="button"
                    onClick={() => {
                      const limpio = resetearDatosDemo();
                      setPortalData(limpio);
                      mostrarToast('Datos demo restaurados.');
                    }}
                    title="Restaurar datos demo iniciales"
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-hueso transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRefrescar}
                  disabled={cargando}
                  title="Actualizar datos"
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition"
                >
                  <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={handleCerrarSesion}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl border border-white/20 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          </header>

          {/* CONTENIDO PRINCIPAL (MOBILE-FIRST CENTRADO EN ESCRITORIO) */}
          <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-28">
            {/* BANNER PARA ACTIVAR HUELLA / ROSTRO / PIN DEL CELULAR TRAS INICIAR SESIÓN */}
            {biometriaDisponible &&
              !bannerBiometriaOculto &&
              perfilBiometrico?.cuit !== clienteActual.CUIT && (
                <div className="mb-4 bg-white rounded-3xl border-2 border-petroleo/20 shadow-sm p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-petroleo-50 text-petroleo flex items-center justify-center shrink-0">
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-petroleo leading-tight">
                        Ingresá más rápido y seguro
                      </p>
                      <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
                        Vinculá tu cuenta con la huella, rostro o PIN de bloqueo de este celular.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={activandoBiometria}
                      onClick={handleActivarBiometria}
                      className="flex-1 sm:flex-none bg-petroleo hover:bg-petroleo-dark disabled:opacity-60 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-xl shadow-sm transition active:scale-95"
                    >
                      {activandoBiometria
                        ? 'Activando...'
                        : 'Activar huella / rostro o PIN del celular'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerBiometriaOculto(true)}
                      aria-label="Ocultar aviso de biometría"
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

            {tabActiva === 'inicio' && (
              <InicioTab
                cliente={clienteActual}
                calculos={calculosReales}
                alertasArca={portalData?.alertasArca || []}
                solicitudesDocumentos={portalData?.solicitudesTramites || []}
                actualizando={cargando}
                autoScrollDocumentos={parametrosUrl.seccionParam === 'documentos'}
                onActualizarInforme={handleRefrescar}
                onGuardarSuscripcionPush={(subData) =>
                  savePushSubscription({
                    cuit: sesion?.cuit || clienteActual.CUIT,
                    pin: sesion?.pin || '',
                    payload: subData
                  })
                }
                onSolicitarVep={handleSolicitarVep}
                onSolicitarConstancia={handleSolicitarConstancia}
                onIrASimulador={() => {
                  setTabActiva('simulador');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onToast={mostrarToast}
              />
            )}

            {tabActiva === 'facturar' && (
              <FacturarTab
                cliente={clienteActual}
                ventas={portalData?.ventas || []}
                sesionPin={sesion?.pin || ''}
                onSolicitarFactura={handleSolicitarFactura}
                onToast={mostrarToast}
              />
            )}

            {tabActiva === 'cargar' && (
              <CargarComprobanteTab
                comprasGastos={portalData?.comprasGastos || []}
                modoDemo={modoDemo}
                onAnalizarComprobante={(payload) =>
                  analyzeReceipt({ cuit: sesion.cuit, pin: sesion.pin, payload })
                }
                onSubirComprobante={handleSubirComprobante}
                onIrAHistorial={() => setTabActiva('historial')}
                onToast={mostrarToast}
              />
            )}

            {tabActiva === 'historial' && (
              <HistorialTab
                cliente={clienteActual}
                ventas={portalData?.ventas || []}
                comprasGastos={portalData?.comprasGastos || []}
                onToast={mostrarToast}
              />
            )}

            {tabActiva === 'simulador' && (
              <SimuladorTab key={clienteActual.CUIT} cliente={clienteActual} />
            )}

            {/* PIE LEGAL Y ACCESO BIOMÉTRICO EN APP LOGUEADA */}
            <footer className="mt-6 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <button
                type="button"
                onClick={() => setModalPrivacidad(true)}
                className="inline-flex items-center gap-1.5 font-bold text-petroleo hover:text-ladrillo hover:underline transition"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Política de Privacidad</span>
              </button>

              {biometriaDisponible &&
                (perfilBiometrico?.cuit === clienteActual.CUIT ? (
                  <button
                    type="button"
                    onClick={handleEliminarBiometria}
                    className="inline-flex items-center gap-1.5 font-bold text-emerald-700 hover:text-red-700 transition"
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Huella / PIN celular activo · Desactivar</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={activandoBiometria}
                    onClick={handleActivarBiometria}
                    className="inline-flex items-center gap-1.5 font-bold text-petroleo hover:text-ladrillo transition"
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Activar huella / rostro o PIN</span>
                  </button>
                ))}
            </footer>
          </main>

          {/* BARRA INFERIOR FIJA DE 5 POSICIONES */}
          <BottomNav
            tabActiva={tabActiva}
            onChangeTab={(nueva) => {
              setTabActiva(nueva);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            badgeAlertas={alertasNoLeidas}
          />
        </div>
      )}

      {/* MODAL MODO ESTUDIO (COMPATIBILIDAD CON CONTADOR / URL APPS SCRIPT) */}
      {modalEstudio && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-petroleo text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-hueso" />
                <h4 className="font-extrabold text-base">Modo Estudio Contable</h4>
              </div>
              <button
                type="button"
                onClick={() => setModalEstudio(false)}
                className="p-1 rounded-lg hover:bg-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleConsultarDirectorioEstudio} className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold text-petroleo mb-1">
                    URL Google Apps Script (/exec)
                  </label>
                  <input
                    type="url"
                    required
                    value={urlScriptInput}
                    onChange={(e) => setUrlScriptInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-xs font-mono focus:outline-none focus:border-petroleo"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-petroleo mb-1">
                    Clave del Estudio (ADMIN_PORTAL_KEY)
                  </label>
                  <input
                    type="password"
                    required
                    value={claveEstudioInput}
                    onChange={(e) => setClaveEstudioInput(e.target.value)}
                    placeholder="Clave privada del estudio..."
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-bold focus:outline-none focus:border-petroleo"
                  />
                </div>
                <button
                  type="submit"
                  disabled={cargandoEstudio}
                  className="w-full py-3 rounded-xl bg-petroleo hover:bg-petroleo-dark text-white font-extrabold text-xs"
                >
                  {cargandoEstudio ? 'Consultando planilla...' : 'Guardar URL y Abrir Directorio'}
                </button>
              </form>

              {directorioEstudio.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-extrabold text-petroleo">
                    Clientes sincronizados ({directorioEstudio.length})
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {directorioEstudio.map((cli, idx) => (
                      <div
                        key={cli.CUIT + idx}
                        className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">{cli.Cliente}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {formatCUIT(cli.CUIT)} • Cat. {cli.Categoria_Actual}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copiarLinkPrivado(cli)}
                          className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-ladrillo text-white px-2.5 py-1.5 rounded-lg shrink-0"
                        >
                          <Share2 className="w-3 h-3" />
                          <span>Link</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MODAL POLÍTICA DE PRIVACIDAD Y TÉRMINOS DE USO (LEY 25.326) */}
      <PrivacyPolicyModal
        abierto={modalPrivacidad}
        onCerrar={() => setModalPrivacidad(false)}
        onAceptar={
          !clienteActual
            ? () => {
                registrarConsentimientoPrivacidad(true);
                setModalPrivacidad(false);
              }
            : undefined
        }
      />
    </>
  );
}
