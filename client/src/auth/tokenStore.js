// Holds the JWT. Reads come from memory; localStorage only makes the login survive a page
// reload.
//
// Trade-off worth knowing: anything in localStorage can be read by JavaScript on this page,
// so an XSS bug could steal the token. An httpOnly cookie avoids that, but needs CSRF
// protection instead. For this project the token is short-lived (1h) and React escapes
// rendered text by default, which keeps the XSS risk low.
const STORAGE_KEY = 'momentum.token';

// localStorage can throw (private browsing, storage disabled), so every access is guarded.
// If it fails, the app still works; the login just won't survive a reload.
function readStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let token = readStorage();

export const tokenStore = {
  get() {
    return token;
  },
  set(value) {
    token = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignored: the in-memory copy is enough for this session
    }
  },
  clear() {
    token = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignored
    }
  },
};
