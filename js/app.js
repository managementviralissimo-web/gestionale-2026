// ============================================================
// GESTIONALE FINANZIARIO 2026 - App Logic
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

let currentUser = null;
let _entrate = [], _uscite = [], _dipendenti = [], _stipendi = [];

// ---- UTILS ----
function fmt(n) {
  return '€ ' + Math.round(n || 0).toLocaleString('it-IT');
}

function fmtShort(n) {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
  return v.toString();
}

function toast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function badgeStato(stato) {
  const map = {
    'PAGATO': 'badge-green',
    'NON PAGATO': 'badge-red',
    'FATTURA IN CORSO': 'badge-amber',
    'BANDO': 'badge-blue'
  };
  return `<span class="badge ${map[stato] || 'badge-gray'}">${stato}</span>`;
}

function badgeCat(cat) {
  const map = {
    'Stipendi': 'badge-amber', 'Affitto': 'badge-blue',
    'Tasse': 'badge-red', 'Ufficio': 'badge-gray', 'Extra': 'badge-gray'
  };
  return `<span class="badge ${map[cat] || 'badge-gray'}">${cat}</span>`;
}

// ---- AUTH ----
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) { currentUser = session.user; showApp(); }
    else { currentUser = null; showAuth(); }
  });
}

function showAuth() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}

async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-email').textContent = currentUser.email;
  await loadAll();
  showTab('dashboard');
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.textContent = '';
  if (!email || !pass) { msg.textContent = 'Inserisci email e password.'; return; }
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) msg.textContent = error.message;
}

async function signup() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.textContent = '';
  if (!email || !pass) { msg.textContent = 'Inserisci email e password.'; return; }
  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) msg.textContent = error.message;
  else msg.textContent = '✓ Controlla la tua email per confermare.';
}

async function logout() {
  await sb.auth.signOut();
}

// ---- DATA LOADING ----
async function loadAll() {
  const [e, u, d, s] = await Promise.all([
    sb.from('entrate').select('*').order('created_at', { ascending: false }),
    sb.from('uscite').select('*').order('created_at', { ascending: false }),
    sb.from('dipendenti').select('*').order('nome'),
    sb.from('stipendi').select('*, dipendenti(nome)').eq('anno', 2026)
  ]);
  _entrate = e.data || [];
  _uscite = u.data || [];
  _dipendenti = d.data || [];
  _stipendi = s.data || [];
}

// ---- NAVIGATION ----
function showTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + tab).classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  const renders = { dashboard: renderDashboard, entrate: renderEntrate, uscite: renderUscite, stipendi: renderStipendi };
  if (renders[tab]) renders[tab]();
}

// ---- DASHBOARD ----
function renderDashboard() {
  const totE = _entrate.filter(e => e.stato === 'PAGATO').reduce((a, b) => a + Number(b.importo), 0);
  const totU = _uscite.reduce((a, b) => a + Number(b.importo), 0);
  const totS = _stipendi.reduce((a, b) => a + Number(b.importo), 0);
  const saldo = totE - totU - totS;

  document.getElementById('kpi-entrate').textContent = fmt(totE);
  document.getElementById('kpi-uscite').textContent = fmt(totU + totS);
  document.getElementById('kpi-stipendi').textContent = fmt(totS);
  const ks = document.getElementById('kpi-saldo');
  ks.textContent = fmt(saldo);
  ks.className = 'kpi-value ' + (saldo >= 0 ? 'pos' : 'neg');

  // Mesi
  document.getElementById('dash-months').innerHTML = MESI.map((m, i) => {
    const e = _entrate.filter(x => x.mese === m && x.stato === 'PAGATO').reduce((a, b) => a + Number(b.importo), 0);
    const u = _uscite.filter(x => x.mese === m).reduce((a, b) => a + Number(b.importo), 0);
    const s = _stipendi.filter(x => x.mese === m).reduce((a, b) => a + Number(b.importo), 0);
    const sal = e - u - s;
    const cls = sal > 0 ? 'pos' : sal < 0 ? 'neg' : 'zero';
    return `<div class="month-cell ${cls}">
      <div class="mlabel">${MESI_S[i]}</div>
      <div class="mval">${sal === 0 ? '—' : fmtShort(sal)}</div>
    </div>`;
  }).join('');

  // Stati entrate
  const stati = { PAGATO: 0, 'NON PAGATO': 0, 'FATTURA IN CORSO': 0, BANDO: 0 };
  _entrate.forEach(e => { stati[e.stato] = (stati[e.stato] || 0) + Number(e.importo); });
  document.getElementById('dash-stati').innerHTML = Object.entries(stati)
    .map(([k, v]) => `<div class="stat-row"><span class="stat-label">${badgeStato(k)}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');

  // Categorie uscite
  const cats = { Stipendi: totS, Affitto: 0, Tasse: 0, Ufficio: 0, Extra: 0 };
  _uscite.forEach(u => { if (cats[u.categoria] !== undefined) cats[u.categoria] += Number(u.importo); });
  document.getElementById('dash-cat').innerHTML = Object.entries(cats)
    .map(([k, v]) => `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');
}

// ---- ENTRATE ----
function renderEntrate() {
  const mes = document.getElementById('fil-mese-e').value;
  const sta = document.getElementById('fil-stato-e').value;
  const cer = document.getElementById('fil-cerca-e').value.toLowerCase();
  const fil = _entrate.filter(e =>
    (!mes || e.mese === mes) &&
    (!sta || e.stato === sta) &&
    (!cer || e.cliente.toLowerCase().includes(cer))
  );
  const tot = fil.reduce((a, b) => a + Number(b.importo), 0);
  document.getElementById('tb-entrate').innerHTML = fil.length
    ? fil.map(e => `<tr>
        <td style="font-weight:500">${e.cliente}</td>
        <td>${e.mese}</td>
        <td class="td-mono td-right">${fmt(e.importo)}</td>
        <td>${badgeStato(e.stato)}</td>
        <td style="color:var(--text-muted)">${e.note || '—'}</td>
        <td><button class="btn btn-sm btn-icon" onclick="eliminaEntrata('${e.id}')">✕</button></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">Nessuna entrata trovata</td></tr>`;
  document.getElementById('tot-entrate').textContent = `${fil.length} voci · Totale: ${fmt(tot)}`;
}

async function salvaEntrata() {
  const cliente = document.getElementById('e-cliente').value.trim();
  const importo = Number(document.getElementById('e-importo').value);
  const mese = document.getElementById('e-mese').value;
  const stato = document.getElementById('e-stato').value;
  const note = document.getElementById('e-note').value;
  if (!cliente || !importo) { toast('Inserisci cliente e importo'); return; }
  const { error } = await sb.from('entrate').insert({ user_id: currentUser.id, cliente, importo, mese, stato, note });
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Entrata salvata ✓');
  closeModal('modal-entrata');
  await loadAll();
  renderEntrate();
  ['e-cliente', 'e-importo', 'e-note'].forEach(id => document.getElementById(id).value = '');
}

async function eliminaEntrata(id) {
  if (!confirm('Eliminare questa entrata?')) return;
  await sb.from('entrate').delete().eq('id', id);
  await loadAll();
  renderEntrate();
}

// ---- USCITE ----
function renderUscite() {
  const mes = document.getElementById('fil-mese-u').value;
  const cat = document.getElementById('fil-cat-u').value;
  const cer = document.getElementById('fil-cerca-u').value.toLowerCase();
  const fil = _uscite.filter(u =>
    (!mes || u.mese === mes) &&
    (!cat || u.categoria === cat) &&
    (!cer || (u.descrizione || '').toLowerCase().includes(cer) || (u.fornitore || '').toLowerCase().includes(cer))
  );
  const tot = fil.reduce((a, b) => a + Number(b.importo), 0);
  document.getElementById('tb-uscite').innerHTML = fil.length
    ? fil.map(u => `<tr>
        <td style="color:var(--text-muted)">${u.data || '—'}</td>
        <td>${badgeCat(u.categoria)}</td>
        <td>${u.descrizione || '—'}</td>
        <td class="td-mono td-right" style="color:var(--red)">${fmt(u.importo)}</td>
        <td style="color:var(--text-muted)">${u.fornitore || '—'}</td>
        <td style="color:var(--text-muted)">${u.metodo || '—'}</td>
        <td><button class="btn btn-sm btn-icon" onclick="eliminaUscita('${u.id}')">✕</button></td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty">Nessuna uscita trovata</td></tr>`;
  document.getElementById('tot-uscite').textContent = `${fil.length} voci · Totale: ${fmt(tot)}`;
}

async function salvaUscita() {
  const importo = Number(document.getElementById('u-importo').value);
  if (!importo) { toast('Inserisci importo'); return; }
  const row = {
    user_id: currentUser.id,
    data: document.getElementById('u-data').value || null,
    categoria: document.getElementById('u-cat').value,
    mese: document.getElementById('u-mese').value,
    descrizione: document.getElementById('u-desc').value,
    importo,
    fornitore: document.getElementById('u-fornitore').value,
    metodo: document.getElementById('u-metodo').value,
    note: document.getElementById('u-note').value
  };
  const { error } = await sb.from('uscite').insert(row);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Uscita salvata ✓');
  closeModal('modal-uscita');
  await loadAll();
  renderUscite();
}

async function eliminaUscita(id) {
  if (!confirm('Eliminare questa uscita?')) return;
  await sb.from('uscite').delete().eq('id', id);
  await loadAll();
  renderUscite();
}

// ---- STIPENDI ----
function renderStipendi() {
  const tipo = document.getElementById('fil-tipo-s').value;
  const thead = `<thead><tr>
    <th>Dipendente</th>
    ${MESI_S.map(m => `<th class="td-right">${m}</th>`).join('')}
    <th class="td-right">Totale</th>
  </tr></thead>`;

  const rows = _dipendenti.map(d => {
    const cells = MESI.map(m => {
      const rec = _stipendi.find(s => s.dipendenti && s.dipendenti.nome === d.nome && s.tipo === tipo && s.mese === m);
      const val = rec ? Number(rec.importo) : 0;
      return `<td class="td-right">
        <input class="stipendi-input" type="number" value="${val || ''}" placeholder="—"
          onchange="aggiornaStipendio('${d.id}','${d.nome}','${tipo}','${m}',this.value)">
      </td>`;
    }).join('');
    const tot = _stipendi
      .filter(s => s.dipendenti && s.dipendenti.nome === d.nome && s.tipo === tipo)
      .reduce((a, b) => a + Number(b.importo), 0);
    return `<tr>
      <td style="font-weight:500;white-space:nowrap">${d.nome}</td>
      ${cells}
      <td class="td-mono td-right" style="font-weight:500">${tot ? fmt(tot) : '—'}</td>
    </tr>`;
  }).join('');

  const totRow = `<tr style="border-top:2px solid var(--border-strong);background:var(--bg)">
    <td style="font-weight:600;font-size:12px">Totale mese</td>
    ${MESI.map(m => {
      const t = _stipendi.filter(s => s.tipo === tipo && s.mese === m).reduce((a, b) => a + Number(b.importo), 0);
      return `<td class="td-mono td-right" style="font-weight:500;font-size:12px">${t ? fmtShort(t) : '—'}</td>`;
    }).join('')}
    <td class="td-mono td-right" style="font-weight:600;font-size:12px">
      ${fmt(_stipendi.filter(s => s.tipo === tipo).reduce((a, b) => a + Number(b.importo), 0))}
    </td>
  </tr>`;

  document.getElementById('tb-stipendi').innerHTML = thead + `<tbody>${rows}${totRow}</tbody>`;
}

async function aggiornaStipendio(dipId, dipNome, tipo, mese, val) {
  const importo = Number(val) || 0;
  const rec = _stipendi.find(s => s.dipendenti && s.dipendenti.nome === dipNome && s.tipo === tipo && s.mese === mese);
  if (rec) {
    await sb.from('stipendi').update({ importo }).eq('id', rec.id);
  } else {
    await sb.from('stipendi').insert({ dipendente_id: dipId, tipo, mese, anno: 2026, importo });
  }
  await loadAll();
}

async function salvaDipendente() {
  const nome = document.getElementById('d-nome').value.trim();
  if (!nome) return;
  const { error } = await sb.from('dipendenti').insert({ nome });
  if (error) { toast('Errore o nome già esistente'); return; }
  toast('Dipendente aggiunto ✓');
  closeModal('modal-dipendente');
  document.getElementById('d-nome').value = '';
  await loadAll();
  renderStipendi();
}

// ---- EXPORT CSV ----
function esportaCSV() {
  let csv = 'ENTRATE\nCliente,Mese,Importo,Stato,Note\n';
  _entrate.forEach(e => csv += `"${e.cliente}","${e.mese}",${e.importo},"${e.stato}","${e.note || ''}"\n`);
  csv += '\nUSCITE\nData,Categoria,Mese,Descrizione,Importo,Fornitore,Metodo\n';
  _uscite.forEach(u => csv += `"${u.data || ''}","${u.categoria}","${u.mese || ''}","${u.descrizione || ''}",${u.importo},"${u.fornitore || ''}","${u.metodo || ''}"\n`);
  csv += '\nSTIPENDI\nDipendente,' + MESI.join(',') + ',Totale\n';
  _dipendenti.forEach(d => {
    const row = MESI.map(m => {
      const rec = _stipendi.find(s => s.dipendenti && s.dipendenti.nome === d.nome && s.tipo === 'stipendio' && s.mese === m);
      return rec ? rec.importo : 0;
    });
    const tot = row.reduce((a, b) => a + Number(b), 0);
    csv += `"${d.nome}",${row.join(',')},${tot}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gestionale_2026.csv';
  a.click();
  toast('Export avviato ✓');
}

// ---- MODALS ----
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal clicking overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// Populate mese selects
function populateMesi() {
  ['e-mese', 'u-mese', 'fil-mese-e', 'fil-mese-u'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const hasAll = id.startsWith('fil');
    el.innerHTML = (hasAll ? '<option value="">Tutti i mesi</option>' : '') +
      MESI.map(m => `<option>${m}</option>`).join('');
  });
}

// ---- BOOT ----
populateMesi();
init();
