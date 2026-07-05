/* ============================================================
   App Router --- Client-side SPA navigation
   ============================================================ */

const ROUTES = {
  '#/login': { page: 'login', auth: false },
  '#/register': { page: 'register', auth: false },
  '#/dashboard': { page: 'dashboard', auth: true },
  '#/pedidos': { page: 'pedidos', auth: true },
  '#/pedido': { page: 'pedido-detalhe', auth: true },
};

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
  if (!route.auth && auth.isAuthenticated() && hash !== LOGIN_ROUTE && hash.split('?')[0].split('/').slice(0, 2).join('/') === '#/login') { navigateTo(DEFAULT_ROUTE); return; }
  renderPage(route, hash);
}

function resolveRoute(hash) {
  const base = hash.split('?')[0].split('/').slice(0, 2).join('/');
  if (ROUTES[base]) return ROUTES[base];
  for (const [pattern, route] of Object.entries(ROUTES)) {
    if ((pattern.includes(':') || pattern.endsWith('/*')) && hash.startsWith(pattern.replace('/:id', '').replace('/*', ''))) return route;
  }
  return null;
}

function getLoginHTML() {
  return '<div class="login-card__logo"><h1>\ud83c\udfac Mem\u00f3rias em V\u00eddeo</h1><p>Painel administrativo</p></div><div id="login-alerts"></div><form id="login-form" autocomplete="on" novalidate><div class="form-group"><label for="email">E-mail</label><input type="email" id="email" class="form-input" placeholder="seu@email.com" required autocomplete="email" inputmode="email"><div class="form-error hidden" id="email-error">Informe um e-mail v\u00e1lido</div></div><div class="form-group"><label for="password">Senha</label><input type="password" id="password" class="form-input" placeholder="Sua senha" required autocomplete="current-password" minlength="4"><div class="form-error hidden" id="password-error">A senha \u00e9 obrigat\u00f3ria</div></div><button type="submit" id="login-btn" class="btn btn-primary btn-block btn-lg">Entrar</button></form><p class="login-card__footer">Ambiente seguro \u00b7 TLS 1.3</p>';
}

function getDashboardHTML() {
  return '<div class="dashboard"><div class="card"><h3>Bem-vindo ao painel</h3><p>Selecione uma op\u00e7\u00e3o no menu ao lado.</p></div><div class="dashboard-stats"><div class="card stat-card"><div class="stat-value" id="stat-pedidos">-</div><div class="stat-label">Pedidos</div></div><div class="card stat-card"><div class="stat-value" id="stat-eventos">-</div><div class="stat-label">Eventos</div></div></div></div>';
}

function getPedidosHTML() {
  return '<div class="pedidos-page"><div class="page-actions"><h3>Pedidos</h3></div><div id="pedidos-table-container"><table class="table"><thead><tr><th>ID</th><th>Evento</th><th>Cliente</th><th>Status</th><th>Data</th><th>A\u00e7\u00f5es</th></tr></thead><tbody id="pedidos-tbody"><tr><td colspan="6" class="text-center">Carregando...</td></tr></tbody></table></div></div>';
}

function getPedidoDetalheHTML() {
  return '<div class="pedido-detalhe"><div class="page-actions"><a href="#/pedidos" class="btn btn-secondary">\u2190 Voltar</a><h3 id="pedido-title">Pedido</h3></div><div class="card" id="pedido-content"><p>Carregando detalhes do pedido...</p></div></div>';
}

async function checkAdminStatus() {
  const alerts = document.getElementById('login-alerts');
  if (!alerts) return;
  try {
    const status = await auth.status();
    if (!status.has_admin) {
      alerts.innerHTML = '<div class="alert alert--info">Nenhum admin cadastrado. <a href="#/register">Crie sua conta</a>.</div>';
    }
  } catch (e) {}
}

function initLoginForm() {
  checkAdminStatus();
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const alerts = document.getElementById('login-alerts');
    if (!email || !password) {
      alerts.innerHTML = '<div class="alert alert--error">Preencha todos os campos.</div>';
      return;
    }
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    try {
      const result = await auth.login(email, password);
      if (result.token) {
        setTimeout(() => { window.location.hash = '#/dashboard'; window.location.reload(); }, 100);
      }
    } catch (err) {
      alerts.innerHTML = '<div class="alert alert--error">' + (err.message || 'Erro ao fazer login') + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

function getRegisterHTML() {
  return '<div class="register-container"><div class="register-card"><div class="register-header"><h1>Criar Administrador</h1><p>Primeiro acesso? Crie sua conta de administrador.</p></div><div id="register-alerts"></div><form id="register-form" onsubmit="return false;"><div class="form-group"><label for="reg-nome">Nome</label><input type="text" id="reg-nome" placeholder="Seu nome" required /></div><div class="form-group"><label for="reg-email">E-mail</label><input type="email" id="reg-email" placeholder="seu@email.com" required /></div><div class="form-group"><label for="reg-password">Senha</label><input type="password" id="reg-password" placeholder="Sua senha" required minlength="6" /></div><div class="form-group"><label for="reg-confirm">Confirmar senha</label><input type="password" id="reg-confirm" placeholder="Repita a senha" required /></div><button type="submit" class="btn btn--primary btn--block">Criar conta</button></form><p class="register-footer">Ja tem conta? <a href="#/login">Faca login</a></p></div></div>';
}

async function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('reg-nome').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmEl = document.getElementById('reg-confirm').value;
    const alerts = document.getElementById('register-alerts');
    if (!nome || !email || !password) { alerts.innerHTML = '<div class="alert alert--error">Preencha todos os campos.</div>'; return; }
    if (password !== confirmEl) { alerts.innerHTML = '<div class="alert alert--error">Senhas nao conferem.</div>'; return; }
    if (password.length < 6) { alerts.innerHTML = '<div class="alert alert--error">Senha deve ter no minimo 6 caracteres.</div>'; return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Criando...';
    try {
      const result = await auth.register(email, password, nome);
      alerts.innerHTML = '<div class="alert alert--success">' + result.message + '</div>';
      if (result.has_admin) { setTimeout(() => { window.location.hash = '#/login'; }, 2000); }
    } catch (err) {
      alerts.innerHTML = '<div class="alert alert--error">' + (err.message || 'Erro ao criar admin') + '</div>';
    } finally { btn.disabled = false; btn.textContent = 'Criar conta'; }
  });
}

async function loadDashboard() {
  try {
    const data = await api.get('/stats');
    const el1 = document.getElementById('stat-pedidos');
    if (el1) el1.textContent = (data && data.pedidos) ?? '-';
    const el2 = document.getElementById('stat-eventos');
    if (el2) el2.textContent = (data && data.eventos) ?? '-';
  } catch (e) {}
}

async function loadPedidos(params) {
  const tbody = document.getElementById('pedidos-tbody');
  if (!tbody) return;
  try {
    const data = await api.get('/pedidos', params);
    const pedidos = (data && data.pedidos) || data || [];
    if (!pedidos.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum pedido encontrado.</td></tr>'; return; }
    tbody.innerHTML = pedidos.map(function(p) {
      var sid = (p.id && p.id.slice(0, 8)) || p.id || '-';
      var sevt = (p.evento && p.evento.nome) || p.evento || '-';
      var scli = (p.cliente && p.cliente.nome) || p.cliente || '-';
      var badge = p.status === 'concluido' ? 'success' : (p.status === 'processando' ? 'warning' : 'info');
      var sdate = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-';
      return '<tr><td>' + sid + '</td><td>' + sevt + '</td><td>' + scli + '</td><td><span class="badge badge--' + badge + '">' + (p.status || '-') + '</span></td><td>' + sdate + '</td><td><a href="#/pedido/' + (p.id || '') + '" class="btn btn-sm btn-secondary">Detalhes</a></td></tr>';
    }).join('');
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-error">Erro ao carregar pedidos.</td></tr>';
  }
}

async function loadPedidoDetalhe(id) {
  var container = document.getElementById('pedido-content');
  var title = document.getElementById('pedido-title');
  if (!container) return;
  try {
    var data = await api.get('/pedidos/' + id);
    if (title) title.textContent = 'Pedido #' + ((data && data.id && data.id.slice(0, 8)) || id);
    container.innerHTML = data ? '<div class="detail-grid"><div class="detail-field"><label>ID</label><span>' + (data.id || '-') + '</span></div><div class="detail-field"><label>Evento</label><span>' + ((data.evento && data.evento.nome) || data.evento || '-') + '</span></div><div class="detail-field"><label>Cliente</label><span>' + ((data.cliente && data.cliente.nome) || data.cliente || '-') + '</span></div><div class="detail-field"><label>Status</label><span class="badge badge--' + (data.status === 'concluido' ? 'success' : 'info') + '">' + (data.status || '-') + '</span></div><div class="detail-field"><label>Criado em</label><span>' + (data.created_at ? new Date(data.created_at).toLocaleString('pt-BR') : '-') + '</span></div></div>' : '<p>Pedido n\u00e3o encontrado.</p>';
  } catch (e) {
    container.innerHTML = '<div class="alert alert--error">' + (e.message || 'Erro ao carregar pedido') + '</div>';
  }
}

async function renderPage(route, hash) {
  var params = extractParams(hash);
  renderAppLayout(route.auth);
  var pageEl = document.getElementById('page-content');
  if (!pageEl) return;
  pageEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
  try {
    switch (route.page) {
      case 'login': pageEl.innerHTML = getLoginHTML(); initLoginForm(); break;
      case 'register': pageEl.innerHTML = getRegisterHTML(); initRegisterForm(); break;
      case 'dashboard': pageEl.innerHTML = getDashboardHTML(); await loadDashboard(); break;
      case 'pedidos': pageEl.innerHTML = getPedidosHTML(); await loadPedidos(params); break;
      case 'pedido-detalhe':
        var pid = params.id || hash.split('/').pop();
        pageEl.innerHTML = getPedidoDetalheHTML();
        if (pid) { await loadPedidoDetalhe(pid); } else { pageEl.innerHTML = '<div class="empty-state"><p>Pedido n\u00e3o encontrado.</p></div>'; }
        break;
      default: pageEl.innerHTML = '<div class="empty-state"><p>P\u00e1gina n\u00e3o encontrada.</p></div>';
    }
  } catch (err) {
    pageEl.innerHTML = '<div class="alert alert--error">' + escapeHtml(err.message) + '</div>';
  }
  updateActiveNav(route.page);
}

function renderAppLayout(isAuthenticated) {
  if (!isAuthenticated) { $app.innerHTML = '<div class="login-page"><div class="login-card" id="page-content"></div></div>'; return; }
  $app.innerHTML = '<div class="app-layout"><div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div><aside class="sidebar" id="sidebar"><div class="sidebar__brand"><h1>Mem\u00f3rias</h1><span>em V\u00eddeo</span></div><nav class="sidebar__nav"><a href="#/dashboard" class="sidebar__link" data-nav="dashboard"><span class="icon">\ud83d\udcca</span> Dashboard</a><a href="#/pedidos" class="sidebar__link" data-nav="pedidos"><span class="icon">\ud83d\udccb</span> Pedidos</a></nav><div class="sidebar__footer"><a href="#" onclick="auth.logout(); return false;" class="sidebar__link"><span class="icon">\ud83d\udeaa</span> Sair</a></div></aside><main class="main-content"><header class="topbar"><button class="menu-toggle" onclick="toggleSidebar()" aria-label="Menu">\u2630</button><div class="topbar__title"><h2 id="page-title">Dashboard</h2><p id="page-subtitle">Vis\u00e3o geral</p></div><div class="topbar__actions"><div class="topbar__user"><span id="user-name">' + escapeHtml((auth.getUser() && auth.getUser().name) || '') + '</span></div></div></header><div class="page-content" id="page-content"></div></main></div>';
}

function updateActiveNav(pageName) { document.querySelectorAll('[data-nav]').forEach(function(el) { el.classList.toggle('sidebar__link--active', el.dataset.nav === pageName); }); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('sidebar--open'); document.getElementById('sidebar-overlay').classList.toggle('sidebar-overlay--visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay--visible'); }
function navigateTo(hash) { window.location.hash = hash; }
function setPageMeta(title, subtitle) { var t = document.getElementById('page-title'); var s = document.getElementById('page-subtitle'); if (t) t.textContent = title; if (s) s.textContent = subtitle || ''; }
function extractParams(hash) { var params = {}; var qi = hash.indexOf('?'); if (qi !== -1) { new URLSearchParams(hash.slice(qi)).forEach(function(v, k) { params[k] = v; }); } return params; }
function escapeHtml(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function toast(message, type) {
  type = type || 'info';
  var container = getToastContainer();
  var el = document.createElement('div');
  el.className = 'toast toast--' + type;
  el.innerHTML = '<span>' + escapeHtml(message) + '</span><button class="toast__close" onclick="this.parentElement.classList.add(\'toast--exit\');setTimeout(function(){this.parentElement.remove()}.bind(this),300)">\u00d7</button>';
  container.appendChild(el);
  setTimeout(function() { if (el.parentElement) { el.classList.add('toast--exit'); setTimeout(function() { el.remove(); }, 300); } }, 4000);
}
function getToastContainer() {
  var container = document.getElementById('toast-container');
  if (!container) { container = document.createElement('div'); container.id = 'toast-container'; container.className = 'toast-container'; document.body.appendChild(container); }
  return container;
}
document.addEventListener('DOMContentLoaded', init);
