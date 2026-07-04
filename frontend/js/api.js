/* ============================================================
   API Client — JWT fetch wrapper
   ============================================================ */

const API_BASE = '/api/v1';

const TOKEN_KEY = 'mv_token';
const USER_KEY = 'mv_user';

// --- Token helpers ---
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function isAuthenticated() {
  return !!getToken();
}

// --- JWT decode (simple, no lib needed) ---
function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}

// --- Core request ---
async function apiRequest(method, path, options = {}) {
  const { body, params, headers: extraHeaders, signal } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders,
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = { method, headers, signal };
  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url.toString(), config);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Erro de conexão. Verifique sua internet.');
  }

  // Handle 401 — redirect to login
  if (response.status === 401) {
    clearToken();
    window.location.hash = '#/login';
    throw new ApiError(401, 'Sessão expirada. Faça login novamente.');
  }

  // Parse body
  let data = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      data?.error ||
      `Erro ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data;
}

// --- Convenience methods ---
const api = {
  get: (path, opts) => apiRequest('GET', path, opts),
  post: (path, body, opts) => apiRequest('POST', path, { ...opts, body }),
  put: (path, body, opts) => apiRequest('PUT', path, { ...opts, body }),
  patch: (path, body, opts) => apiRequest('PATCH', path, { ...opts, body }),
  delete: (path, opts) => apiRequest('DELETE', path, opts),
};

// --- Auth-specific ---
const auth = {
  async login(email, password) {
    const data = await api.post('/auth/login', {
      email, // Backend espera 'email', nao 'username'
      password,
    });
    // Support both { access_token, token_type } and { token, user }
    const token = data.access_token || data.token;
    const user = data.user || decodeToken(token);
    setToken(token);
    if (user) setUser(user);
    return { token, user };
  },

  async me() {
    const data = await api.get('/auth/me');
    setUser(data);
    return data;
  },

  logout() {
    clearToken();
    window.location.hash = '#/login';
  },

  getToken,
  getUser,
  isAuthenticated,
  isTokenExpired,
  clearToken,
};

// --- Custom error ---
class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// --- SSE helper (status streaming) ---
function createSSE(path, onMessage, onError) {
  const token = getToken();
  const url = `${API_BASE}${path}?token=${encodeURIComponent(token || '')}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };

  source.onerror = (err) => {
    if (onError) onError(err);
    // EventSource auto-reconnects by default
  };

  return source;
}

// --- File upload helper ---
async function uploadFile(path, file, fieldName = 'file', extraFields = {}) {
  const token = getToken();
  const url = `${API_BASE}${path}`;

  const formData = new FormData();
  formData.append(fieldName, file);
  Object.entries(extraFields).forEach(([k, v]) => formData.append(k, v));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (response.status === 401) {
    clearToken();
    window.location.hash = '#/login';
    throw new ApiError(401, 'Sessão expirada.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.detail || data.message || 'Upload falhou');
  }

  return response.json();
}
