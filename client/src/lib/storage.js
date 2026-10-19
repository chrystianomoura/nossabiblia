// localStorage pode lançar erro (navegação privada, armazenamento bloqueado); a app funciona sem ele.
export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* armazenamento indisponível */ }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* armazenamento indisponível */ }
}
