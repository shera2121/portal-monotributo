/**
 * ============================================================================
 * AUTENTICACIÓN BIOMÉTRICA / BLOQUEO DEL CELULAR (WebAuthn)
 * ============================================================================
 * Activa huella digital, reconocimiento facial o PIN/patrón del dispositivo
 * mediante WebAuthn (navigator.credentials.create / get con userVerification: 'required').
 *
 * Los datos biométricos nunca salen del dispositivo: el navegador solo confirma
 * que el titular del teléfono superó el desbloqueo local antes de habilitar el ingreso.
 */

import { formatCUIT } from './fiscalCalculations.js';
import { eliminarStorageSeguro, guardarJsonSeguro, leerJsonSeguro } from './storage.js';

const BIOMETRIC_PROFILE_KEY = 'gr_biometric_profile_v1';

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
  if (!esEntornoWebAuthnValido()) return false;
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const disponible = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return Boolean(disponible);
    }
    return true;
  } catch {
    return false;
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
 * Registra una credencial WebAuthn en el dispositivo actual (huella / rostro / PIN celular)
 * y la vincula con el CUIT y PIN validado del contribuyente en localStorage.
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
      { alg: -7, type: 'public-key' },   // ES256 (Android / iOS / Windows Hello)
      { alg: -257, type: 'public-key' }  // RS256 (fallback amplio)
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };

  try {
    const credential = await navigator.credentials.create({ publicKey: publicKeyOptions });
    if (!credential || !credential.rawId) {
      throw new Error('No se completó el registro biométrico.');
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
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
      throw new Error('Activación cancelada. Podés activarla más tarde o seguir usando tu CUIT y PIN.');
    }
    if (err?.name === 'SecurityError') {
      throw new Error(
        'La biometría requiere abrir la app por HTTPS (en Vercel) o en localhost.'
      );
    }
    throw new Error(
      err?.message || 'No se pudo activar la huella o bloqueo del celular en este dispositivo.'
    );
  }
}

/**
 * Verifica la identidad local con huella / rostro / PIN del celular y devuelve
 * las credenciales vinculadas para iniciar sesión contra Google Apps Script.
 */
export async function autenticarConBiometria() {
  const perfil = obtenerPerfilBiometrico();
  if (!perfil) {
    throw new Error('No hay una credencial biométrica guardada en este dispositivo.');
  }

  if (!esEntornoWebAuthnValido()) {
    throw new Error('Tu navegador no soporta ingreso biométrico en este contexto. Ingresá con tu CUIT y PIN.');
  }

  const publicKeyOptions = {
    challenge: crearChallengeAleatorio(),
    allowCredentials: [
      {
        id: base64UrlABuffer(perfil.credentialId),
        type: 'public-key',
        transports: ['internal']
      }
    ],
    userVerification: 'required',
    timeout: 60000
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey: publicKeyOptions });
    if (!assertion) {
      throw new Error('Verificación biométrica incompleta.');
    }
    return {
      ok: true,
      cuit: perfil.cuit,
      pin: perfil.pin,
      nombre: perfil.nombre
    };
  } catch (err) {
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
      throw new Error('Ingreso biométrico cancelado. Podés reintentar o ingresar con tu CUIT y PIN.');
    }
    throw new Error('No se pudo verificar tu huella/rostro. Ingresá con tu CUIT y PIN del estudio.');
  }
}
