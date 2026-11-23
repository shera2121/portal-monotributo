/**
 * Lectura y escritura segura en localStorage (compatible con Safari iOS en modo privado)
 */

export const leerStorageSeguro = (clave, valorPorDefecto = '') => {
  try {
    const item = window.localStorage.getItem(clave);
    return item !== null ? item : valorPorDefecto;
  } catch {
    return valorPorDefecto;
  }
};

export const guardarStorageSeguro = (clave, valor) => {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Ignorar en modo privado estricto
  }
};

export const eliminarStorageSeguro = (clave) => {
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // Ignorar
  }
};

export const leerJsonSeguro = (clave, fallback = null) => {
  try {
    const raw = window.localStorage.getItem(clave);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const guardarJsonSeguro = (clave, objeto) => {
  try {
    window.localStorage.setItem(clave, JSON.stringify(objeto));
  } catch {
    // Ignorar
  }
};
