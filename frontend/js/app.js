/* ============================================================
   App Router — Client-side SPA navigation (self-contained)
   ============================================================ */
const ROUTES = { '#/login': { page: 'login', auth: false }, '#/dashboard': { page: 'dashboard', auth: true }, '#/pedidos': { page: 'pedidos', auth: true }, '#/pedido': { page: 'pedido-detalhe', auth: true } };
const DEFAULT_ROUTE = '#/dashboard';
const LOGIN_ROUTE = '#/login';
let $app, chartInstance = null;

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
  for (const [p, r] of Object.entries(ROUTES)) {
    if ((p.includes(':')||p.endsWith('/*')) && hash.startsWith(p.replace('/:id','').replace('/*',''))) return r;
  }
  return null;
}

// ==================== LOGIN ====================
function getLoginHTML() {
  return '<div class="login-card__logo"><h1>🎬 Memórias em Vídeo</h1><p>Painel administrativo</p></div><div id="login-alert"></div><form id="login-form" autocomplete="on" novalidate><div class="form-group"><label for="email">E-mail</label><input type="email" id="email" class="form-input" placeholder="seu@email.com" required autocomplete="email" inputmode="email"><div class="form-error hidden" id="email-error">Informe um e-mail válido</div></div><div class="form-group"><label for="password">Senha</label><input type="password" id="password" class="form-input" placeholder="Sua senha" required autocomplete="current-password" minlength="4"><div class="form-error hidden" id="password-error">A senha é obrigatória</div></div><button type="submit" id="login-btn" class="btn btn-primary btn-block btn-lg">Entrar</button></form><p class="login-card__footer">Ambiente seguro · TLS 1.3</p>';
}

function initLoginForm() {
  const form = document.getElementById('login-form'), btn = document.getElementById('login-btn'), alertEl = document.getElementById('login-alert');
  if (!form || !btn || !alertEl) return;
  form.addEventListener('submit', async e => {
    e.preventDefault(); alertEl.innerHTML = '';
    const email = document.getElementById('email').value.trim(), password = document.getElementById('password').value;
    const ee = document.getElementById('email-error'), pe = document.getElementById('password-error');
    if (ee) ee.classList.add('hidden'); if (pe) pe.classList.add('hidden');
    if (!email||!email.includes('@')) { if (ee) ee.classList.remove('hidden'); return; }
    if (!password||password.length<4) { if (pe) pe.classList.remove('hidden'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner-btn"></span> Entrando…';
    try { await auth.login(email,password); window.location.hash='#/dashboard'; }
    catch(err) { if (alertEl) alertEl.innerHTML='<div class="alert alert--error">'+escapeHtml(err.message||'Erro ao fazer login')+'</div>'; btn.disabled=false; btn.innerHTML='Entrar'; }
  });
}

// ==================== DASHBOARD ====================
function getDashboardHTML() {
  return '<div class="metrics-grid" id="metrics-grid"><div class="metric-card"><div class="metric-card__icon metric-card__icon--blue">📦</div><div class="metric-card__label">Pedidos Hoje</div><div class="metric-card__value" id="metric-hoje"><div class="skeleton skeleton--text-lg" style="width:60px"></div></div></div><div class="metric-card"><div class="metric-card__icon metric-card__icon--green">📊</div><div class="metric-card__label">Este Mês</div><div class="metric-card__value" id="metric-mes"><div class="skeleton skeleton--text-lg" style="width:60px"></div></div></div><div class="metric-card"><div class="metric-card__icon metric-card__icon--yellow">✅</div><div class="metric-card__label">Taxa de Aprovação</div><div class="metric-card__value" id="metric-taxa"><div class="skeleton skeleton--text-lg" style="width:80px"></div></div></div><div class="metric-card"><div class="metric-card__icon metric-card__icon--red">⏱️</div><div class="metric-card__label">Tempo Médio</div><div class="metric-card__value" id="metric-tempo"><div class="skeleton skeleton--text-lg" style="width:80px"></div></div></div></div><div class="cols-2"><div class="card"><div class="card__header"><h3>📈 Pedidos por Tipo de Evento</h3></div><div class="card__body"><div class="chart-container"><canvas id="chart-eventos"></canvas></div></div></div><div class="card"><div class="card__header"><h3>📋 Últimos Pedidos</h3><a href="#/pedidos" class="btn btn-sm btn-secondary">Ver todos</a></div><div class="card__body" style="padding:0;"><div class="table-wrapper"><table><thead><tr><th>Cliente</th><th>Evento</th><th>Status</th><th>Data</th></tr></thead><tbody id="ultimos-pedidos-tbody"><tr class="skeleton-row"><td><div class="skeleton skeleton--text" style="width:60%"></div></td><td><div class="skeleton skeleton--text" style="width:50%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:40%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:30%"></div></td></tr></tbody></table></div></div></div></div>';
}

async function loadDashboard() {
  setPageMeta('Dashboard','Visão geral dos pedidos');
  try {
    const [m,p] = await Promise.all([api.get('/dashboard/metrics').catch(()=>null), api.get('/pedidos',{params:{limit:5}}).catch(()=>null)]);
    if (m) { document.getElementById('metric-hoje').innerHTML=m.hoje??'0'; document.getElementById('metric-mes').innerHTML=m.mes??'0'; document.getElementById('metric-taxa').innerHTML=m.taxa_aprovacao!=null?m.taxa_aprovacao+'%':'—'; document.getElementById('metric-tempo').innerHTML=m.tempo_medio??'—'; }
    renderUltimosPedidos(p? (Array.isArray(p)?p:(p.items||p.data||[])) : []);
    try { renderPieChart(await api.get('/dashboard/eventos')); } catch { renderPieChart(null); }
  } catch(e) { console.error(e); }
}

function renderUltimosPedidos(pedidos) {
  const tbody = document.getElementById('ultimos-pedidos-tbody');
  if (!tbody) return;
  if (!pedidos||!pedidos.length) { tbody.innerHTML='<tr><td colspan="4"><div class="empty-state" style="padding:var(--space-8)"><div class="empty-state__icon">📭</div><div class="empty-state__text">Nenhum pedido recente</div></div></td></tr>'; return; }
  tbody.innerHTML = pedidos.map(p=>'<tr onclick="window.location.href=\'#/pedido/'+p.id+'\'" style="cursor:pointer;"><td><strong>'+esc(p.cliente_nome||p.nome||'—')+'</strong></td><td>'+esc(p.evento_nome||p.tipo_evento||'—')+'</td><td><span class="badge badge--'+statusBadgeClass(p.status)+'">'+statusLabelMap(p.status)+'</span></td><td>'+(p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'—')+'</td></tr>').join('');
}

function renderPieChart(data) {
  const canvas = document.getElementById('chart-eventos');
  if (!canvas) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance=null; }
  const labels = data&&data.length? data.map(d=>d.nome||d.tipo||'Outros') : ['Aniversário','Casamento','Formatura','Outros'];
  const values = data&&data.length? data.map(d=>d.total||d.quantidade||d.count||1) : [10,7,5,3];
  const colors = ['oklch(45% 0.15 265)','oklch(50% 0.18 145)','oklch(60% 0.16 85)','oklch(50% 0 0)'];
  const ctx = canvas.getContext('2d');
  chartInstance = new Chart(ctx, { type:'pie', data:{labels,datasets:[{data:values,backgroundColor:colors.slice(0,labels.length),borderWidth:2,borderColor:'oklch(100% 0 0)'}]}, options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{position:'bottom',labels:{padding:16,usePointStyle:true,font:{family:'-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, sans-serif'}}}}}});
}

// ==================== PEDIDOS LIST ====================
let st = { page:1, total:0, totalPages:1, filters:{status:'',evento:'',data_inicio:'',data_fim:'',busca:''} };
let filterDebounce = null;

function getPedidosHTML() {
  return '<div class="card"><div class="card__header"><h3>📋 Pedidos</h3><span id="pedidos-count" style="font-size:var(--font-size-sm);color:var(--color-ink-secondary);"></span></div><div class="card__body">'+
    '<div class="filters-bar"><input type="text" class="form-input" id="filter-busca" placeholder="Buscar nome ou telefone…" oninput="debounceFilter()">'+
    '<select class="form-input" id="filter-status" onchange="applyFilters()"><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="aprovado">Aprovado</option><option value="processando">Processando</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option><option value="erro">Erro</option></select>'+
    '<select class="form-input" id="filter-evento" onchange="applyFilters()"><option value="">Todos os eventos</option></select>'+
    '<input type="date" class="form-input" id="filter-data-inicio" onchange="applyFilters()" title="Data início">'+
    '<input type="date" class="form-input" id="filter-data-fim" onchange="applyFilters()" title="Data fim"></div>'+
    '<div class="table-wrapper"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Evento</th><th>Status</th><th>Fotos</th><th>Data</th><th></th></tr></thead><tbody id="pedidos-tbody"><tr class="skeleton-row"><td><div class="skeleton skeleton--text" style="width:60%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:45%"></div></td><td><div class="skeleton skeleton--text" style="width:50%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:35%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:20%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:30%"></div></td><td><div class="skeleton skeleton--text-sm" style="width:25%"></div></td></tr></tbody></table></div>'+
    '<div class="pagination" id="pagination"><span id="pagination-info">Carregando…</span><div class="pagination__buttons" id="pagination-buttons"></div></div></div></div>';
}

async function loadPedidos(params) {
  setPageMeta('Pedidos','Gerenciar pedidos dos clientes');
  if (params.status) st.filters.status=params.status;
  if (params.page) st.page=parseInt(params.page,10);
  loadEventoOptions(); await fetchPedidos();
}

async function fetchPedidos() {
  const tbody = document.getElementById('pedidos-tbody');
  if (!tbody) return;
  try {
    const qp = { page:st.page, limit:15 };
    const f = st.filters;
    if (f.status) qp.status=f.status; if (f.evento) qp.evento=f.evento; if (f.busca) qp.busca=f.busca; if (f.data_inicio) qp.data_inicio=f.data_inicio; if (f.data_fim) qp.data_fim=f.data_fim;
    const data = await api.get('/pedidos',{params:qp});
    const items = data.items||data.data||data||[];
    st.total = data.total||items.length;
    st.totalPages = data.total_pages||data.pages||Math.ceil(st.total/15)||1;
    renderTable(items); renderPagination();
  } catch(err) { tbody.innerHTML='<tr><td colspan="7"><div class="alert alert--error">'+esc(err.message)+'</div></td></tr>'; }
}

function renderTable(pedidos) {
  const tbody = document.getElementById('pedidos-tbody');
  if (!pedidos||!pedidos.length) { tbody.innerHTML='<tr><td colspan="7"><div class="empty-state"><div class="empty-state__icon">📭</div><div class="empty-state__text">Nenhum pedido encontrado</div></div></td></tr>'; return; }
  tbody.innerHTML = pedidos.map(p=>'<tr><td><strong>'+esc(p.cliente_nome||p.nome||'—')+'</strong></td><td>'+esc(p.cliente_telefone||p.telefone||'—')+'</td><td>'+esc(p.evento_nome||p.tipo_evento||'—')+'</td><td><span class="badge badge--'+statusBadgeClass(p.status)+'">'+statusLabelMap(p.status)+'</span></td><td>'+(p.total_fotos??p.fotos_count??'—')+'</td><td>'+(p.created_at?new Date(p.created_at).toLocaleDateString('pt-BR'):'—')+'</td><td><a href="#/pedido/'+p.id+'" class="btn btn-sm btn-secondary">Detalhes</a></td></tr>').join('');
}

function renderPagination() {
  const info = document.getElementById('pagination-info'), btns = document.getElementById('pagination-buttons');
  if (!info||!btns) return;
  info.textContent = 'Página '+st.page+' de '+st.totalPages+' · '+st.total+' pedido'+(st.total!==1?'s':'');
  let html = '<button class="pagination__btn" onclick="goToPage('+(st.page-1)+')"'+(st.page<=1?' disabled':'')+'>← Anterior</button>';
  for (let i=Math.max(1,st.page-2);i<=Math.min(st.totalPages,st.page+2);i++) html+='<button class="pagination__btn'+(i===st.page?' pagination__btn--active':'')+'" onclick="goToPage('+i+')">'+i+'</button>';
  html+='<button class="pagination__btn" onclick="goToPage('+(st.page+1)+')"'+(st.page>=st.totalPages?' disabled':'')+'>Próxima →</button>';
  btns.innerHTML = html;
}

function goToPage(p) { if (p<1||p>st.totalPages) return; st.page=p; fetchPedidos(); window.location.hash='#/pedidos?page='+p; }

function applyFilters() {
  st.filters.status=document.getElementById('filter-status').value;
  st.filters.evento=document.getElementById('filter-evento').value;
  st.filters.data_inicio=document.getElementById('filter-data-inicio').value;
  st.filters.data_fim=document.getElementById('filter-data-fim').value;
  st.page=1; fetchPedidos();
}

function debounceFilter() { clearTimeout(filterDebounce); filterDebounce=setTimeout(()=>{st.filters.busca=document.getElementById('filter-busca').value; st.page=1; fetchPedidos();},400); }

async function loadEventoOptions() {
  try {
    const eventos = await api.get('/eventos');
    const select = document.getElementById('filter-evento');
    if (!select||!eventos) return;
    (Array.isArray(eventos)?eventos:(eventos.items||eventos.data||[])).forEach(ev=>{const o=document.createElement('option');o.value=ev.id||ev.nome;o.textContent=ev.nome||ev.tipo;select.appendChild(o);});
  } catch {}
}

// ==================== PEDIDO DETALHE ====================
let pedidoDetalheId = null, pedidoDetalheStream = null, pedidoDetalheData = null;

function getPedidoDetalheHTML() {
  return '<div id="pedido-detail-loading" class="loading-overlay"><div class="spinner"></div><span>Carregando pedido…</span></div><div id="pedido-detail-content" class="hidden">'+
    '<nav style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-6);flex-wrap:wrap;"><a href="#/pedidos" class="btn btn-sm btn-secondary">← Voltar</a><span id="detail-status" class="badge badge--info">Carregando…</span><span id="detail-id" style="font-size:var(--font-size-xs);color:var(--color-ink-muted);font-family:var(--font-mono);"></span></nav>'+
    '<div id="sse-status-bar" class="hidden alert alert--info" style="margin-bottom:var(--space-4);font-size:var(--font-size-xs);">🔄 Status atualizado em tempo real</div>'+
    '<div class="detail-grid"><div><div class="detail-section"><div class="detail-section__title">📸 Fotos Enviadas</div><div id="fotos-section"><div id="fotos-gallery" class="photo-gallery"></div><div id="fotos-empty" class="hidden"><div class="empty-state"><div class="empty-state__icon">🖼️</div><div class="empty-state__text">Nenhuma foto enviada</div></div></div></div></div>'+
    '<div class="detail-section"><div class="detail-section__title">🎯 Curadoria</div><div class="curation-tabs"><button class="curation-tab curation-tab--active" data-curation="all" onclick="filterCuration(\'all\')">Todas</button><button class="curation-tab" data-curation="selected" onclick="filterCuration(\'selected\')">Selecionadas</button><button class="curation-tab" data-curation="rejected" onclick="filterCuration(\'rejected\')">Rejeitadas</button></div><div id="curation-gallery" class="photo-gallery"></div></div></div>'+
    '<div><div class="detail-section"><div class="detail-section__title">👤 Cliente</div><div id="cliente-info"></div></div>'+
    '<div class="detail-section"><div class="detail-section__title">🎉 Evento</div><div id="evento-info"></div></div>'+
    '<div class="detail-section"><div class="detail-section__title">🎬 Vídeo</div><div id="video-section"><div id="video-empty" class="empty-state"><div class="empty-state__icon">🎥</div><div class="empty-state__text">Vídeo ainda não gerado</div><p>Após a curadoria e processamento, o vídeo aparecerá aqui.</p></div><div id="video-player-wrapper" class="hidden"><div class="video-player"><video id="video-player" controls preload="metadata"></video></div></div></div></div>'+
    '<div class="action-bar"><button class="btn btn-primary" onclick="reprocessarPedido()" id="btn-reprocessar">🔄 Reprocessar</button><button class="btn btn-danger" onclick="cancelarPedido()" id="btn-cancelar">🚫 Cancelar</button></div></div></div></div>';
}

async function loadPedidoDetalhe(id) {
  pedidoDetalheId = id;
  setPageMeta('Detalhe do Pedido','#'+id.slice(0,8)+'…');
  document.getElementById('pedido-detail-loading').classList.remove('hidden');
  const c = document.getElementById('pedido-detail-content');
  if (c) c.classList.add('hidden');
  try {
    const data = await api.get('/pedidos/'+id);
    pedidoDetalheData = data;
    renderPedidoDetalhe(data); connectStream(id);
  } catch(err) { document.getElementById('pedido-detail-loading').innerHTML='<div class="alert alert--error">'+esc(err.message)+'</div>'; }
}

function renderPedidoDetalhe(data) {
  document.getElementById('pedido-detail-loading').classList.add('hidden');
  document.getElementById('pedido-detail-content').classList.remove('hidden');
  const sb = document.getElementById('detail-status');
  sb.className='badge badge--'+statusBadgeClass(data.status); sb.textContent=statusLabelMap(data.status);
  document.getElementById('detail-id').textContent='ID: '+data.id;
  renderClienteInfo(data); renderEventoInfo(data); renderFotos(data.fotos||[]); renderCuration(data.fotos||[]); renderVideo(data);
  setPageMeta('Detalhe do Pedido',esc(data.cliente_nome||data.nome||'')+' · '+esc(data.evento_nome||data.tipo_evento||''));
}

function renderClienteInfo(data) {
  const fields=[{l:'Nome',v:data.cliente_nome||data.nome},{l:'Telefone',v:data.cliente_telefone||data.telefone},{l:'E-mail',v:data.cliente_email||data.email},{l:'WhatsApp',v:data.cliente_whatsapp||data.whatsapp}].filter(f=>f.v);
  document.getElementById('cliente-info').innerHTML=fields.length?fields.map(f=>'<div class="detail-field"><span class="detail-field__label">'+f.l+'</span><span class="detail-field__value">'+esc(f.v)+'</span></div>').join(''):'<div class="empty-state" style="padding:var(--space-6)"><p>Sem informações do cliente.</p></div>';
}

function renderEventoInfo(data) {
  const fields=[{l:'Tipo',v:data.evento_nome||data.tipo_evento},{l:'Data do Evento',v:data.evento_data?new Date(data.evento_data).toLocaleDateString('pt-BR'):null},{l:'Local',v:data.evento_local||data.local},{l:'Observações',v:data.observacoes||data.obs}].filter(f=>f.v);
  document.getElementById('evento-info').innerHTML=fields.length?fields.map(f=>'<div class="detail-field"><span class="detail-field__label">'+f.l+'</span><span class="detail-field__value">'+esc(f.v)+'</span></div>').join(''):'<div class="empty-state" style="padding:var(--space-6)"><p>Sem informações do evento.</p></div>';
}

function renderFotos(fotos) {
  const g=document.getElementById('fotos-gallery'),e=document.getElementById('fotos-empty');
  if (!fotos||!fotos.length) { g.innerHTML=''; e.classList.remove('hidden'); return; }
  e.classList.add('hidden');
  g.innerHTML=fotos.map((f,i)=>'<div class="photo-card'+(f.status==='selecionada'||f.status==='selected'?' photo-card--selected':f.status==='rejeitada'||f.status==='rejected'?' photo-card--rejected':'')+'+
    '"><img src="'+esc(f.url||f.path||f.thumbnail_url||'')+'" alt="Foto '+(i+1)+'" loading="lazy" onclick="openPhotoViewer(\''+esc(f.url||f.path||f.thumbnail_url||'')+'\')">'+
    ((f.status==='selecionada'||f.status==='selected'||f.status==='rejeitada'||f.status==='rejected')?'<div class="photo-card__overlay"><span class="photo-card__status photo-card__status--'+(f.status==='selecionada'||f.status==='selected'?'selected':'rejected')+'">'+(f.status==='selecionada'||f.status==='selected'?'Selecionada':'Rejeitada')+'</span></div>':'')+'</div>').join('');
}

function renderCuration(fotos) {
  if (!fotos||!fotos.length) { document.getElementById('curation-gallery').innerHTML='<div class="empty-state" style="padding:var(--space-6)"><p>Nenhuma foto para curar.</p></div>'; return; }
  window._curationFotos=fotos; filterCuration('all');
}

function filterCuration(filter) {
  const g=document.getElementById('curation-gallery'),fotos=window._curationFotos||[];
  document.querySelectorAll('[data-curation]').forEach(t=>t.classList.toggle('curation-tab--active',t.dataset.curation===filter));
  const filtered=filter==='all'?fotos:filter==='selected'?fotos.filter(f=>f.status==='selecionada'||f.status==='selected'):fotos.filter(f=>f.status==='rejeitada'||f.status==='rejected');
  if (!filtered.length) { g.innerHTML='<div class="empty-state" style="padding:var(--space-6)"><p>Nenhuma foto nesta categoria.</p></div>'; return; }
  g.innerHTML=filtered.map((f,i)=>'<div class="photo-card'+(f.status==='selecionada'||f.status==='selected'?' photo-card--selected':f.status==='rejeitada'||f.status==='rejected'?' photo-card--rejected':'')+'+
    '"><img src="'+esc(f.url||f.path||f.thumbnail_url||'')+'" alt="Curadoria '+(i+1)+'" loading="lazy" onclick="openPhotoViewer(\''+esc(f.url||f.path||f.thumbnail_url||'')+'\')">'+
    ((f.status==='selecionada'||f.status==='selected'||f.status==='rejeitada'||f.status==='rejected')?'<div class="photo-card__overlay"><span class="photo-card__status photo-card__status--'+(f.status==='selecionada'||f.status==='selected'?'selected':'rejected')+'">'+(f.status==='selecionada'||f.status==='selected'?'Selecionada':'Rejeitada')+'</span></div>':'')+'</div>').join('');
}

function renderVideo(data) {
  const url=data.video_url||data.video_path||'';
  if (!url) { document.getElementById('video-player-wrapper').classList.add('hidden'); document.getElementById('video-empty').classList.remove('hidden'); return; }
  document.getElementById('video-empty').classList.add('hidden'); document.getElementById('video-player-wrapper').classList.remove('hidden'); document.getElementById('video-player').src=url;
}

function openPhotoViewer(url) {
  if (!url) return;
  const overlay=document.createElement('div'); overlay.className='photo-viewer-backdrop'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-label','Visualizador de foto');
  const img=document.createElement('img'); img.src=url; img.alt='Foto ampliada'; overlay.appendChild(img); overlay.onclick=()=>overlay.remove(); document.body.appendChild(overlay);
}

function connectStream(id) {
  if (pedidoDetalheStream) pedidoDetalheStream.disconnect();
  pedidoDetalheStream=connectPedidoStream(id,{
    onMessage:(data)=>{
      const bar=document.getElementById('sse-status-bar');
      if (bar) { bar.classList.remove('hidden'); if (data.status) bar.innerHTML='🔄 Status atualizado: <strong>'+statusLabelMap(data.status)+'</strong>'; }
      if (data.status&&pedidoDetalheData&&data.status!==pedidoDetalheData.status) {
        pedidoDetalheData.status=data.status;
        const badge=document.getElementById('detail-status');
        if (badge) { badge.className='badge badge--'+statusBadgeClass(data.status); badge.textContent=statusLabelMap(data.status); }
      }
    }, onError:()=>{}
  });
}

async function reprocessarPedido() {
  if (!pedidoDetalheId) return;
  if (!confirm('Tem certeza que deseja reprocessar este pedido?')) return;
  const btn=document.getElementById('btn-reprocessar'); btn.disabled=true; btn.innerHTML='<span class="spinner-btn"></span> Reprocessando…';
  try { await api.post('/pedidos/'+pedidoDetalheId+'/reprocessar'); toast('Pedido reprocessado com sucesso!','success'); await loadPedidoDetalhe(pedidoDetalheId); }
  catch(e) { toast(e.message||'Erro ao reprocessar.','error'); }
  finally { btn.disabled=false; btn.innerHTML='🔄 Reprocessar'; }
}

async function cancelarPedido() {
  if (!pedidoDetalheId) return;
  if (!confirm('Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.')) return;
  const btn=document.getElementById('btn-cancelar'); btn.disabled=true; btn.innerHTML='<span class="spinner-btn"></span> Cancelando…';
  try { await api.post('/pedidos/'+pedidoDetalheId+'/cancelar'); toast('Pedido cancelado.','success'); await loadPedidoDetalhe(pedidoDetalheId); }
  catch(e) { toast(e.message||'Erro ao cancelar.','error'); }
  finally { btn.disabled=false; btn.innerHTML='🚫 Cancelar'; }
}

// ==================== SHARED HELPERS ====================
function statusBadgeClass(s) { return ({'pendente':'warning','aprovado':'success','processando':'info','concluido':'success','concluído':'success','cancelado':'danger','rejeitado':'danger','erro':'danger'})[s?.toLowerCase()]||'neutral'; }
function statusLabelMap(s) { return ({'pendente':'Pendente','aprovado':'Aprovado','processando':'Processando','concluido':'Concluído','concluído':'Concluído','cancelado':'Cancelado','rejeitado':'Rejeitado','erro':'Erro'})[s?.toLowerCase()]||s||'—'; }
function esc(str) { if (!str) return '—'; const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

// ==================== RENDERER ====================
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
  } catch(err) { console.error(err); pageEl.innerHTML = '<div class="alert alert--error">'+escapeHtml(err.message)+'</div>'; }
  updateActiveNav(route.page);
}

function extractParams(hash) {
  const params = {};
  const qs = hash.indexOf('?');
  if (qs !== -1) new URLSearchParams(hash.slice(qs)).forEach((v,k)=>params[k]=v);
  return params;
}

function escapeHtml(str) { if (!str) return ''; const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

function renderAppLayout(isAuthenticated) {
  if (!isAuthenticated) { $app.innerHTML='<div class="login-page"><div class="login-card" id="page-content"></div></div>'; return; }
  $app.innerHTML='<div class="app-layout"><div class="sidebar-overlay" id="sidebar-overlay" onclick="closeSidebar()"></div><aside class="sidebar" id="sidebar"><div class="sidebar__brand"><h1>Memórias</h1><span>em Vídeo</span></div><nav class="sidebar__nav"><a href="#/dashboard" class="sidebar__link" data-nav="dashboard"><span class="icon">📊</span> Dashboard</a><a href="#/pedidos" class="sidebar__link" data-nav="pedidos"><span class="icon">📋</span> Pedidos</a></nav><div class="sidebar__footer"><a href="#" onclick="auth.logout(); return false;" class="sidebar__link"><span class="icon">🚪</span> Sair</a></div></aside><main class="main-content"><header class="topbar"><button class="menu-toggle" onclick="toggleSidebar()" aria-label="Menu">☰</button><div class="topbar__title"><h2 id="page-title">Dashboard</h2><p id="page-subtitle">Visão geral</p></div><div class="topbar__actions"><div class="topbar__user"><span id="user-name">'+(escapeHtml((auth.getUser()&&auth.getUser().name)||''))+'</span></div></div></header><div class="page-content" id="page-content"></div></main></div>';
}

function updateActiveNav(pageName) { document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('sidebar__link--active',el.dataset.nav===pageName)); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('sidebar--open'); document.getElementById('sidebar-overlay').classList.toggle('sidebar-overlay--visible'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('sidebar-overlay').classList.remove('sidebar-overlay--visible'); }
function navigateTo(hash) { window.location.hash = hash; }
function setPageMeta(title, subtitle) { const t=document.getElementById('page-title'),s=document.getElementById('page-subtitle'); if (t) t.textContent=title; if (s) s.textContent=subtitle||''; }
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
  let c = document.getElementById('toast-container');
  if (!c) { c=document.createElement('div'); c.id='toast-container'; c.className='toast-container'; document.body.appendChild(c); }
  return c;
}
document.addEventListener('DOMContentLoaded', init);
