// GESTIONALE FINANZIARIO 2026 - App Logic v3
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

// Categorie uscite — modificabili
let CATEGORIE_USCITE = JSON.parse(localStorage.getItem('cat_uscite')||'["Stipendi","Affitto","Tasse","Servizi Digitali","Ufficio","Extra"]');

function saveCategorie() { localStorage.setItem('cat_uscite', JSON.stringify(CATEGORIE_USCITE)); }

let currentUser = null;
let _entrate = [], _uscite = [], _dipendenti = [], _stipendi = [];
let _clienti = [], _scadenze = [];
let _chartBar = null, _chartTorta = null;
let _editingEntrata = null, _editingUscita = null;

// ---- UTILS ----
function fmt(n) { return '€ ' + Math.round(n||0).toLocaleString('it-IT'); }
function fmtShort(n) { const v=Math.round(n||0); return Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':v.toString(); }
function todayISO() { return new Date().toISOString().split('T')[0]; }

function toast(msg, duration=2500) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),duration);
}

function badgeStato(s) {
  const m={'PAGATO':'badge-green','NON PAGATO':'badge-red','FATTURA IN CORSO':'badge-amber','BANDO':'badge-blue'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;
}
function badgeCat(c) {
  const colors=['badge-amber','badge-blue','badge-red','badge-green','badge-gray'];
  const idx=CATEGORIE_USCITE.indexOf(c)%colors.length;
  return `<span class="badge ${colors[Math.max(0,idx)]}">${c}</span>`;
}
function badgeScad(s) {
  const m={'In attesa':'badge-amber','Pagato':'badge-green','Scaduto':'badge-red'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;
}
function daysDiff(dateStr) {
  const d=new Date(dateStr), n=new Date();
  n.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.round((d-n)/(1000*60*60*24));
}

// ---- AUTH ----
async function init() {
  const { data:{session} } = await sb.auth.getSession();
  if (session) { currentUser=session.user; showApp(); }
  else showAuth();
  sb.auth.onAuthStateChange((_,session) => {
    if (session) { currentUser=session.user; showApp(); }
    else { currentUser=null; showAuth(); }
  });
}

function showAuth() {
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app-screen').style.display='none';
}

async function showApp() {
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';
  document.getElementById('user-email').textContent=currentUser.email;
  await loadAll();
  showTab('dashboard');
}

async function login() {
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const msg=document.getElementById('auth-msg');
  msg.textContent='';
  if (!email||!pass){msg.textContent='Inserisci email e password.';return;}
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if (error) msg.textContent=error.message;
}

async function signup() {
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const msg=document.getElementById('auth-msg');
  msg.textContent='';
  if (!email||!pass){msg.textContent='Inserisci email e password.';return;}
  const {error}=await sb.auth.signUp({email,password:pass});
  if (error) msg.textContent=error.message;
  else msg.textContent='✓ Controlla la tua email per confermare.';
}

async function logout() { await sb.auth.signOut(); }

// ---- DATA ----
async function loadAll() {
  const [e,u,d,s,c,sc] = await Promise.all([
    sb.from('entrate').select('*').order('created_at',{ascending:false}),
    sb.from('uscite').select('*').order('created_at',{ascending:false}),
    sb.from('dipendenti').select('*').order('nome'),
    sb.from('stipendi').select('*, dipendenti(nome)').eq('anno',2026),
    sb.from('clienti').select('*').order('ragione_sociale'),
    sb.from('scadenze').select('*, clienti(ragione_sociale)').order('data_scadenza')
  ]);
  _entrate=e.data||[]; _uscite=u.data||[];
  _dipendenti=d.data||[]; _stipendi=s.data||[];
  _clienti=c.data||[]; _scadenze=sc.data||[];
}

// ---- NAV ----
function showTab(tab) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+tab).classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  const r={dashboard:renderDashboard,entrate:renderEntrate,uscite:renderUscite,
            stipendi:renderStipendi,clienti:renderClienti,scadenze:renderScadenze};
  if (r[tab]) r[tab]();
}

// ---- DASHBOARD ----
function renderDashboard() {
  const totE=_entrate.filter(e=>e.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0);
  const totU=_uscite.reduce((a,b)=>a+Number(b.importo),0);
  const totS=_stipendi.reduce((a,b)=>a+Number(b.importo),0);
  const saldo=totE-totU-totS;

  document.getElementById('kpi-entrate').textContent=fmt(totE);
  document.getElementById('kpi-uscite').textContent=fmt(totU+totS);
  document.getElementById('kpi-stipendi').textContent=fmt(totS);
  const ks=document.getElementById('kpi-saldo');
  ks.textContent=fmt(saldo);
  ks.className='kpi-value '+(saldo>=0?'pos':'neg');

  const imminenti=_scadenze.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<=7&&daysDiff(s.data_scadenza)>=0);
  const alertBox=document.getElementById('alert-scadenze');
  if (imminenti.length>0) {
    alertBox.style.display='block';
    document.getElementById('alert-scadenze-txt').textContent=
      imminenti.map(s=>`${s.descrizione} (${fmt(s.importo)}) — ${new Date(s.data_scadenza).toLocaleDateString('it-IT')}`).join(' · ');
  } else alertBox.style.display='none';

  document.getElementById('dash-months').innerHTML=MESI.map((m,i)=>{
    const e=_entrate.filter(x=>x.mese===m&&x.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0);
    const u=_uscite.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    const s=_stipendi.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    const sal=e-u-s;
    const cls=sal>0?'pos':sal<0?'neg':'zero';
    return `<div class="month-cell ${cls}"><div class="mlabel">${MESI_S[i]}</div><div class="mval">${sal===0?'—':fmtShort(sal)}</div></div>`;
  }).join('');

  const eData=MESI.map(m=>_entrate.filter(x=>x.mese===m&&x.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0));
  const uData=MESI.map(m=>{
    const u=_uscite.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    const s=_stipendi.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    return u+s;
  });
  if (_chartBar) _chartBar.destroy();
  _chartBar=new Chart(document.getElementById('chart-bar'),{
    type:'bar',
    data:{labels:MESI_S,datasets:[
      {label:'Entrate',data:eData,backgroundColor:'#1B7B4B33',borderColor:'#1B7B4B',borderWidth:1.5,borderRadius:4},
      {label:'Uscite',data:uData,backgroundColor:'#C0392B33',borderColor:'#C0392B',borderWidth:1.5,borderRadius:4}
    ]},
    options:{responsive:true,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: €${Math.round(ctx.raw).toLocaleString('it-IT')}`}}},scales:{y:{ticks:{callback:v=>'€'+Math.round(v).toLocaleString('it-IT')}}}}
  });

  const nonPagato=_entrate.filter(e=>e.stato==='NON PAGATO').reduce((a,b)=>a+Number(b.importo),0);
  const fatturaInCorso=_entrate.filter(e=>e.stato==='FATTURA IN CORSO').reduce((a,b)=>a+Number(b.importo),0);
  const bando=_entrate.filter(e=>e.stato==='BANDO').reduce((a,b)=>a+Number(b.importo),0);
  if (_chartTorta) _chartTorta.destroy();
  _chartTorta=new Chart(document.getElementById('chart-torta'),{
    type:'doughnut',
    data:{labels:['Incassato','Non pagato','Fattura in corso','Bando'],
      datasets:[{data:[totE,nonPagato,fatturaInCorso,bando],backgroundColor:['#1B7B4B','#C0392B','#9A5F00','#1A4F8A'],borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,plugins:{legend:{display:false}},cutout:'65%'}
  });
  document.getElementById('torta-legend').innerHTML=[
    ['#1B7B4B','Incassato',totE],['#C0392B','Non pagato',nonPagato],
    ['#9A5F00','Fattura in corso',fatturaInCorso],['#1A4F8A','Bando',bando]
  ].map(([c,l,v])=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
    <div style="width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0"></div>
    <span style="color:var(--text-muted)">${l}</span>
    <span style="font-weight:500;margin-left:auto">${fmt(v)}</span></div>`).join('');

  const stati={PAGATO:0,'NON PAGATO':0,'FATTURA IN CORSO':0,BANDO:0};
  _entrate.forEach(e=>{stati[e.stato]=(stati[e.stato]||0)+Number(e.importo);});
  document.getElementById('dash-stati').innerHTML=Object.entries(stati)
    .map(([k,v])=>`<div class="stat-row"><span>${badgeStato(k)}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');

  // Uscite per categoria (include categorie custom)
  const cats={};
  CATEGORIE_USCITE.forEach(c=>cats[c]=0);
  _uscite.forEach(u=>{if(cats[u.categoria]!==undefined)cats[u.categoria]+=Number(u.importo); else cats[u.categoria]=(cats[u.categoria]||0)+Number(u.importo);});
  cats['Stipendi']=(cats['Stipendi']||0)+totS;
  document.getElementById('dash-cat').innerHTML=Object.entries(cats)
    .filter(([,v])=>v>0)
    .map(([k,v])=>`<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');
}

// ---- ENTRATE ----
function renderEntrate() {
  const mes=document.getElementById('fil-mese-e').value;
  const sta=document.getElementById('fil-stato-e').value;
  const cer=document.getElementById('fil-cerca-e').value.toLowerCase();
  const fil=_entrate.filter(e=>(!mes||e.mese===mes)&&(!sta||e.stato===sta)&&(!cer||e.cliente.toLowerCase().includes(cer)));
  const tot=fil.reduce((a,b)=>a+Number(b.importo),0);
  document.getElementById('tb-entrate').innerHTML=fil.length
    ?fil.map(e=>`<tr>
      <td style="font-weight:500">${e.cliente}</td><td>${e.mese}</td>
      <td class="td-mono td-right">${fmt(e.importo)}</td><td>${badgeStato(e.stato)}</td>
      <td style="color:var(--text-muted)">${e.note||'—'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="apriModificaEntrata('${e.id}')">✎</button>
        <button class="btn btn-sm btn-icon" onclick="eliminaEntrata('${e.id}')">✕</button>
      </td>
    </tr>`).join('')
    :`<tr><td colspan="6" class="empty">Nessuna entrata trovata</td></tr>`;
  document.getElementById('tot-entrate').textContent=`${fil.length} voci · Totale: ${fmt(tot)}`;
}

function apriModificaEntrata(id) {
  const e=_entrate.find(x=>x.id===id);
  if (!e)return;
  _editingEntrata=id;
  document.getElementById('e-cliente').value=e.cliente;
  document.getElementById('e-importo').value=e.importo;
  document.getElementById('e-mese').value=e.mese;
  document.getElementById('e-stato').value=e.stato;
  document.getElementById('e-note').value=e.note||'';
  document.getElementById('modal-entrata-title').textContent='Modifica entrata';
  openModal('modal-entrata');
}

async function salvaEntrata() {
  const cliente=document.getElementById('e-cliente').value.trim();
  const importo=Number(document.getElementById('e-importo').value);
  if (!cliente||!importo){toast('Inserisci cliente e importo');return;}
  const data={cliente,importo,mese:document.getElementById('e-mese').value,
    stato:document.getElementById('e-stato').value,note:document.getElementById('e-note').value};
  let error;
  if (_editingEntrata) {
    ({error}=await sb.from('entrate').update(data).eq('id',_editingEntrata));
  } else {
    ({error}=await sb.from('entrate').insert(data));
  }
  if (error){toast('Errore: '+error.message);return;}
  toast(_editingEntrata?'Entrata aggiornata ✓':'Entrata salvata ✓');
  _editingEntrata=null;
  document.getElementById('modal-entrata-title').textContent='Nuova entrata';
  closeModal('modal-entrata');
  await loadAll(); renderEntrate();
  ['e-cliente','e-importo','e-note'].forEach(id=>document.getElementById(id).value='');
}

async function eliminaEntrata(id) {
  if (!confirm('Eliminare questa entrata?'))return;
  await sb.from('entrate').delete().eq('id',id);
  await loadAll(); renderEntrate();
}

// ---- USCITE ----
function populateCategorieSelect(selId) {
  const sel=document.getElementById(selId);
  if (!sel)return;
  const cur=sel.value;
  const prefix=selId.startsWith('fil')?'<option value="">Tutte le categorie</option>':'';
  sel.innerHTML=prefix+CATEGORIE_USCITE.map(c=>`<option value="${c}">${c}</option>`).join('');
  if (cur) sel.value=cur;
}

function renderUscite() {
  populateCategorieSelect('fil-cat-u');
  const mes=document.getElementById('fil-mese-u').value;
  const cat=document.getElementById('fil-cat-u').value;
  const cer=document.getElementById('fil-cerca-u').value.toLowerCase();
  const fil=_uscite.filter(u=>(!mes||u.mese===mes)&&(!cat||u.categoria===cat)&&
    (!cer||(u.descrizione||'').toLowerCase().includes(cer)||(u.fornitore||'').toLowerCase().includes(cer)));
  const tot=fil.reduce((a,b)=>a+Number(b.importo),0);

  // Totale per categoria visibile
  const catTotals={};
  fil.forEach(u=>{catTotals[u.categoria]=(catTotals[u.categoria]||0)+Number(u.importo);});
  const catSummary=Object.entries(catTotals).map(([k,v])=>`${k}: ${fmt(v)}`).join(' · ');

  document.getElementById('tb-uscite').innerHTML=fil.length
    ?fil.map(u=>`<tr>
      <td style="color:var(--text-muted)">${u.data||'—'}</td><td>${badgeCat(u.categoria)}</td>
      <td>${u.descrizione||'—'}</td>
      <td class="td-mono td-right" style="color:var(--red)">${fmt(u.importo)}</td>
      <td style="color:var(--text-muted)">${u.fornitore||'—'}</td>
      <td style="color:var(--text-muted)">${u.metodo||'—'}</td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-sm" onclick="apriModificaUscita('${u.id}')">✎</button>
        <button class="btn btn-sm btn-icon" onclick="eliminaUscita('${u.id}')">✕</button>
      </td>
    </tr>`).join('')
    :`<tr><td colspan="7" class="empty">Nessuna uscita trovata</td></tr>`;
  document.getElementById('tot-uscite').innerHTML=`${fil.length} voci · Totale: <strong>${fmt(tot)}</strong>${catSummary?' &nbsp;|&nbsp; '+catSummary:''}`;
}

function apriModificaUscita(id) {
  const u=_uscite.find(x=>x.id===id);
  if (!u)return;
  _editingUscita=id;
  populateCategorieSelect('u-cat');
  document.getElementById('u-data').value=u.data||todayISO();
  document.getElementById('u-cat').value=u.categoria;
  document.getElementById('u-mese').value=u.mese||MESI[new Date().getMonth()];
  document.getElementById('u-desc').value=u.descrizione||'';
  document.getElementById('u-importo').value=u.importo;
  document.getElementById('u-fornitore').value=u.fornitore||'';
  document.getElementById('u-metodo').value=u.metodo||'Bonifico';
  document.getElementById('u-note').value=u.note||'';
  document.getElementById('modal-uscita-title').textContent='Modifica uscita';
  openModal('modal-uscita');
}

async function salvaUscita() {
  const importo=Number(document.getElementById('u-importo').value);
  if (!importo){toast('Inserisci importo');return;}
  const data={
    data:document.getElementById('u-data').value||todayISO(),
    categoria:document.getElementById('u-cat').value,
    mese:document.getElementById('u-mese').value,
    descrizione:document.getElementById('u-desc').value,
    importo,fornitore:document.getElementById('u-fornitore').value,
    metodo:document.getElementById('u-metodo').value,
    note:document.getElementById('u-note').value
  };
  let error;
  if (_editingUscita) {
    ({error}=await sb.from('uscite').update(data).eq('id',_editingUscita));
  } else {
    ({error}=await sb.from('uscite').insert(data));
  }
  if (error){toast('Errore: '+error.message);return;}
  toast(_editingUscita?'Uscita aggiornata ✓':'Uscita salvata ✓');
  _editingUscita=null;
  document.getElementById('modal-uscita-title').textContent='Nuova uscita';
  closeModal('modal-uscita');
  await loadAll(); renderUscite();
}

async function eliminaUscita(id) {
  if (!confirm('Eliminare questa uscita?'))return;
  await sb.from('uscite').delete().eq('id',id);
  await loadAll(); renderUscite();
}

// Gestione categorie custom
function apriGestioneCategorie() { openModal('modal-categorie'); renderListaCategorie(); }

function renderListaCategorie() {
  document.getElementById('lista-categorie').innerHTML=CATEGORIE_USCITE.map((c,i)=>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span>${c}</span>
      <button class="btn btn-sm btn-icon" onclick="eliminaCategoria(${i})" ${CATEGORIE_USCITE.length<=1?'disabled':''}>✕</button>
    </div>`).join('');
}

function aggiungiCategoria() {
  const input=document.getElementById('nuova-categoria');
  const nome=input.value.trim();
  if (!nome){toast('Inserisci un nome');return;}
  if (CATEGORIE_USCITE.includes(nome)){toast('Categoria già esistente');return;}
  CATEGORIE_USCITE.push(nome);
  saveCategorie();
  input.value='';
  renderListaCategorie();
  toast('Categoria aggiunta ✓');
}

function eliminaCategoria(idx) {
  if (CATEGORIE_USCITE.length<=1)return;
  if (!confirm(`Eliminare la categoria "${CATEGORIE_USCITE[idx]}"?`))return;
  CATEGORIE_USCITE.splice(idx,1);
  saveCategorie();
  renderListaCategorie();
}

// ---- STIPENDI ----
function renderStipendi() {
  const tipo=document.getElementById('fil-tipo-s').value;
  const thead=`<thead><tr><th>Dipendente</th>${MESI_S.map(m=>`<th class="td-right">${m}</th>`).join('')}<th class="td-right">Totale</th></tr></thead>`;
  const rows=_dipendenti.map(d=>{
    const cells=MESI.map(m=>{
      const rec=_stipendi.find(s=>s.dipendenti?.nome===d.nome&&s.tipo===tipo&&s.mese===m);
      const val=rec?Number(rec.importo):0;
      return `<td class="td-right"><input class="stipendi-input" type="number" value="${val||''}" placeholder="—"
        onchange="aggiornaStipendio('${d.id}','${d.nome}','${tipo}','${m}',this.value)"></td>`;
    }).join('');
    const tot=_stipendi.filter(s=>s.dipendenti?.nome===d.nome&&s.tipo===tipo).reduce((a,b)=>a+Number(b.importo),0);
    return `<tr><td style="font-weight:500;white-space:nowrap">${d.nome}</td>${cells}<td class="td-mono td-right" style="font-weight:500">${tot?fmt(tot):'—'}</td></tr>`;
  }).join('');
  const totRow=`<tr style="border-top:2px solid var(--border-strong);background:var(--bg)">
    <td style="font-weight:600;font-size:12px">Totale mese</td>
    ${MESI.map(m=>{const t=_stipendi.filter(s=>s.tipo===tipo&&s.mese===m).reduce((a,b)=>a+Number(b.importo),0);
      return `<td class="td-mono td-right" style="font-weight:500;font-size:12px">${t?fmtShort(t):'—'}</td>`;}).join('')}
    <td class="td-mono td-right" style="font-weight:600;font-size:12px">${fmt(_stipendi.filter(s=>s.tipo===tipo).reduce((a,b)=>a+Number(b.importo),0))}</td>
  </tr>`;
  document.getElementById('tb-stipendi').innerHTML=thead+`<tbody>${rows}${totRow}</tbody>`;
}

async function aggiornaStipendio(dipId,dipNome,tipo,mese,val) {
  const importo=Number(val)||0;
  const rec=_stipendi.find(s=>s.dipendenti?.nome===dipNome&&s.tipo===tipo&&s.mese===mese);
  if (rec) await sb.from('stipendi').update({importo}).eq('id',rec.id);
  else await sb.from('stipendi').insert({dipendente_id:dipId,tipo,mese,anno:2026,importo});
  await loadAll();
}

async function salvaDipendente() {
  const nome=document.getElementById('d-nome').value.trim();
  if (!nome)return;
  const {error}=await sb.from('dipendenti').insert({nome});
  if (error){toast('Errore o nome già esistente');return;}
  toast('Dipendente aggiunto ✓'); closeModal('modal-dipendente');
  document.getElementById('d-nome').value='';
  await loadAll(); renderStipendi();
}

// ---- CLIENTI ----
function renderClienti() {
  const cer=document.getElementById('fil-cerca-c').value.toLowerCase();
  const tipo=document.getElementById('fil-tipo-c').value;
  const fil=_clienti.filter(c=>(!tipo||c.tipo===tipo)&&
    (!cer||c.ragione_sociale.toLowerCase().includes(cer)||(c.referente||'').toLowerCase().includes(cer)));
  document.getElementById('tb-clienti').innerHTML=fil.length
    ?fil.map(c=>`<tr style="cursor:pointer" onclick="mostraCliente('${c.id}')">
      <td style="font-weight:500">${c.ragione_sociale}</td>
      <td><span class="badge badge-gray">${c.tipo||'—'}</span></td>
      <td>${c.referente||'—'}</td>
      <td style="color:var(--text-muted)">${c.email||'—'}</td>
      <td style="color:var(--text-muted)">${c.telefono||'—'}</td>
      <td class="td-mono" style="font-size:11px;color:var(--text-muted)">${c.piva||'—'}</td>
      <td><span class="badge badge-blue">${c.condizioni_pagamento||'—'}</span></td>
      <td><button class="btn btn-sm btn-icon" onclick="event.stopPropagation();eliminaCliente('${c.id}')">✕</button></td>
    </tr>`).join('')
    :`<tr><td colspan="8" class="empty">Nessun cliente trovato</td></tr>`;
  document.getElementById('tot-clienti').textContent=`${fil.length} clienti`;
}

function mostraCliente(id) {
  const c=_clienti.find(x=>x.id===id);
  if (!c)return;
  document.getElementById('det-titolo').textContent=c.ragione_sociale;
  const field=(l,v)=>`<div class="detail-item"><div class="dlabel">${l}</div><div class="dval ${!v?'empty':''}">${v||'Non specificato'}</div></div>`;
  document.getElementById('det-body').innerHTML=`<div class="detail-grid">
    ${field('Tipo',c.tipo)}${field('Settore',c.settore)}
    ${field('P.IVA',c.piva)}${field('Codice Fiscale',c.cf)}
    ${field('Referente',c.referente)}${field('Email',c.email)}
    ${field('Telefono',c.telefono)}${field('Indirizzo',[c.indirizzo,c.citta,c.cap].filter(Boolean).join(', '))}
    ${field('IBAN',c.iban)}${field('Condizioni pagamento',c.condizioni_pagamento)}
    ${field('Note',c.note)}</div>`;
  openModal('modal-cliente-dettaglio');
}

async function salvaCliente() {
  const ragione=document.getElementById('c-ragione').value.trim();
  if (!ragione){toast('Inserisci ragione sociale');return;}
  const {error}=await sb.from('clienti').insert({
    ragione_sociale:ragione,tipo:document.getElementById('c-tipo').value,
    piva:document.getElementById('c-piva').value,cf:document.getElementById('c-cf').value,
    settore:document.getElementById('c-settore').value,referente:document.getElementById('c-referente').value,
    email:document.getElementById('c-email').value,telefono:document.getElementById('c-tel').value,
    indirizzo:document.getElementById('c-indirizzo').value,citta:document.getElementById('c-citta').value,
    iban:document.getElementById('c-iban').value,
    condizioni_pagamento:document.getElementById('c-pagamento').value,
    note:document.getElementById('c-note').value
  });
  if (error){toast('Errore: '+error.message);return;}
  toast('Cliente salvato ✓'); closeModal('modal-cliente');
  await loadAll(); renderClienti();
  ['c-ragione','c-piva','c-cf','c-settore','c-referente','c-email','c-tel','c-indirizzo','c-citta','c-iban','c-note']
    .forEach(id=>document.getElementById(id).value='');
}

async function eliminaCliente(id) {
  if (!confirm('Eliminare questo cliente?'))return;
  await sb.from('clienti').delete().eq('id',id);
  await loadAll(); renderClienti();
}

// ---- SCADENZARIO ----
function renderScadenze() {
  const stato=document.getElementById('fil-stato-sc').value;
  const tipo=document.getElementById('fil-tipo-sc').value;
  const fil=_scadenze.filter(s=>(!stato||s.stato===stato)&&(!tipo||s.tipo===tipo));

  const imm=fil.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<=7&&daysDiff(s.data_scadenza)>=0);
  const scad=fil.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<0);
  let alertHtml='';
  if (scad.length) alertHtml+=`<div class="alert-box" style="border-color:var(--red);color:var(--red);background:var(--red-bg);margin-bottom:12px">⚠️ <strong>${scad.length} scadenze già passate</strong></div>`;
  if (imm.length) alertHtml+=`<div class="alert-box" style="margin-bottom:12px">⏰ <strong>${imm.length} scadenze entro 7 giorni:</strong> ${imm.map(s=>s.descrizione).join(', ')}</div>`;
  document.getElementById('scad-alert-box').innerHTML=alertHtml;

  document.getElementById('tb-scadenze').innerHTML=fil.length
    ?fil.map(s=>{
      const days=daysDiff(s.data_scadenza);
      const rowCls=s.stato==='In attesa'&&days<0?'scad-urgente':s.stato==='In attesa'&&days<=7?'scad-imminente':'';
      const dStr=new Date(s.data_scadenza).toLocaleDateString('it-IT');
      const daysTxt=s.stato==='In attesa'?(days<0?`<span style="color:var(--red);font-size:11px">${Math.abs(days)}gg fa</span>`:days===0?`<span style="color:var(--red);font-size:11px">Oggi!</span>`:`<span style="color:var(--amber);font-size:11px">tra ${days}gg</span>`):'';
      return `<tr class="${rowCls}">
        <td><div style="font-weight:500">${dStr}</div>${daysTxt}</td>
        <td><span class="badge ${s.tipo==='entrata'?'badge-green':'badge-red'}">${s.tipo==='entrata'?'↓ Entrata':'↑ Uscita'}</span></td>
        <td style="font-weight:500">${s.descrizione}</td>
        <td style="color:var(--text-muted)">${s.clienti?.ragione_sociale||'—'}</td>
        <td class="td-mono td-right" style="font-weight:500">${fmt(s.importo)}</td>
        <td>${badgeScad(s.stato)}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.note||'—'}</td>
        <td style="display:flex;gap:4px">
          ${s.stato==='In attesa'?`<button class="btn btn-sm" style="color:var(--green)" onclick="segnaScadenza('${s.id}','Pagato')">✓</button>`:''}
          <button class="btn btn-sm btn-icon" onclick="eliminaScadenza('${s.id}')">✕</button>
        </td>
      </tr>`;}).join('')
    :`<tr><td colspan="8" class="empty">Nessuna scadenza trovata</td></tr>`;
}

async function salvaScadenza() {
  const desc=document.getElementById('sc-desc').value.trim();
  const importo=Number(document.getElementById('sc-importo').value);
  const data=document.getElementById('sc-data').value;
  if (!desc||!importo||!data){toast('Inserisci descrizione, importo e data');return;}
  const clienteId=document.getElementById('sc-cliente').value||null;
  const {error}=await sb.from('scadenze').insert({
    tipo:document.getElementById('sc-tipo').value,descrizione:desc,importo,
    data_scadenza:data,stato:document.getElementById('sc-stato').value,
    cliente_id:clienteId,note:document.getElementById('sc-note').value});
  if (error){toast('Errore: '+error.message);return;}
  toast('Scadenza salvata ✓'); closeModal('modal-scadenza');
  await loadAll(); renderScadenze();
}

async function segnaScadenza(id,stato) {
  await sb.from('scadenze').update({stato}).eq('id',id);
  await loadAll(); renderScadenze();
  toast(`Segnata come ${stato} ✓`);
}

async function eliminaScadenza(id) {
  if (!confirm('Eliminare questa scadenza?'))return;
  await sb.from('scadenze').delete().eq('id',id);
  await loadAll(); renderScadenze();
}

// ---- EXPORT ----
function esportaCSV() {
  let csv='ENTRATE\nCliente,Mese,Importo,Stato,Note\n';
  _entrate.forEach(e=>csv+=`"${e.cliente}","${e.mese}",${e.importo},"${e.stato}","${e.note||''}"\n`);
  csv+='\nUSCITE\nData,Categoria,Mese,Descrizione,Importo,Fornitore,Metodo\n';
  _uscite.forEach(u=>csv+=`"${u.data||''}","${u.categoria}","${u.mese||''}","${u.descrizione||''}",${u.importo},"${u.fornitore||''}","${u.metodo||''}"\n`);
  csv+='\nSTIPENDI\nDipendente,'+MESI.join(',')+',Totale\n';
  _dipendenti.forEach(d=>{
    const row=MESI.map(m=>{const r=_stipendi.find(s=>s.dipendenti?.nome===d.nome&&s.tipo==='stipendio'&&s.mese===m);return r?r.importo:0;});
    csv+=`"${d.nome}",${row.join(',')},${row.reduce((a,b)=>a+Number(b),0)}\n`;
  });
  csv+='\nCLIENTI\nRagione Sociale,Tipo,P.IVA,Referente,Email,Telefono,Pagamento\n';
  _clienti.forEach(c=>csv+=`"${c.ragione_sociale}","${c.tipo||''}","${c.piva||''}","${c.referente||''}","${c.email||''}","${c.telefono||''}","${c.condizioni_pagamento||''}"\n`);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='gestionale_2026.csv'; a.click();
  toast('Export avviato ✓');
}

// ---- MODALS ----
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id==='modal-uscita' && !_editingUscita) {
    document.getElementById('u-data').value=todayISO();
    populateCategorieSelect('u-cat');
  }
  if (id==='modal-scadenza') {
    const sel=document.getElementById('sc-cliente');
    sel.innerHTML='<option value="">— Nessuno —</option>'+
      _clienti.map(c=>`<option value="${c.id}">${c.ragione_sociale}</option>`).join('');
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id==='modal-entrata') { _editingEntrata=null; document.getElementById('modal-entrata-title').textContent='Nuova entrata'; }
  if (id==='modal-uscita') { _editingUscita=null; document.getElementById('modal-uscita-title').textContent='Nuova uscita'; }
}

document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
});

function populateMesi() {
  ['e-mese','u-mese','fil-mese-e','fil-mese-u'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    el.innerHTML=(id.startsWith('fil')?'<option value="">Tutti i mesi</option>':'')+
      MESI.map(m=>`<option>${m}</option>`).join('');
  });
}

populateMesi();
init();
