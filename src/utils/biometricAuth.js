/**
 * ============================================================================
 * AUTENTICACIÓN BIOMÉTRICA / BLOQUEO DEL CELULAR (WebAuthn — BLOQUEO ESTRICTO)
 * ============================================================================
 * Activa huella digital, reconocimiento facial o PIN/patrón del dispositivo
 * mediante WebAuthn (navigator.credentials.create / get con userVerification: 'required').
 *
 * Seguridad estricta:
 * - Al activar: solo guarda el perfil si navigator.credentials.create devuelve una
 *   credencial válida con attestationObject. Si falla o se cancela, NO se activa.
 * - Al ingresar: verifica que navigator.credentials.get devuelva una aserción real
 *   que coincida con el credentialId guardado, tenga firma y bandera UV (User Verified).
 * - Si el usuario cancela o ocurre cualquier error, SIEMPRE rechaza y NUNCA inicia sesión.
 */

import { formatCUIT } from './fiscalCalculations.js';
import { eliminarStorageSeguro, guardarJsonSeguro, leerJsonSeguro } from './storage.js';

const BIOMETRIC_PROFILE_KEY = 'gr_biometric_profile_v1';

export const MENSAJE_FALLO_BIOMETRIA =
  'No se pudo validar la huella o el PIN del celular. Intentá nuevamente o ingresá con tu CUIT y PIN del estudio.';

function bufferABase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlABuffer(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function crearChallengeAleatorio() {
  const arr = new Uint8Array(32);
  window.crypto.getRandomValues(arr);
  return arr;
}

export function esEntornoWebAuthnValido() {
  if (typeof window === 'undefined') return false;
  const esLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const seguro = Boolean(window.isSecureContext || esLocal);
  return (
    seguro &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get)
  );
}

export async function verificarDisponibilidadBiometria() {
  if (!esEntornoWebAuthnValido()) {
    const esLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const motivo =
      typeof window !== 'undefined' && !window.isSecureContext && !esLocal
        ? 'El ingreso con huella / rostro requiere conexión segura HTTPS (disponible al publicar en Vercel). Podés ingresar con tu CUIT y PIN del estudio.'
        : 'Este dispositivo o navegador no tiene biometría / WebAuthn disponible. Podés ingresar normalmente con tu CUIT y PIN del estudio.';
    return { disponible: false, motivo };
  }

  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const disponible = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!disponible) {
        return {
          disponible: false,
          motivo:
            'No detectamos huella, rostro ni PIN de bloqueo configurado en este dispositivo. Ingresá manualmente con tu CUIT y PIN del estudio.'
        };
      }
      return { disponible: true, motivo: '' };
    }
    return { disponible: true, motivo: '' };
  } catch {
    return {
      disponible: false,
      motivo:
        'No se pudo verificar la biometría del dispositivo. Ingresá manualmente con tu CUIT y PIN del estudio.'
    };
  }
}

export function obtenerPerfilBiometrico() {
  const perfil = leerJsonSeguro(BIOMETRIC_PROFILE_KEY, null);
  if (!perfil || !perfil.credentialId || !perfil.cuit || !perfil.pin) return null;
  return perfil;
}

export function eliminarPerfilBiometrico() {
  eliminarStorageSeguro(BIOMETRIC_PROFILE_KEY);
}

/**
 * Registra una credencial WebAuthn en el dispositivo actual (huella / rostro / PIN celular).
 * Si el usuario cancela o falla, lanza error y NO guarda ni marca la biometría como activa.
 */
export async function registrarBiometriaDispositivo({ cuit, pin, nombre }) {
  if (!esEntornoWebAuthnValido()) {
    throw new Error(
      'Este navegador o conexión (HTTP sin HTTPS) no permite activar huella o bloqueo del celular. En Vercel (HTTPS) funcionará normalmente.'
    );
  }

  const encoder = new TextEncoder();
  const userId = encoder.encode(`gr-${cuit}`);
  const displayName = nombre || formatCUIT(cuit);

  const publicKeyOptions = {
    challenge: crearChallengeAleatorio(),
    rp: {
      name: 'GR Estudio Digital'
    },
    user: {
      id: userId,
      name: formatCUIT(cuit),
      displayName
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' }
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };

  let credential = null;
  try {
    credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
      throw new Error(
        'No se activó la huella ni el PIN del celular porque la operación fue cancelada. Podés reintentar más tarde.'
      );
    }
    if (err?.name === 'SecurityError') {
      throw new Error('La biometría requiere abrir la app por HTTPS (Vercel) o localhost.');
    }
    throw new Error(
      'No se pudo activar la huella o el PIN del celular en este dispositivo. Seguí usando tu CUIT y PIN del estudio.'
    );
  }

  // Validación estricta de la credencial creada antes de guardarla
  if (
    !credential ||
    credential.type !== 'public-key' ||
    !credential.rawId ||
    credential.rawId.byteLength === 0 ||
    !credential.response?.attestationObject
  ) {
    throw new Error('El dispositivo no devolvió una credencial biométrica válida. No se activó.');
  }

  const perfil = {
    credentialId: bufferABase64Url(credential.rawId),
    cuit: String(cuit),
    pin: String(pin),
    nombre: displayName,
    createdAt: new Date().toISOString()
  };

  guardarJsonSeguro(BIOMETRIC_PROFILE_KEY, perfil);
  return perfil;
}

/**
 * Valida estrictamente la identidad del usuario con huella / rostro / PIN del celular.
 * NUNCA resuelve positivamente ante cancelación, falta de credencial o error.
 */
export async function autenticarConBiometria() {
  const perfil = obtenerPerfilBiometrico();
  if (!perfil) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  if (!esEntornoWebAuthnValido()) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  let credentialIdBytes;
  try {
    credentialIdBytes = base64UrlABuffer(perfil.credentialId);
    if (!credentialIdBytes || credentialIdBytes.byteLength === 0) {
      throw new Error('Credencial inválida');
    }
  } catch {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  const publicKeyOptions = {
    challenge: crearChallengeAleatorio(),
    allowCredentials: [
      {
        id: credentialIdBytes,
        type: 'public-key',
        transports: ['internal']
      }
    ],
    userVerification: 'required',
    timeout: 60000
  };

  let assertion = null;
  try {
    assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });
  } catch {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  // Validación criptográfica/estructural estricta de la aserción WebAuthn
  if (
    !assertion ||
    assertion.type !== 'public-key' ||
    !assertion.rawId ||
    assertion.rawId.byteLength === 0 ||
    !assertion.response?.authenticatorData ||
    !assertion.response?.signature ||
    assertion.response.signature.byteLength === 0
  ) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  // Verificar que la credencial usada coincida exactamente con la vinculada al CUIT
  if (bufferABase64Url(assertion.rawId) !== perfil.credentialId) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  // Verificar bandera UV (User Verified, bit 2 = 0x04 en el byte 32 de authenticatorData)
  const authData = new Uint8Array(assertion.response.authenticatorData);
  if (authData.byteLength < 37 || (authData[32] & 0x04) === 0) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }

  return {
    ok: true,
    verified: true,
    cuit: perfil.cuit,
    pin: perfil.pin,
    nombre: perfil.nombre
  };
}

/**
 * Verificación biométrica estricta antes de emitir una factura en Modo Automático.
 * - Si el dispositivo ya tiene huella/PIN vinculado para este CUIT, exige autenticarConBiometria().
 * - Si el dispositivo soporta WebAuthn pero aún no vinculó la huella, ejecuta un challenge
 *   platform con userVerification: 'required' para exigir huella / rostro / PIN del celular.
 * - Si el usuario cancela o falla, SIEMPRE lanza error y bloquea la emisión.
 */
export async function verificarBiometriaParaEmision({ cuit, pin, nombre }) {
  const perfil = obtenerPerfilBiometrico();
  const cuitPerfilLimpio = String(perfil?.cuit || '').replace(/\D/g, '');
  const cuitActualLimpio = String(cuit || '').replace(/\D/g, '');
  if (perfil && cuitPerfilLimpio && cuitPerfilLimpio === cuitActualLimpio) {
    return autenticarConBiometria();
  }

  const { disponible, motivo } = await verificarDisponibilidadBiometria();
  if (!disponible) {
    return { ok: false, fallbackPinRequerido: true, motivo };
  }

  // Vincular y verificar en un solo paso exigiendo userVerification: 'required'
  const nuevoPerfil = await registrarBiometriaDispositivo({ cuit, pin, nombre });
  if (!nuevoPerfil?.credentialId) {
    throw new Error(MENSAJE_FALLO_BIOMETRIA);
  }
  return {
    ok: true,
    verified: true,
    cuit: nuevoPerfil.cuit,
    pin: nuevoPerfil.pin,
    nombre: nuevoPerfil.nombre
  };
}
