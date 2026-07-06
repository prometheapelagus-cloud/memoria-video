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
