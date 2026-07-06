/* ============================================================
   App Router — Client-side SPA navigation (self-contained)
   ============================================================ */
const ROUTES = { '#/login': { page: 'login', auth: false }, '#/dashboard': { page: 'dashboard', auth: true }, '#/pedidos': { page: 'pedidos', auth: true }, '#/pedido': { page: 'pedido-detalhe', auth: true } };
const DEFAULT_ROUTE = '#/dashboard', LOGIN_ROUTE = '#/login';
let $app, chartInstance = null;

function init() { $app = document.getElementById('app'); if (!$app) return; window.addEventListener('hashchange', handleRoute); handleRoute(); }

function handleRoute() {
  const hash = window.location.hash || DEFAULT_ROUTE, route = resolveRoute(hash);
  if (!route) { navigateTo(DEFAULT_ROUTE); return; }
  if (route.auth && !auth.isAuthenticated()) { navigateTo(LOGIN_ROUTE); return; }
  if (!route.auth && auth.isAuthenticated() && hash !== LOGIN_ROUTE && hash.split('?')[0].split('/').slice(0,2).join('/') === '#/login') { navigateTo(DEFAULT_ROUTE); return; }
  renderPage(route, hash);
}

function resolveRoute(hash) {
  const base = hash.split('?')[0].split('/').slice(0,2).join('/');
  if (ROUTES[base]) return ROUTES[base];
  for (const [p, r] of Object.entries(ROUTES)) {
    if ((p.includes(':')||p.endsWith('/*')) && hash.startsWith(p.replace('/:id','').replace('/*',''))) return r;
  }
  return null;
}

function getLoginHTML() {
  return '<div class="login-card__logo"><h1>🎬 Memórias em Vídeo</h1><p>Painel administrativo</p></div><div id="login-alert"></div><form id="login-form" autocomplete="on" novalidate><div class="form-group"><label for="email">E-mail</label><input type="email" id="email" class="form-input" placeholder="seu@email.com" required autocomplete="email" inputmode="email"><div class="form-error hidden" id="email-error">Informe um e-mail válido</div></div><div class="form-group"><label for="password">Senha</label><input type="password" id="password" class="form-input" placeholder="Sua senha" required autocomplete="current-password" minlength="4"><div class="form-error hidden" id="password-error">A senha é obrigatória</div></div><button type="submit" id="login-btn" class="btn btn-primary btn-block btn-lg">Entrar</button></form><p class="login-card__footer">Ambiente seguro · TLS 1.3</p>';
}

function initLoginForm() {
  const form = document.getElementById('login-form'), btn = document.getElementById('login-btn'), alertEl = document.getElementById('login-alert');
  if (!form || !btn || !alertEl) return;
  form.addEventListener('submit', async function(e) {
    e.preventDefault(); alertEl.innerHTML = '';
    var email = document.getElementById('email').value.trim(), password = document.getElementById('password').value;
    var ee = document.getElementById('email-error'), pe = document.getElementById('password-error');
    if (ee) ee.classList.add('hidden'); if (pe) pe.classList.add('hidden');
    if (!email || !email.includes('@')) { if (ee) ee.classList.remove('hidden'); return; }
    if (!password || password.length < 4) { if (pe) pe.classList.remove('hidden'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span> Entrando...';
    try { await auth.login(email, password); window.location.hash = '#/dashboard'; }
    catch(err) { if (alertEl) alertEl.innerHTML = '<div class="alert alert--error">' + esc(err.message || 'Erro ao fazer login') + '</div>'; btn.disabled = false; btn.innerHTML = 'Entrar'; }
  });
}

function getDashboardHTML() {
  return '<div class="metrics-grid" id="metrics-grid">' +
    '<div class="metric-card"><div class="metric-card__icon metric-card__icon--blue">📦</div><div class="metric-card__label">Pedidos Hoje</div><div class="metric-card__value" id="metric-hoje"><div class="skeleton skeleton--text-lg" style="width:60px"></div></div></div>' +
    '<div class="metric-card"><div class="metric-card__icon metric-card__icon--green">📊</div><div class="metric-card__label">Este Mês</div><div class="metric-card__value" id="metric-mes"><div class="skeleton skeleton--text-lg" style="width:60px"></div></div></div>' +
    '<div class="metric-card"><div class="metric-card__icon metric-card__icon--yellow">✅</div><div class="metric-card__label">Taxa de Aprovação</div><div class="metric-card__value" id="metric-taxa"><div class="skeleton skeleton--text-lg" style="width:80px"></div></div></div>' +
    '<div class="metric-card"><div class="metric-card__icon metric-card__icon--red">⏱️</div><div class="metric-card__label">Tempo Médio</div><div class="metric-card__value" id="metric-tempo"><div class="skeleton skeleton--text-lg" style="width:80px"></div></div></div></div>' +
    '<div class="cols-2"><div class="card"><div class="card__header"><h3>📈 Pedidos por Tipo de Evento</h3></div><div class="card__body"><div class="chart-container"><canvas id="chart-eventos"></canvas></div></div></div>' +
    '<div class="card"><div class="card__header"><h3>📋 Últimos Pedidos</h3><a href="#/pedidos" class="btn btn-sm btn-secondary">Ver todos</a></div><div class="card__body" style="padding:0;"><div class="table-wrapper"><table><thead><tr><th>Cliente</th><th>Evento</th><th>Status</th><th>Data</th></tr></thead><tbody id="ultimos-pedidos-tbody"><tr class="skeleton-row"><td><div class="skeleton skeleton--text" style="width:60%"></div></td><td><div class="skeleton skeleton--text" style="width:50%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:40%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:30%"></div></td></tr></tbody></table></div></div></div></div>';
}

function getPedidosHTML() {
  return '<div class="card"><div class="card__header"><h3>📋 Pedidos</h3><span id="pedidos-count" style="font-size:var(--font-size-sm);color:var(--color-ink-secondary);"></span></div><div class="card__body">' +
    '<div class="filters-bar"><input type="text" class="form-input" id="filter-busca" placeholder="Buscar nome ou telefone..." oninput="debounceFilter()">' +
    '<select class="form-input" id="filter-status" onchange="applyFilters()"><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="aprovado">Aprovado</option><option value="processando">Processando</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option><option value="erro">Erro</option></select>' +
    '<select class="form-input" id="filter-evento" onchange="applyFilters()"><option value="">Todos os eventos</option></select>' +
    '<input type="date" class="form-input" id="filter-data-inicio" onchange="applyFilters()" title="Data início">' +
    '<input type="date" class="form-input" id="filter-data-fim" onchange="applyFilters()" title="Data fim"></div>' +
    '<div class="table-wrapper"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Evento</th><th>Status</th><th>Fotos</th><th>Data</th><th></th></tr></thead><tbody id="pedidos-tbody"><tr class="skeleton-row"><td><div class="skeleton skeleton--text" style="width:60%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:45%"></div></td><td><div class="skeleton skeleton--text" style="width:50%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:35%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:20%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:30%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:25%"></div></td></tr></tbody></table></div>' +
    '<div class="pagination" id="pagination"><span id="pagination-info">Carregando...</span><div class="pagination__buttons" id="pagination-buttons"></div></div></div></div>';
}

function getPedidoDetalheHTML() {
  return '<div id="pedido-detail-loading" class="loading-overlay"><div class="spinner"></div><span>Carregando pedido...</span></div>' +
    '<div id="pedido-detail-content" class="hidden">' +
    '<nav style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);flex-wrap:wrap;"><a href="#/pedidos" class="btn btn-sm btn-secondary">← Voltar</a><span id="detail-status" class="badge badge--info">Carregando...</span><span id="detail-id" style="font-size:var(--font-size-xs);color:var(--color-ink-muted);font-family:var(--font-mono);"></span></nav>' +
    '<div id="sse-status-bar" class="hidden alert alert--info" style="margin-bottom:var(--space-4);font-size:var(--font-size-xs);">🔄 Status atualizado em tempo real</div>' +
    '<div class="detail-grid"><div>' +
    '<div class="detail-section"><div class="detail-section__title">📸 Fotos Enviadas</div><div id="fotos-section"><div id="fotos-gallery" class="photo-gallery"></div><div id="fotos-empty" class="hidden"><div class="empty-state"><div class="empty-state__icon">🖼️</div><div class="empty-state__text">Nenhuma foto enviada</div></div></div></div></div>' +
    '<div class="detail-section"><div class="detail-section__title">🎯 Curadoria</div><div class="curation-tabs"><button class="curation-tab curation-tab--active" data-curation="all" onclick="filterCuration(\'all\')">Todas</button><button class="curation-tab" data-curation="selected" onclick="filterCuration(\'selected\')">Selecionadas</button><button class="curation-tab" data-curation="rejected" onclick="filterCuration(\'rejected\')">Rejeitadas</button></div><div id="curation-gallery" class="photo-gallery"></div></div></div>' +
    '<div><div class="detail-section"><div class="detail-section__title">👤 Cliente</div><div id="cliente-info"></div></div>' +
    '<div class="detail-section"><div class="detail-section__title">🎉 Evento</div><div id="evento-info"></div></div>' +
    '<div class="detail-section"><div class="detail-section__title">🎬 Vídeo</div><div id="video-section"><div id="video-empty" class="empty-state"><div class="empty-state__icon">🎥</div><div class="empty-state__text">Vídeo ainda não gerado</div><p>Após a curadoria e processamento, o vídeo aparecerá aqui.</p></div><div id="video-player-wrapper" class="hidden"><div class="video-player"><video id="video-player" controls preload="metadata"></video></div></div></div></div>' +
    '<div class="action-bar"><button class="btn btn-primary" onclick="reprocessarPedido()" id="btn-reprocessar">🔄 Reprocessar</button><button class="btn btn-danger" onclick="cancelarPedido()" id="btn-cancelar">🚫 Cancelar</button></div></div></div></div>';
}

function statusBadgeClass(s) {
  var map = { pendente: 'warning', aprovado: 'success', processando: 'info', concluido: 'success', 'concluído': 'success', cancelado: 'danger', rejeitado: 'danger', erro: 'danger' };
  return map[s ? s.toLowerCase() : ''] || 'neutral';
}

function statusLabelMap(s) {
  var map = { pendente: 'Pendente', aprovado: 'Aprovado', processando: 'Processando', concluido: 'Concluído', 'concluído': 'Concluído', cancelado: 'Cancelado', rejeitado: 'Rejeitado', erro: 'Erro' };
  return map[s ? s.toLowerCase() : ''] || s || '—';
}

function esc(str) { if (!str) return '—'; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

async function loadDashboard() {
  setPageMeta('Dashboard', 'Visão geral dos pedidos');
  try {
    var m = await api.get('/dashboard/metrics').catch(function() { return null; });
    var p = await api.get('/pedidos', { params: { limit: 5 } }).catch(function() { return null; });
    if (m) {
      document.getElementById('metric-hoje').innerHTML = m.hoje || '0';
      document.getElementById('metric-mes').innerHTML = m.mes || '0';
      document.getElementById('metric-taxa').innerHTML = m.taxa_aprovacao != null ? m.taxa_aprovacao + '%' : '—';
      document.getElementById('metric-tempo').innerHTML = m.tempo_medio || '—';
    }
    renderUltimosPedidos(p ? (Array.isArray(p) ? p : (p.items || p.data || [])) : []);
    try { renderPieChart(await api.get('/dashboard/eventos')); } catch (e) { renderPieChart(null); }
  } catch (e) { console.error(e); }
}

function renderUltimosPedidos(pedidos) {
  var tbody = document.getElementById('ultimos-pedidos-tbody');
  if (!tbody) return;
  if (!pedidos || !pedidos.length) { tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state" style="padding:var(--space-8)"><div class="empty-state__icon">📭</div><div class="empty-state__text">Nenhum pedido recente</div></div></td></tr>'; return; }
  var html = '';
  for (var i = 0; i < pedidos.length; i++) {
    var p = pedidos[i];
    var data = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—';
    html += '<tr onclick="window.location.href=\'#/pedido/' + p.id + '\'" style="cursor:pointer;">' +
      '<td><strong>' + esc(p.cliente_nome || p.nome || '—') + '</strong></td>' +
      '<td>' + esc(p.evento_nome || p.tipo_evento || '—') + '</td>' +
      '<td><span class="badge badge--' + statusBadgeClass(p.status) + '">' + statusLabelMap(p.status) + '</span></td>' +
      '<td>' + data + '</td></tr>';
  }
  tbody.innerHTML = html;
}

function renderPieChart(data) {
  var canvas = document.getElementById('chart-eventos');
  if (!canvas) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  var labels = data && data.length ? data.map(function(d) { return d.nome || d.tipo || 'Outros'; }) : ['Aniversário', 'Casamento', 'Formatura', 'Outros'];
  var values = data && data.length ? data.map(function(d) { return d.total || d.quantidade || d.count || 1; }) : [10, 7, 5, 3];
  var ctx = canvas.getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'pie',
    data: { labels: labels, datasets: [{ data: values, backgroundColor: ['oklch(45% 0.15 265)', 'oklch(50% 0.18 145)', 'oklch(60% 0.16 85)', 'oklch(50% 0 0)'].slice(0, labels.length), borderWidth: 2, borderColor: 'oklch(100% 0 0)' }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif' } } } } }
  });
}

var st = { page: 1, total: 0, totalPages: 1, filters: { status: '', evento: '', data_inicio: '', data_fim: '', busca: '' } };
var filterDebounce = null;

async function loadPedidos(params) {
  setPageMeta('Pedidos', 'Gerenciar pedidos dos clientes');
  if (params.status) st.filters.status = params.status;
  if (params.page) st.page = parseInt(params.page, 10);
  loadEventoOptions();
  await fetchPedidos();
}

async function fetchPedidos() {
  var tbody = document.getElementById('pedidos-tbody');
  if (!tbody) return;
  try {
    var qp = { page: st.page, limit: 15 };
    var f = st.filters;
    if (f.status) qp.status = f.status;
    if (f.evento) qp.evento = f.evento;
    if (f.busca) qp.busca = f.busca;
    if (f.data_inicio) qp.data_inicio = f.data_inicio;
    if (f.data_fim) qp.data_fim = f.data_fim;
    var data = await api.get('/pedidos', { params: qp });
    var items = data.items || data.data || data || [];
    st.total = data.total || items.length;
    st.totalPages = data.total_pages || data.pages || Math.ceil(st.total / 15) || 1;
    renderTable(items);
    renderPagination();
  } catch (err) { tbody.innerHTML = '<tr><td colspan="7"><div class="alert alert--error">' + esc(err.message) + '</div></td></tr>'; }
}

function renderTable(pedidos) {
  var tbody = document.getElementById('pedidos-tbody');
  if (!pedidos || !pedidos.length) { tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">Nenhum pedido encontrado</div></div></td></tr>'; return; }
  var html = '';
  for (var i = 0; i < pedidos.length; i++) {
    var p = pedidos[i];
    var data = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '—';
    html += '<tr>' +
      '<td><strong>' + esc(p.cliente_nome || p.nome || '—') + '</strong></td>' +
      '<td>' + esc(p.cliente_telefone || p.telefone || '—') + '</td>' +
      '<td>' + esc(p.evento_nome || p.tipo_evento || '—') + '</td>' +
      '<td><span class="badge badge--' + statusBadgeClass(p.status) + '">' + statusLabelMap(p.status) + '</span></td>' +
      '<td>' + (p.total_fotos || p.fotos_count || '—') + '</td>' +
      '<td>' + data + '</td>' +
      '<td><a href="#/pedido/' + p.id + '" class="btn btn-sm btn-secondary">Detalhes</a></td></tr>';
  }
  tbody.innerHTML = html;
}

function renderPagination() {
  var info = document.getElementById('pagination-info'), btns = document.getElementById('pagination-buttons');
  if (!info || !btns) return;
  info.textContent = 'Página ' + st.page + ' de ' + st.totalPages + ' · ' + st.total + ' pedido' + (st.total !== 1 ? 's' : '');
  var html = '<button class="pagination__btn" onclick="goToPage(' + (st.page - 1) + ')"' + (st.page <= 1 ? ' disabled' : '') + '>← Anterior</button>';
  for (var i = Math.max(1, st.page - 2); i <= Math.min(st.totalPages, st.page + 2); i++) { html += '<button class="pagination__btn' + (i === st.page ? ' pagination__btn--active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>'; }
  html += '<button class="pagination__btn" onclick="goToPage(' + (st.page + 1) + ')"' + (st.page >= st.totalPages ? ' disabled' : '') + '>Próxima →</button>';
  btns.innerHTML = html;
}

function goToPage(p) { if (p < 1 || p > st.totalPages) return; st.page = p; fetchPedidos(); window.location.hash = '#/pedidos?page=' + p; }
function applyFilters() {
  st.filters.status = document.getElementById('filter-status').value;
  st.filters.evento = document.getElementById('filter-evento').value;
  st.filters.data_inicio = document.getElementById('filter-data-inicio').value;
  st.filters.data_fim = document.getElementById('filter-data-fim').value;
  st.page = 1; fetchPedidos();
}
function debounceFilter() { clearTimeout(filterDebounce); filterDebounce = setTimeout(function() { st.filters.busca = document.getElementById('filter-busca').value; st.page = 1; fetchPedidos(); }, 400); }
async function loadEventoOptions() {
  try {
    var eventos = await api.get('/eventos');
    var select = document.getElementById('filter-evento');
    if (!select || !eventos) return;
    var items = Array.isArray(eventos) ? eventos : (eventos.items || eventos.data || []);
    for (var i = 0; i < items.length; i++) {
      var opt = document.createElement('option');
      opt.value = items[i].id || items[i].nome;
      opt.textContent = items[i].nome || items[i].tipo;
      select.appendChild(opt);
    }
  } catch (e) {}
}

var pedidoDetalheId = null, pedidoDetalheStream = null, pedidoDetalheData = null;

async function loadPedidoDetalhe(id) {
  pedidoDetalheId = id;
  setPageMeta('Detalhe do Pedido', '#' + id.slice(0, 8) + '...');
  document.getElementById('pedido-detail-loading').classList.remove('hidden');
  var c = document.getElementById('pedido-detail-content');
  if (c) c.classList.add('hidden');
  try {
    var data = await api.get('/pedidos/' + id);
    pedidoDetalheData = data;
    renderPedidoDetalhe(data);
    connectStream(id);
  } catch (err) { document.getElementById('pedido-detail-loading').innerHTML = '<div class="alert alert--error">' + esc(err.message) + '</div>'; }
}

function renderPedidoDetalhe(data) {
  document.getElementById('pedido-detail-loading').classList.add('hidden');
  document.getElementById('pedido-detail-content').classList.remove('hidden');
  var sb = document.getElementById('detail-status');
  sb.className = 'badge badge--' + statusBadgeClass(data.status);
  sb.textContent = statusLabelMap(data.status);
  document.getElementById('detail-id').textContent = 'ID: ' + data.id;
  renderClienteInfo(data);
  renderEventoInfo(data);
  renderFotos(data.fotos || []);
  renderCuration(data.fotos || []);
  renderVideo(data);
  setPageMeta('Detalhe do Pedido', esc(data.cliente_nome || data.nome || '') + ' · ' + esc(data.evento_nome || data.tipo_evento || ''));
}

function renderClienteInfo(data) {
  var fields = [
    { label: 'Nome', value: data.cliente_nome || data.nome },
    { label: 'Telefone', value: data.cliente_telefone || data.telefone },
    { label: 'E-mail', value: data.cliente_email || data.email },
    { label: 'WhatsApp', value: data.cliente_whatsapp || data.whatsapp }
  ];
  var el = document.getElementById('cliente-info');
  var html = '';
  for (var i = 0; i < fields.length; i++) {
    if (!fields[i].value) continue;
    html += '<div class="detail-field"><span class="detail-field__label">' + fields[i].label + '</span><span class="detail-field__value">' + esc(fields[i].value) + '</span></div>';
  }
  el.innerHTML = html || '<div class="empty-state" style="padding:var(--space-6)"><p>Sem informações do cliente.</p></div>';
}

function renderEventoInfo(data) {
  var fields = [
    { label: 'Tipo', value: data.evento_nome || data.tipo_evento },
    { label: 'Data do Evento', value: data.evento_data ? new Date(data.evento_data).toLocaleDateString('pt-BR') : null },
    { label: 'Local', value: data.evento_local || data.local },
    { label: 'Observações', value: data.observacoes || data.obs }
  ];
  var el = document.getElementById('evento-info');
  var html = '';
  for (var i = 0; i < fields.length; i++) {
    if (!fields[i].value) continue;
    html += '<div class="detail-field"><span class="detail-field__label">' + fields[i].label + '</span><span class="detail-field__value">' + esc(fields[i].value) + '</span></div>';
  }
  el.innerHTML = html || '<div class="empty-state" style="padding:var(--space-6)"><p>Sem informações do evento.</p></div>';
}

function renderFotos(fotos) {
  var gallery = document.getElementById('fotos-gallery');
  var empty = document.getElementById('fotos-empty');
  if (!fotos || !fotos.length) { gallery.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  var html = '';
  for (var i = 0; i < fotos.length; i++) {
    var f = fotos[i];
    var url = f.url || f.path || f.thumbnail_url || '';
    var isSelected = (f.status === 'selecionada' || f.status === 'selected');
    var isRejected = (f.status === 'rejeitada' || f.status === 'rejected');
    var cardClass = isSelected ? ' photo-card--selected' : (isRejected ? ' photo-card--rejected' : '');
    html += '<div class="photo-card' + cardClass + '">';
    html += '<img src="' + esc(url) + '" alt="Foto ' + (i + 1) + '" loading="lazy" onclick="openPhotoViewer(\'' + esc(url) + '\')">';
    if (isSelected || isRejected) {
      html += '<div class="photo-card__overlay"><span class="photo-card__status photo-card__status--' + (isSelected ? 'selected' : 'rejected') + '">' + (isSelected ? 'Selecionada' : 'Rejeitada') + '</span></div>';
    }
    html += '</div>';
  }
  gallery.innerHTML = html;
}

function renderCuration(fotos) {
  if (!fotos || !fotos.length) { document.getElementById('curation-gallery').innerHTML = '<div class="empty-state" style="padding:var(--space-6)"><p>Nenhuma foto para curar.</p></div>'; return; }
  window._curationFotos = fotos;
  filterCuration('all');
}

function filterCuration(filter) {
  var gallery = document.getElementById('curation-gallery');
  var fotos = window._curationFotos || [];
  var tabs = document.querySelectorAll('[data-curation]');
  for (var t = 0; t < tabs.length; t++) { tabs[t].classList.toggle('curation-tab--active', tabs[t].dataset.curation === filter); }
  var filtered;
  if (filter === 'all') { filtered = fotos; }
  else if (filter === 'selected') { filtered = fotos.filter(function(f) { return f.status === 'selecionada' || f.status === 'selected'; }); }
  else { filtered = fotos.filter(function(f) { return f.status === 'rejeitada' || f.status === 'rejected'; }); }
  if (!filtered.length) { gallery.innerHTML = '<div class="empty-state" style="padding:var(--space-6)"><p>Nenhuma foto nesta categoria.</p></div>'; return; }
  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var f = filtered[i];
    var url = f.url || f.path || f.thumbnail_url || '';
    var isSelected = (f.status === 'selecionada' || f.status === 'selected');
    var isRejected = (f.status === 'rejeitada' || f.status === 'rejected');
    var cardClass = isSelected ? ' photo-card--selected' : (isRejected ? ' photo-card--rejected' : '');
    html += '<div class="photo-card' + cardClass + '">';
    html += '<img src="' + esc(url) + '" alt="Curadoria ' + (i + 1) + '" loading="lazy" onclick="openPhotoViewer(\'' + esc(url) + '\')">';
    if (isSelected || isRejected) {
      html += '<div class="photo-card__overlay"><span class="photo-card__status photo-card__status--' + (isSelected ? 'selected' : 'rejected') + '">' + (isSelected ? 'Selecionada' : 'Rejeitada') + '</span></div>';
    }
    html += '</div>';
  }
  gallery.innerHTML = html;
}

function renderVideo(data) {
  var url = data.video_url || data.video_path || '';
  if (!url) { document.getElementById('video-player-wrapper').classList.add('hidden'); document.getElementById('video-empty').classList.remove('hidden'); return; }
  document.getElementById('video-empty').classList.add('hidden');
  document.getElementById('video-player-wrapper').classList.remove('hidden');
  document.getElementById('video-player').src = url;
}

function openPhotoViewer(url) {
  if (!url) return;
  var overlay = document.createElement('div');
  overlay.className = 'photo-viewer-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Visualizador de foto');
  var img = document.createElement('img');
  img.src = url;
  img.alt = 'Foto ampliada';
  overlay.appendChild(img);
  overlay.onclick = function() { overlay.remove(); };
  document.body.appendChild(overlay);
}

function connectStream(id) {
  if (pedidoDetalheStream) pedidoDetalheStream.disconnect();
  pedidoDetalheStream = connectPedidoStream(id, {
    onMessage: function(data) {
      var bar = document.getElementById('sse-status-bar');
      if (bar) { bar.classList.remove('hidden'); if (data.status) bar.innerHTML = '🔄 Status atualizado: <strong>' + statusLabelMap(data.status) + '</strong>'; }
      if (data.status && pedidoDetalheData && data.status !== pedidoDetalheData.status) {
        pedidoDetalheData.status = data.status;
        var badge = document.getElementById('detail-status');
        if (badge) { badge.className = 'badge badge--' + statusBadgeClass(data.status); badge.textContent = statusLabelMap(data.status); }
      }
    }, onError: function() {}
  });
}

async function reprocessarPedido() {
  if (!pedidoDetalheId) return;
  if (!confirm('Tem certeza que deseja reprocessar este pedido?')) return;
  var btn = document.getElementById('btn-reprocessar');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span> Reprocessando...';
  try { await api.post('/pedidos/' + pedidoDetalheId + '/reprocessar'); toast('Pedido reprocessado com sucesso!', 'success'); await loadPedidoDetalhe(pedidoDetalheId); }
  catch (e) { toast(e.message || 'Erro ao reprocessar.', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '🔄 Reprocessar'; }
}

async function cancelarPedido() {
  if (!pedidoDetalheId) return;
  if (!confirm('Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.')) return;
  var btn = document.getElementById('btn-cancelar');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span> Cancelando...';
  try { await api.post('/pedidos/' + pedidoDetalheId + '/cancelar'); toast('Pedido cancelado.', 'success'); await loadPedidoDetalhe(pedidoDetalheId); }
  catch (e) { toast(e.message || 'Erro ao cancelar.', 'error'); }
  finally { btn.disabled = false; btn.innerHTML = '🚫 Cancelar'; }
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
      case 'dashboard': pageEl.innerHTML = getDashboardHTML(); await loadDashboard(); break;
      case 'pedidos': pageEl.innerHTML = getPedidosHTML(); await loadPedidos(params); break;
      case 'pedido-detalhe': var id = params.id || hash.split('/').pop(); pageEl.innerHTML = getPedidoDetalheHTML(); if (id) { await loadPedidoDetalhe(id); } else { pageEl.innerHTML = '<div class="empty-state"><p>Pedido não encontrado.</p></div>'; } break;
      default: pageEl.innerHTML = '<div class="empty-state"><p>Página não encontrada.</p></div>';
    }
  } catch (err) { console.error(err); pageEl.innerHTML = '<div class="alert alert--error">' + escapeHtml(err.message) + '</div>'; }
  updateActiveNav(route.page);
}

function extractParams(hash) {
  var params = {}, qs = hash.indexOf('?');
  if (qs !== -1) { new URLSearchParams(hash.slice(qs)).forEach(function(v, k) { params[k] = v; }); }
  return params;
}

function escapeHtml(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function renderAppLayout(isAuthenticated) {
  if (!isAuthenticated) { $app.innerHTML = '<div class="login-page"><div class="login-card" id="page-content"></div></div>'; return; }
  $app.innerHTML = '<div class="app-layout"><div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div><aside class="sidebar" id="sidebar"><div class="sidebar__brand"><h1>Memórias</h1><span>em Vídeo</span></div><nav class="sidebar__nav"><a href="#/dashboard" class="sidebar__link" data-nav="dashboard"><span class="icon">📊</span> Dashboard</a><a href="#/pedidos" class="sidebar__link" data-nav="pedidos"><span class="icon">📋</span> Pedidos</a></nav><div class="sidebar__footer"><a href="#" onclick="auth.logout(); return false;" class="sidebar__link"><span class="icon">🚪</span> Sair</a></div></aside><main class="main-content"><header class="topbar"><button class="menu-toggle" onclick="toggleSidebar()" aria-label="Menu">☰</button><div class="topbar__title"><h2 id="page-title">Dashboard</h2><p id="page-subtitle">Visão geral</p></div><div class="topbar__actions"><div class="topbar__user"><span id="user-name">' + escapeHtml((auth.getUser() && auth.getUser().name) || '') + '</span></div></div></header><div class="page-content" id="page-content"></div></main></div>';
}

function updateActiveNav(pageName) { document.querySelectorAll('[data-nav]').forEach(function(el) { el.classList.toggle('sidebar__link--active', el.dataset.nav === pageName); }); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('sidebar--open'); document.getElementById('sidebar-overlay').classList.toggle('sidebar-overlay--visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay--visible'); }
function navigateTo(hash) { window.location.hash = hash; }
function setPageMeta(title, subtitle) { var t = document.getElementById('page-title'), s = document.getElementById('page-subtitle'); if (t) t.textContent = title; if (s) s.textContent = subtitle || ''; }

function toast(message, type) {
  type = type || 'info';
  var container = getToastContainer();
  var el = document.createElement('div');
  el.className = 'toast toast--' + type;
  el.innerHTML = '<span>' + escapeHtml(message) + '</span><button class="toast__close" onclick="this.parentElement.classList.add(\'toast--exit\');setTimeout(function(){this.parentElement.remove()},300)">×</button>';
  container.appendChild(el);
  setTimeout(function() { if (el.parentElement) { el.classList.add('toast--exit'); setTimeout(function() { el.remove(); }, 300); } }, 4000);
}

function getToastContainer() {
  var c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  return c;
}

document.addEventListener('DOMContentLoaded', init);
