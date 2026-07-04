/* ============================================================
   API Client — JWT fetch wrapper
   ============================================================ */
const API_BASE = '/api/v1';
const TOKEN_KEY = 'mv_token';
const USER_KEY = 'mv_user';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY,t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
function setUser(u) { localStorage.setItem(USER_KEY,JSON.stringify(u)); }
function isAuthenticated() { return !!getToken(); }
function decodeToken(t) { try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; } }
function isTokenExpired(t) { const d = decodeToken(t); return !d||!d.exp||Date.now()>=d.exp*1000; }
async function apiRequest(method, path, options = {}) {
  const { body, params, headers: extraHeaders, signal } = options;
  const url = new URL(API_BASE+path, window.location.origin);
  if (params) Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='') url.searchParams.set(k,v);});
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json', ...extraHeaders };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer '+token;
  const config = { method, headers, signal };
  if (body && method !== 'GET') config.body = JSON.stringify(body);
  let response;
  try { response = await fetch(url.toString(), config); }
  catch (err) { if (err.name==='AbortError') throw err; throw new ApiError(0,'Erro de conexão. Verifique sua internet.'); }
  if (response.status === 401) { clearToken(); window.location.hash = '#/login'; throw new ApiError(401,'Sessão expirada. Faça login novamente.'); }
  let data = null;
  if ((response.headers.get('content-type')||'').includes('application/json')) { try { data = await response.json(); } catch { data = null; } }
  if (!response.ok) throw new ApiError(response.status, data?.detail||data?.message||data?.error||'Erro '+response.status, data);
  return data;
}
const api = { get:(p,o)=>apiRequest('GET',p,o), post:(p,b,o)=>apiRequest('POST',p,{...o,body:b}), put:(p,b,o)=>apiRequest('PUT',p,{...o,body:b}), patch:(p,b,o)=>apiRequest('PATCH',p,{...o,body:b}), delete:(p,o)=>apiRequest('DELETE',p,o) };
const auth = {
  async login(email, password) {
    const data = await api.post('/auth/login', { username: email, password });
    const token = data.access_token || data.token;
    const user = data.user || decodeToken(token);
    setToken(token); if (user) setUser(user);
    return { token, user };
  },
  async me() { const data = await api.get('/auth/me'); setUser(data); return data; },
  logout() { clearToken(); window.location.hash = '#/login'; },
  getToken, getUser, isAuthenticated, isTokenExpired, clearToken
};
class ApiError extends Error {
  constructor(status, message, data = null) { super(message); this.name = 'ApiError'; this.status = status; this.data = data; }
}
function createSSE(path, onMessage, onError) {
  const token = getToken();
  const source = new EventSource(API_BASE+path+'?token='+encodeURIComponent(token||''));
  source.onmessage = (event) => { try { onMessage(JSON.parse(event.data)); } catch { onMessage(event.data); } };
  source.onerror = (err) => { if (onError) onError(err); };
  return source;
}
async function uploadFile(path, file, fieldName = 'file', extraFields = {}) {
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, file);
  Object.entries(extraFields).forEach(([k,v])=>formData.append(k,v));
  const response = await fetch(API_BASE+path, { method:'POST', headers:{'Authorization':'Bearer '+token}, body:formData });
  if (response.status === 401) { clearToken(); window.location.hash = '#/login'; throw new ApiError(401,'Sessão expirada.'); }
  if (!response.ok) { const d = await response.json().catch(()=>({})); throw new ApiError(response.status, d.detail||d.message||'Upload falhou'); }
  return response.json();
}
