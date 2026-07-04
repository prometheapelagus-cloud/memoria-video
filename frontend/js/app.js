/* ============================================================
   App Router — Client-side SPA navigation
   ============================================================ */
const ROUTES = { '#/login': { page: 'login', auth: false }, '#/dashboard': { page: 'dashboard', auth: true }, '#/pedidos': { page: 'pedidos', auth: true }, '#/pedido': { page: 'pedido-detalhe', auth: true } };
const DEFAULT_ROUTE = '#/dashboard';
const LOGIN_ROUTE = '#/login';
let $app;
function init() {
  $app = document.getElementById('app');
  if (!$app) return;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
function handleRoute() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const route = resolveRoute(hash);
  if (!route) { navigateTo(DEFAULT_ROUTE); return; }
  if (route.auth && !auth.isAuthenticated()) { navigateTo(LOGIN_ROUTE); return; }
  if (!route.auth && auth.isAuthenticated() && hash !== LOGIN_ROUTE && hash.split('?')[0].split('/').slice(0,2).join('/') === '#/login') { navigateTo(DEFAULT_ROUTE); return; }
  renderPage(route, hash);
}
function resolveRoute(hash) {
  const base = hash.split('?')[0].split('/').slice(0,2).join('/');
  if (ROUTES[base]) return ROUTES[base];
  for (const [pattern, route] of Object.entries(ROUTES)) {
    if ((pattern.includes(':')||pattern.endsWith('/*')) && hash.startsWith(pattern.replace('/:id','').replace('/*',''))) return route;
  }
  return null;
}
async function renderPage(route, hash) {
  const params = extractParams(hash);
  renderAppLayout(route.auth);
  const pageEl = document.getElementById('page-content');
  if (!pageEl) return;
  pageEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    switch (route.page) {
      case 'login': pageEl.innerHTML = getLoginHTML(); initLoginForm(); break;
      case 'dashboard': pageEl.innerHTML = getDashboardHTML(); await loadDashboard(); break;
      case 'pedidos': pageEl.innerHTML = getPedidosHTML(); await loadPedidos(params); break;
      case 'pedido-detalhe':
        const id = params.id || hash.split('/').pop();
        pageEl.innerHTML = getPedidoDetalheHTML();
        if (id) await loadPedidoDetalhe(id); else pageEl.innerHTML = '<div class="empty-state"><p>Pedido não encontrado.</p></div>';
        break;
      default: pageEl.innerHTML = '<div class="empty-state"><p>Página não encontrada.</p></div>';
    }
  } catch (err) { console.error(err); pageEl.innerHTML = '<div class="alert alert--error">'+escapeHtml(err.message)+'</div>'; }
  updateActiveNav(route.page);
}
function extractParams(hash) {
  const params = {};
  const qsIndex = hash.indexOf('?');
  if (qsIndex !== -1) new URLSearchParams(hash.slice(qsIndex)).forEach((v,k)=>params[k]=v);
  return params;
}
function escapeHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function renderAppLayout(isAuthenticated) {
  if (!isAuthenticated) { $app.innerHTML = '<div class="login-page"><div class="login-card" id="page-content"></div></div>'; return; }
  $app.innerHTML = '<div class="app-layout"><div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div><aside class="sidebar" id="sidebar"><div class="sidebar__brand"><h1>Memórias</h1><span>em Vídeo</span></div><nav class="sidebar__nav"><a href="#/dashboard" class="sidebar__link" data-nav="dashboard"><span class="icon">📊</span> Dashboard</a><a href="#/pedidos" class="sidebar__link" data-nav="pedidos"><span class="icon">📋</span> Pedidos</a></nav><div class="sidebar__footer"><a href="#" onclick="auth.logout(); return false;" class="sidebar__link"><span class="icon">🚪</span> Sair</a></div></aside><main class="main-content"><header class="topbar"><button class="menu-toggle" onclick="toggleSidebar()" aria-label="Menu">☰</button><div class="topbar__title"><h2 id="page-title">Dashboard</h2><p id="page-subtitle">Visão geral</p></div><div class="topbar__actions"><div class="topbar__user"><span id="user-name">'+(escapeHtml((auth.getUser()&&auth.getUser().name)||''))+'</span></div></div></header><div class="page-content" id="page-content"></div></main></div>';
}
function updateActiveNav(pageName) { document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('sidebar__link--active',el.dataset.nav===pageName)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('sidebar--open'); document.getElementById('sidebar-overlay').classList.toggle('sidebar-overlay--visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay--visible'); }
function navigateTo(hash) { window.location.hash = hash; }
function setPageMeta(title, subtitle) { const t=document.getElementById('page-title'); const s=document.getElementById('page-subtitle'); if (t) t.textContent=title; if (s) s.textContent=subtitle||''; }
function toast(message, type) {
  type = type||'info';
  const container = getToastContainer();
  const el = document.createElement('div');
  el.className = 'toast toast--'+type;
  el.innerHTML = '<span>'+escapeHtml(message)+'</span><button class="toast__close" onclick="this.parentElement.classList.add(\'toast--exit\');setTimeout(()=>this.parentElement.remove(),300)">×</button>';
  container.appendChild(el);
  setTimeout(()=>{if(el.parentElement){el.classList.add('toast--exit');setTimeout(()=>el.remove(),300);}},4000);
}
function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id='toast-container'; container.className='toast-container'; document.body.appendChild(container); }
  return container;
}
document.addEventListener('DOMContentLoaded', init);
