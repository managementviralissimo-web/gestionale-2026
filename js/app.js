// GESTIONALE 2026 - App Logic v4
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MESI_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

let CATEGORIE_USCITE = JSON.parse(localStorage.getItem('cat_uscite')||'["Stipendi","Affitto","Tasse","Servizi Digitali","Ufficio","Extra"]');
function saveCategorie() { localStorage.setItem('cat_uscite', JSON.stringify(CATEGORIE_USCITE)); }

let currentUser = null;
let _entrate=[], _uscite=[], _dipendenti=[], _stipendi=[];
let _clienti=[], _scadenze=[], _goals=[], _contratti=[], _pagamenti=[];
let _chartBar=null, _chartTorta=null;
let _editingEntrata=null, _editingUscita=null, _editingGoal=null, _editingDip=null;

// ---- UTILS ----
function fmt(n){return '€ '+Math.round(n||0).toLocaleString('it-IT');}
function fmtShort(n){const v=Math.round(n||0);return Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':v.toString();}
function todayISO(){return new Date().toISOString().split('T')[0];}
function initials(name){return name.split(' ').map(w=>w[0]||'').join('').substring(0,2).toUpperCase();}
function toast(msg,duration=2500){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),duration);}
function daysDiff(dateStr){const d=new Date(dateStr),n=new Date();n.setHours(0,0,0,0);d.setHours(0,0,0,0);return Math.round((d-n)/(1000*60*60*24));}

function badgeStato(s){const m={'PAGATO':'badge-green','NON PAGATO':'badge-red','FATTURA IN CORSO':'badge-amber','BANDO':'badge-blue'};return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;}
function badgeCat(c){const colors=['badge-amber','badge-blue','badge-red','badge-green','badge-gray'];const idx=CATEGORIE_USCITE.indexOf(c)%colors.length;return `<span class="badge ${colors[Math.max(0,idx)]}">${c}</span>`;}
function badgeScad(s){const m={'In attesa':'badge-amber','Pagato':'badge-green','Scaduto':'badge-red'};return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;}

// ---- AUTH ----
async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session){currentUser=session.user;showApp();}else showAuth();
  sb.auth.onAuthStateChange((_,session)=>{if(session){currentUser=session.user;showApp();}else{currentUser=null;showAuth();}});
}
function showAuth(){document.getElementById('auth-screen').style.display='flex';document.getElementById('app-screen').style.display='none';}
async function showApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';
  document.getElementById('user-email').textContent=currentUser.email;
  await loadAll();showTab('dashboard');
}
async function login(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const msg=document.getElementById('auth-msg');msg.textContent='';
  if(!email||!pass){msg.textContent='Inserisci email e password.';return;}
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error)msg.textContent=error.message;
}
async function signup(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const msg=document.getElementById('auth-msg');msg.textContent='';
  if(!email||!pass){msg.textContent='Inserisci email e password.';return;}
  const {error}=await sb.auth.signUp({email,password:pass});
  if(error)msg.textContent=error.message;
  else msg.textContent='✓ Controlla la tua email per confermare.';
}
async function logout(){await sb.auth.signOut();}

// ---- DATA ----
async function loadAll(){
  const [e,u,d,s,c,sc,g,ct,pg]=await Promise.all([
    sb.from('entrate').select('*').order('created_at',{ascending:false}),
    sb.from('uscite').select('*').order('created_at',{ascending:false}),
    sb.from('dipendenti').select('*').order('nome'),
    sb.from('stipendi').select('*, dipendenti(nome)').eq('anno',2026),
    sb.from('clienti').select('*').order('ragione_sociale'),
    sb.from('scadenze').select('*, clienti(ragione_sociale)').order('data_scadenza'),
    sb.from('goals').select('*').order('created_at',{ascending:false}),
    sb.from('contratti_clienti').select('*'),
    sb.from('pagamenti_clienti').select('*').eq('anno',2026)
  ]);
  _entrate=e.data||[];_uscite=u.data||[];_dipendenti=d.data||[];_stipendi=s.data||[];
  _clienti=c.data||[];_scadenze=sc.data||[];_goals=g.data||[];
  _contratti=ct.data||[];_pagamenti=pg.data||[];
}

// ---- NAV ----
function showTab(tab){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+tab).classList.add('active');
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  const r={dashboard:renderDashboard,entrate:renderEntrate,uscite:renderUscite,
            stipendi:renderDipendentiList,clienti:renderClienti,scadenze:renderScadenze,goals:renderGoals};
  if(r[tab])r[tab]();
}

// ---- DASHBOARD ----
function renderDashboard(){
  const totE=_entrate.filter(e=>e.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0);
  const totU=_uscite.reduce((a,b)=>a+Number(b.importo),0);
  const totS=_stipendi.reduce((a,b)=>a+Number(b.importo),0);
  const saldo=totE-totU-totS;
  document.getElementById('kpi-entrate').textContent=fmt(totE);
  document.getElementById('kpi-uscite').textContent=fmt(totU+totS);
  document.getElementById('kpi-stipendi').textContent=fmt(totS);
  const ks=document.getElementById('kpi-saldo');ks.textContent=fmt(saldo);ks.className='kpi-value '+(saldo>=0?'pos':'neg');

  const imminenti=_scadenze.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<=7&&daysDiff(s.data_scadenza)>=0);
  const ab=document.getElementById('alert-scadenze');
  if(imminenti.length){ab.style.display='block';document.getElementById('alert-scadenze-txt').textContent=imminenti.map(s=>`${s.descrizione} (${fmt(s.importo)})`).join(' · ');}
  else ab.style.display='none';

  document.getElementById('dash-months').innerHTML=MESI.map((m,i)=>{
    const e=_entrate.filter(x=>x.mese===m&&x.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0);
    const u=_uscite.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    const s=_stipendi.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0);
    const sal=e-u-s;const cls=sal>0?'pos':sal<0?'neg':'zero';
    return `<div class="month-cell ${cls}"><div class="mlabel">${MESI_S[i]}</div><div class="mval">${sal===0?'—':fmtShort(sal)}</div></div>`;
  }).join('');

  const eData=MESI.map(m=>_entrate.filter(x=>x.mese===m&&x.stato==='PAGATO').reduce((a,b)=>a+Number(b.importo),0));
  const uData=MESI.map(m=>_uscite.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0)+_stipendi.filter(x=>x.mese===m).reduce((a,b)=>a+Number(b.importo),0));
  if(_chartBar)_chartBar.destroy();
  _chartBar=new Chart(document.getElementById('chart-bar'),{type:'bar',data:{labels:MESI_S,datasets:[
    {label:'Entrate',data:eData,backgroundColor:'#1B7B4B33',borderColor:'#1B7B4B',borderWidth:1.5,borderRadius:4},
    {label:'Uscite',data:uData,backgroundColor:'#C0392B33',borderColor:'#C0392B',borderWidth:1.5,borderRadius:4}
  ]},options:{responsive:true,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: €${Math.round(ctx.raw).toLocaleString('it-IT')}`}}},scales:{y:{ticks:{callback:v=>'€'+Math.round(v).toLocaleString('it-IT')}}}}});

  const nonPagato=_entrate.filter(e=>e.stato==='NON PAGATO').reduce((a,b)=>a+Number(b.importo),0);
  const fattura=_entrate.filter(e=>e.stato==='FATTURA IN CORSO').reduce((a,b)=>a+Number(b.importo),0);
  const bando=_entrate.filter(e=>e.stato==='BANDO').reduce((a,b)=>a+Number(b.importo),0);
  if(_chartTorta)_chartTorta.destroy();
  _chartTorta=new Chart(document.getElementById('chart-torta'),{type:'doughnut',data:{labels:['Incassato','Non pagato','Fattura in corso','Bando'],
    datasets:[{data:[totE,nonPagato,fattura,bando],backgroundColor:['#1B7B4B','#C0392B','#9A5F00','#1A4F8A'],borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,plugins:{legend:{display:false}},cutout:'65%'}});
  document.getElementById('torta-legend').innerHTML=[['#1B7B4B','Incassato',totE],['#C0392B','Non pagato',nonPagato],['#9A5F00','Fattura in corso',fattura],['#1A4F8A','Bando',bando]]
    .map(([c,l,v])=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:10px;height:10px;border-radius:2px;background:${c};flex-shrink:0"></div><span style="color:var(--text-muted)">${l}</span><span style="font-weight:500;margin-left:auto">${fmt(v)}</span></div>`).join('');

  const stati={PAGATO:0,'NON PAGATO':0,'FATTURA IN CORSO':0,BANDO:0};
  _entrate.forEach(e=>{stati[e.stato]=(stati[e.stato]||0)+Number(e.importo);});
  document.getElementById('dash-stati').innerHTML=Object.entries(stati).map(([k,v])=>`<div class="stat-row"><span>${badgeStato(k)}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');
  const cats={};CATEGORIE_USCITE.forEach(c=>cats[c]=0);
  _uscite.forEach(u=>{cats[u.categoria]=(cats[u.categoria]||0)+Number(u.importo);});
  cats['Stipendi']=(cats['Stipendi']||0)+totS;
  document.getElementById('dash-cat').innerHTML=Object.entries(cats).filter(([,v])=>v>0).map(([k,v])=>`<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-val">${fmt(v)}</span></div>`).join('');
}

// ---- ENTRATE ----
function renderEntrate(){
  const mes=document.getElementById('fil-mese-e').value;
  const sta=document.getElementById('fil-stato-e').value;
  const cer=document.getElementById('fil-cerca-e').value.toLowerCase();
  const fil=_entrate.filter(e=>(!mes||e.mese===mes)&&(!sta||e.stato===sta)&&(!cer||e.cliente.toLowerCase().includes(cer)));
  const tot=fil.reduce((a,b)=>a+Number(b.importo),0);
  document.getElementById('tb-entrate').innerHTML=fil.length
    ?fil.map(e=>`<tr><td style="font-weight:500">${e.cliente}</td><td>${e.mese}</td><td class="td-mono td-right">${fmt(e.importo)}</td><td>${badgeStato(e.stato)}</td><td style="color:var(--text-muted)">${e.note||'—'}</td>
      <td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="apriModificaEntrata('${e.id}')">✎</button><button class="btn btn-sm btn-icon" onclick="eliminaEntrata('${e.id}')">✕</button></td></tr>`).join('')
    :`<tr><td colspan="6" class="empty">Nessuna entrata trovata</td></tr>`;
  document.getElementById('tot-entrate').textContent=`${fil.length} voci · Totale: ${fmt(tot)}`;
}
function apriModificaEntrata(id){
  const e=_entrate.find(x=>x.id===id);if(!e)return;_editingEntrata=id;
  document.getElementById('e-cliente').value=e.cliente;document.getElementById('e-importo').value=e.importo;
  document.getElementById('e-mese').value=e.mese;document.getElementById('e-stato').value=e.stato;document.getElementById('e-note').value=e.note||'';
  document.getElementById('modal-entrata-title').textContent='Modifica entrata';openModal('modal-entrata');
}
async function salvaEntrata(){
  const cliente=document.getElementById('e-cliente').value.trim();const importo=Number(document.getElementById('e-importo').value);
  if(!cliente||!importo){toast('Inserisci cliente e importo');return;}
  const data={cliente,importo,mese:document.getElementById('e-mese').value,stato:document.getElementById('e-stato').value,note:document.getElementById('e-note').value};
  let error;
  if(_editingEntrata){({error}=await sb.from('entrate').update(data).eq('id',_editingEntrata));}
  else{({error}=await sb.from('entrate').insert(data));}
  if(error){toast('Errore: '+error.message);return;}
  toast(_editingEntrata?'Entrata aggiornata ✓':'Entrata salvata ✓');_editingEntrata=null;
  document.getElementById('modal-entrata-title').textContent='Nuova entrata';
  closeModal('modal-entrata');await loadAll();renderEntrate();
  ['e-cliente','e-importo','e-note'].forEach(id=>document.getElementById(id).value='');
}
async function eliminaEntrata(id){if(!confirm('Eliminare?'))return;await sb.from('entrate').delete().eq('id',id);await loadAll();renderEntrate();}

// ---- USCITE ----
function populateCategorieSelect(selId){
  const sel=document.getElementById(selId);if(!sel)return;
  const cur=sel.value;const prefix=selId.startsWith('fil')?'<option value="">Tutte le categorie</option>':'';
  sel.innerHTML=prefix+CATEGORIE_USCITE.map(c=>`<option value="${c}">${c}</option>`).join('');if(cur)sel.value=cur;
}
function renderUscite(){
  populateCategorieSelect('fil-cat-u');
  const mes=document.getElementById('fil-mese-u').value;const cat=document.getElementById('fil-cat-u').value;const cer=document.getElementById('fil-cerca-u').value.toLowerCase();
  const fil=_uscite.filter(u=>(!mes||u.mese===mes)&&(!cat||u.categoria===cat)&&(!cer||(u.descrizione||'').toLowerCase().includes(cer)||(u.fornitore||'').toLowerCase().includes(cer)));
  const tot=fil.reduce((a,b)=>a+Number(b.importo),0);
  const catTotals={};fil.forEach(u=>{catTotals[u.categoria]=(catTotals[u.categoria]||0)+Number(u.importo);});
  const catSummary=Object.entries(catTotals).map(([k,v])=>`${k}: ${fmt(v)}`).join(' · ');
  document.getElementById('tb-uscite').innerHTML=fil.length
    ?fil.map(u=>`<tr><td style="color:var(--text-muted)">${u.data||'—'}</td><td>${badgeCat(u.categoria)}</td><td>${u.descrizione||'—'}</td>
      <td class="td-mono td-right" style="color:var(--red)">${fmt(u.importo)}</td><td style="color:var(--text-muted)">${u.fornitore||'—'}</td><td style="color:var(--text-muted)">${u.metodo||'—'}</td>
      <td style="display:flex;gap:4px"><button class="btn btn-sm" onclick="apriModificaUscita('${u.id}')">✎</button><button class="btn btn-sm btn-icon" onclick="eliminaUscita('${u.id}')">✕</button></td></tr>`).join('')
    :`<tr><td colspan="7" class="empty">Nessuna uscita trovata</td></tr>`;
  document.getElementById('tot-uscite').innerHTML=`${fil.length} voci · Totale: <strong>${fmt(tot)}</strong>${catSummary?' &nbsp;|&nbsp; '+catSummary:''}`;
}
function apriModificaUscita(id){
  const u=_uscite.find(x=>x.id===id);if(!u)return;_editingUscita=id;
  populateCategorieSelect('u-cat');
  document.getElementById('u-data').value=u.data||todayISO();document.getElementById('u-cat').value=u.categoria;
  document.getElementById('u-mese').value=u.mese||MESI[new Date().getMonth()];document.getElementById('u-desc').value=u.descrizione||'';
  document.getElementById('u-importo').value=u.importo;document.getElementById('u-fornitore').value=u.fornitore||'';
  document.getElementById('u-metodo').value=u.metodo||'Bonifico';document.getElementById('u-note').value=u.note||'';
  document.getElementById('modal-uscita-title').textContent='Modifica uscita';openModal('modal-uscita');
}
async function salvaUscita(){
  const importo=Number(document.getElementById('u-importo').value);if(!importo){toast('Inserisci importo');return;}
  const data={data:document.getElementById('u-data').value||todayISO(),categoria:document.getElementById('u-cat').value,
    mese:document.getElementById('u-mese').value,descrizione:document.getElementById('u-desc').value,importo,
    fornitore:document.getElementById('u-fornitore').value,metodo:document.getElementById('u-metodo').value,note:document.getElementById('u-note').value};
  let error;
  if(_editingUscita){({error}=await sb.from('uscite').update(data).eq('id',_editingUscita));}
  else{({error}=await sb.from('uscite').insert(data));}
  if(error){toast('Errore: '+error.message);return;}
  toast(_editingUscita?'Uscita aggiornata ✓':'Uscita salvata ✓');_editingUscita=null;
  document.getElementById('modal-uscita-title').textContent='Nuova uscita';closeModal('modal-uscita');await loadAll();renderUscite();
}
async function eliminaUscita(id){if(!confirm('Eliminare?'))return;await sb.from('uscite').delete().eq('id',id);await loadAll();renderUscite();}
function apriGestioneCategorie(){openModal('modal-categorie');renderListaCategorie();}
function renderListaCategorie(){
  document.getElementById('lista-categorie').innerHTML=CATEGORIE_USCITE.map((c,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
    <span>${c}</span><button class="btn btn-sm btn-icon" onclick="eliminaCategoria(${i})" ${CATEGORIE_USCITE.length<=1?'disabled':''}>✕</button></div>`).join('');
}
function aggiungiCategoria(){const input=document.getElementById('nuova-categoria');const nome=input.value.trim();if(!nome){toast('Inserisci un nome');return;}if(CATEGORIE_USCITE.includes(nome)){toast('Categoria già esistente');return;}CATEGORIE_USCITE.push(nome);saveCategorie();input.value='';renderListaCategorie();toast('Categoria aggiunta ✓');}
function eliminaCategoria(idx){if(CATEGORIE_USCITE.length<=1)return;if(!confirm(`Eliminare "${CATEGORIE_USCITE[idx]}"?`))return;CATEGORIE_USCITE.splice(idx,1);saveCategorie();renderListaCategorie();}

// ---- DIPENDENTI ----
function renderDipendentiList(){
  const cer=document.getElementById('fil-cerca-d').value.toLowerCase();
  const fil=_dipendenti.filter(d=>!cer||d.nome.toLowerCase().includes(cer)||(d.ruolo||'').toLowerCase().includes(cer));
  document.getElementById('dipendenti-grid').innerHTML=fil.length
    ?fil.map(d=>`<div class="dip-card" onclick="apriProfiloDipendente('${d.id}')">
      <div class="dip-avatar">${initials(d.nome)}</div>
      <div class="dip-nome">${d.nome}</div>
      <div class="dip-ruolo">${d.ruolo||'Nessun ruolo'}</div>
      <span class="badge badge-gray dip-badge">${d.tipo_contratto||'Dipendente'}</span>
    </div>`).join('')
    :`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-faint)">Nessun dipendente trovato</div>`;
}

function apriProfiloDipendente(id){
  const d=_dipendenti.find(x=>x.id===id);if(!d)return;
  document.getElementById('stipendi-list-view').style.display='none';
  document.getElementById('stipendi-profilo-view').style.display='block';

  const stipMesi=MESI.map(m=>{
    const rec=_stipendi.find(s=>s.dipendenti?.nome===d.nome&&s.tipo==='stipendio'&&s.mese===m);
    return {mese:m,val:rec?Number(rec.importo):0,id:rec?.id,dipId:d.id};
  });
  const bonusMesi=MESI.map(m=>{
    const rec=_stipendi.find(s=>s.dipendenti?.nome===d.nome&&s.tipo==='bonus'&&s.mese===m);
    return {mese:m,val:rec?Number(rec.importo):0,id:rec?.id,dipId:d.id};
  });
  const totStip=stipMesi.reduce((a,b)=>a+b.val,0);
  const totBonus=bonusMesi.reduce((a,b)=>a+b.val,0);

  document.getElementById('profilo-dipendente-content').innerHTML=`
    <div class="profilo-header">
      <div class="profilo-avatar">${initials(d.nome)}</div>
      <div>
        <div class="profilo-nome">${d.nome}</div>
        <div class="profilo-ruolo">${d.ruolo||'—'} · <span class="badge badge-gray" style="font-size:11px">${d.tipo_contratto||'Dipendente'}</span></div>
      </div>
      <div class="profilo-actions">
        <button class="btn" onclick="apriModificaDipendente('${d.id}')">✎ Modifica</button>
        <button class="btn" style="color:var(--red)" onclick="eliminaDipendente('${d.id}')">✕ Rimuovi</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:18px">
      <div class="kpi"><div class="kpi-label">Email</div><div style="font-size:13px;margin-top:4px">${d.email||'—'}</div></div>
      <div class="kpi"><div class="kpi-label">Telefono</div><div style="font-size:13px;margin-top:4px">${d.telefono||'—'}</div></div>
      <div class="kpi"><div class="kpi-label">Data assunzione</div><div style="font-size:13px;margin-top:4px">${d.data_assunzione?new Date(d.data_assunzione).toLocaleDateString('it-IT'):'—'}</div></div>
      <div class="kpi"><div class="kpi-label">IBAN</div><div style="font-size:12px;font-family:monospace;margin-top:4px">${d.iban||'—'}</div></div>
      <div class="kpi"><div class="kpi-label">Totale stipendi 2026</div><div class="kpi-value pos" style="font-size:18px">${fmt(totStip)}</div></div>
      <div class="kpi"><div class="kpi-label">Totale bonus 2026</div><div class="kpi-value" style="font-size:18px;color:var(--amber)">${fmt(totBonus)}</div></div>
    </div>

    <div class="card">
      <div class="card-header">Stipendi mensili 2026</div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px">
          ${stipMesi.map(({mese,val,id,dipId},i)=>`
            <div style="text-align:center">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${MESI_S[i]}</div>
              <input class="stipendi-input" type="number" value="${val||''}" placeholder="—"
                onchange="aggiornaStipendio('${dipId}','${d.nome}','stipendio','${mese}',this.value)"
                style="width:100%;text-align:center">
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Bonus mensili 2026</div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:6px">
          ${bonusMesi.map(({mese,val,id,dipId},i)=>`
            <div style="text-align:center">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${MESI_S[i]}</div>
              <input class="stipendi-input" type="number" value="${val||''}" placeholder="—"
                onchange="aggiornaStipendio('${dipId}','${d.nome}','bonus','${mese}',this.value)"
                style="width:100%;text-align:center">
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${d.note?`<div class="card"><div class="card-header">Note</div><div class="card-body" style="color:var(--text-muted)">${d.note}</div></div>`:''}
  `;
}

function chiudiProfiloDipendente(){
  document.getElementById('stipendi-list-view').style.display='block';
  document.getElementById('stipendi-profilo-view').style.display='none';
}

function apriModificaDipendente(id){
  const d=_dipendenti.find(x=>x.id===id);if(!d)return;_editingDip=id;
  document.getElementById('d-nome').value=d.nome;document.getElementById('d-ruolo').value=d.ruolo||'';
  document.getElementById('d-contratto').value=d.tipo_contratto||'Dipendente';
  document.getElementById('d-assunzione').value=d.data_assunzione||'';
  document.getElementById('d-email').value=d.email||'';document.getElementById('d-tel').value=d.telefono||'';
  document.getElementById('d-iban').value=d.iban||'';document.getElementById('d-note').value=d.note||'';
  document.getElementById('modal-dip-title').textContent='Modifica dipendente';openModal('modal-dipendente');
}

async function salvaDipendente(){
  const nome=document.getElementById('d-nome').value.trim();if(!nome)return;
  const data={nome,ruolo:document.getElementById('d-ruolo').value,tipo_contratto:document.getElementById('d-contratto').value,
    data_assunzione:document.getElementById('d-assunzione').value||null,
    email:document.getElementById('d-email').value,telefono:document.getElementById('d-tel').value,
    iban:document.getElementById('d-iban').value,note:document.getElementById('d-note').value};
  let error;
  if(_editingDip){({error}=await sb.from('dipendenti').update(data).eq('id',_editingDip));}
  else{({error}=await sb.from('dipendenti').insert(data));}
  if(error){toast('Errore: '+error.message);return;}
  toast(_editingDip?'Dipendente aggiornato ✓':'Dipendente aggiunto ✓');_editingDip=null;
  document.getElementById('modal-dip-title').textContent='Nuovo dipendente';
  closeModal('modal-dipendente');await loadAll();renderDipendentiList();
}

async function eliminaDipendente(id){
  if(!confirm('Eliminare questo dipendente? Verranno eliminati anche tutti i suoi stipendi.'))return;
  await sb.from('dipendenti').delete().eq('id',id);
  await loadAll();chiudiProfiloDipendente();renderDipendentiList();toast('Dipendente rimosso');
}

async function aggiornaStipendio(dipId,dipNome,tipo,mese,val){
  const importo=Number(val)||0;
  const rec=_stipendi.find(s=>s.dipendenti?.nome===dipNome&&s.tipo===tipo&&s.mese===mese);
  if(rec)await sb.from('stipendi').update({importo}).eq('id',rec.id);
  else await sb.from('stipendi').insert({dipendente_id:dipId,tipo,mese,anno:2026,importo});
  await loadAll();
}

// ---- CLIENTI ----
function statoPagementiCliente(clienteId){
  const oggi=new Date();const meseCorrente=MESI[oggi.getMonth()];
  const mesiPassati=MESI.slice(0,oggi.getMonth());
  const pags=_pagamenti.filter(p=>p.cliente_id===clienteId);
  const contratto=_contratti.find(c=>c.cliente_id===clienteId);
  if(!contratto||!contratto.canone_mensile)return null;
  let nonPagati=0,ritardo=0;
  mesiPassati.forEach(m=>{
    const p=pags.find(x=>x.mese===m);
    if(!p||p.stato==='nonpagato')nonPagati++;
    else if(p.stato==='ritardo')ritardo++;
  });
  if(nonPagati>=2)return'irregolare';
  if(nonPagati>=1||ritardo>=1)return'attenzione';
  return'regolare';
}

function badgeStatoCliente(stato){
  if(stato==='regolare')return'<span class="badge badge-regolare">✓ In regola</span>';
  if(stato==='irregolare')return'<span class="badge badge-irregolare">✕ Irregolare</span>';
  if(stato==='attenzione')return'<span class="badge badge-attenzione">⚠ Attenzione</span>';
  return'<span class="badge badge-gray">— Nessun contratto</span>';
}

function miniPagamentiBar(clienteId){
  const pags=_pagamenti.filter(p=>p.cliente_id===clienteId);
  const oggi=new Date();
  return MESI.map((m,i)=>{
    const p=pags.find(x=>x.mese===m);
    const futuro=i>oggi.getMonth();
    let cls='attesa',symbol='·';
    if(p){
      if(p.stato==='pagato'){cls='pagato';symbol='✓';}
      else if(p.stato==='nonpagato'){cls='nonpagato';symbol='✕';}
      else if(p.stato==='ritardo'){cls='ritardo';symbol='!';}
    }else if(futuro){cls='attesa';symbol='·';}
    return `<span title="${m}" style="display:inline-block;width:18px;height:18px;border-radius:3px;text-align:center;line-height:18px;font-size:9px;font-weight:700;cursor:pointer;margin:1px"
      class="pag-mini-${cls}" onclick="apriProfiloCliente('${clienteId}')">${symbol}</span>`;
  }).join('');
}

function renderClienti(){
  const cer=document.getElementById('fil-cerca-c').value.toLowerCase();
  const tipo=document.getElementById('fil-tipo-c').value;
  const statoFil=document.getElementById('fil-stato-c').value;
  const fil=_clienti.filter(c=>{
    const stato=statoPagementiCliente(c.id);
    return(!tipo||c.tipo===tipo)&&(!cer||c.ragione_sociale.toLowerCase().includes(cer)||(c.referente||'').toLowerCase().includes(cer))&&(!statoFil||stato===statoFil);
  });
  document.getElementById('tb-clienti').innerHTML=fil.length
    ?fil.map(c=>{
      const contratto=_contratti.find(x=>x.cliente_id===c.id);
      const stato=statoPagementiCliente(c.id);
      return`<tr style="cursor:pointer" onclick="apriProfiloCliente('${c.id}')">
        <td style="font-weight:500">${c.ragione_sociale}</td>
        <td><span class="badge badge-gray">${c.tipo||'—'}</span></td>
        <td>${c.referente||'—'}</td>
        <td class="td-mono">${contratto?.canone_mensile?fmt(contratto.canone_mensile)+'/mese':'—'}</td>
        <td>${badgeStatoCliente(stato)}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:1px">${miniPagamentiBar(c.id)}</div></td>
        <td><button class="btn btn-sm btn-icon" onclick="event.stopPropagation();eliminaCliente('${c.id}')">✕</button></td>
      </tr>`;}).join('')
    :`<tr><td colspan="7" class="empty">Nessun cliente trovato</td></tr>`;
  document.getElementById('tot-clienti').textContent=`${fil.length} clienti`;

  // Inject mini colors style
  if(!document.getElementById('pag-mini-style')){
    const st=document.createElement('style');st.id='pag-mini-style';
    st.textContent='.pag-mini-pagato{background:var(--green-bg);color:var(--green)}.pag-mini-nonpagato{background:var(--red-bg);color:var(--red)}.pag-mini-ritardo{background:var(--amber-bg);color:var(--amber)}.pag-mini-attesa{background:var(--bg-hover);color:var(--text-faint)}';
    document.head.appendChild(st);
  }
}

function apriProfiloCliente(id){
  const c=_clienti.find(x=>x.id===id);if(!c)return;
  document.getElementById('clienti-list-view').style.display='none';
  document.getElementById('clienti-profilo-view').style.display='block';
  const contratto=_contratti.find(x=>x.cliente_id===id);
  const pags=_pagamenti.filter(p=>p.cliente_id===id);
  const stato=statoPagementiCliente(id);
  const oggi=new Date();

  const pagGrid=MESI.map((m,i)=>{
    const p=pags.find(x=>x.mese===m);
    const futuro=i>oggi.getMonth();
    const canone=contratto?.canone_mensile||0;
    const importo=p?.importo??canone;
    let cls='attesa',label='—';
    if(p){if(p.stato==='pagato'){cls='pagato';label='✓';}else if(p.stato==='nonpagato'){cls='nonpagato';label='✕';}else if(p.stato==='ritardo'){cls='ritardo';label='!';}else{cls='attesa';label='?';}}
    else if(futuro){cls='attesa';label='·';}
    return`<div class="pag-cell ${cls}" onclick="apriPagamentoModal('${id}','${m}','${importo}','${p?.stato||'attesa'}','${p?.id||''}','${c.ragione_sociale}')">
      <div class="pag-mese">${MESI_S[i]}</div>
      <div class="pag-val">${label}</div>
      ${importo&&!futuro?`<div style="font-size:9px;color:inherit;opacity:0.7">${fmtShort(importo)}</div>`:''}
    </div>`;
  }).join('');

  const totPagato=pags.filter(p=>p.stato==='pagato').reduce((a,b)=>a+Number(b.importo),0);

  document.getElementById('profilo-cliente-content').innerHTML=`
    <div class="profilo-header">
      <div class="profilo-avatar" style="background:var(--blue)">${initials(c.ragione_sociale)}</div>
      <div>
        <div class="profilo-nome">${c.ragione_sociale}</div>
        <div class="profilo-ruolo">${c.tipo||''} ${c.settore?'· '+c.settore:''} &nbsp; ${badgeStatoCliente(stato)}</div>
      </div>
      <div class="profilo-actions">
        <button class="btn" style="color:var(--red)" onclick="eliminaCliente('${c.id}')">✕ Rimuovi</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px">
      <div class="kpi"><div class="kpi-label">Canone mensile</div><div class="kpi-value" style="font-size:18px">${contratto?.canone_mensile?fmt(contratto.canone_mensile):'—'}</div></div>
      <div class="kpi"><div class="kpi-label">Incassato 2026</div><div class="kpi-value pos" style="font-size:18px">${fmt(totPagato)}</div></div>
      <div class="kpi"><div class="kpi-label">Referente</div><div style="font-size:13px;margin-top:4px">${c.referente||'—'}</div></div>
      <div class="kpi"><div class="kpi-label">Email / Tel</div><div style="font-size:12px;margin-top:4px">${c.email||'—'}<br>${c.telefono||''}</div></div>
    </div>

    <div class="card">
      <div class="card-header">Pagamenti 2026 — clicca su un mese per aggiornare lo stato</div>
      <div class="card-body">
        <div class="pagamenti-grid">${pagGrid}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="card"><div class="card-header">Dettagli contratto</div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">Inizio</span><span>${contratto?.data_inizio?new Date(contratto.data_inizio).toLocaleDateString('it-IT'):'—'}</span></div>
          <div class="stat-row"><span class="stat-label">Fine</span><span>${contratto?.data_fine?new Date(contratto.data_fine).toLocaleDateString('it-IT'):'—'}</span></div>
          <div class="stat-row"><span class="stat-label">Cond. pagamento</span><span>${c.condizioni_pagamento||'—'}</span></div>
          <div class="stat-row"><span class="stat-label">IBAN</span><span style="font-size:11px;font-family:monospace">${c.iban||'—'}</span></div>
        </div>
      </div>
      <div class="card"><div class="card-header">Contatti</div>
        <div class="card-body">
          <div class="stat-row"><span class="stat-label">P.IVA</span><span>${c.piva||'—'}</span></div>
          <div class="stat-row"><span class="stat-label">Indirizzo</span><span>${c.indirizzo||'—'}</span></div>
          <div class="stat-row"><span class="stat-label">Note</span><span style="color:var(--text-muted)">${c.note||'—'}</span></div>
        </div>
      </div>
    </div>
  `;
}

function chiudiProfiloCliente(){
  document.getElementById('clienti-list-view').style.display='block';
  document.getElementById('clienti-profilo-view').style.display='none';
  renderClienti();
}

let _pagModalData={};
function apriPagamentoModal(clienteId,mese,importo,statoAttuale,pagId,nomeCliente){
  _pagModalData={clienteId,mese,importo,statoAttuale,pagId};
  const html=`<div style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:300;display:flex;align-items:center;justify-content:center" onclick="this.remove()">
    <div style="background:var(--bg-card);border-radius:14px;border:1px solid var(--border);padding:24px;width:340px;box-shadow:0 8px 40px rgba(0,0,0,0.15)" onclick="event.stopPropagation()">
      <div style="font-size:15px;font-weight:600;margin-bottom:4px">${nomeCliente}</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">${mese} 2026</div>
      <div style="margin-bottom:14px">
        <label style="font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);display:block;margin-bottom:5px">Importo (€)</label>
        <input id="pag-importo" type="number" value="${importo||''}" placeholder="0" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:14px;background:var(--bg)">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button onclick="salvaPagamento('pagato');this.closest('[onclick]').remove()" style="padding:10px;border-radius:6px;border:none;background:var(--green-bg);color:var(--green);font-weight:600;cursor:pointer;font-family:inherit">✓ Pagato</button>
        <button onclick="salvaPagamento('nonpagato');this.closest('[onclick]').remove()" style="padding:10px;border-radius:6px;border:none;background:var(--red-bg);color:var(--red);font-weight:600;cursor:pointer;font-family:inherit">✕ Non pagato</button>
        <button onclick="salvaPagamento('ritardo');this.closest('[onclick]').remove()" style="padding:10px;border-radius:6px;border:none;background:var(--amber-bg);color:var(--amber);font-weight:600;cursor:pointer;font-family:inherit">! In ritardo</button>
        <button onclick="salvaPagamento('attesa');this.closest('[onclick]').remove()" style="padding:10px;border-radius:6px;border:none;background:var(--bg-hover);color:var(--text-muted);font-weight:600;cursor:pointer;font-family:inherit">· In attesa</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}

async function salvaPagamento(stato){
  const{clienteId,mese,pagId}=_pagModalData;
  const importo=Number(document.getElementById('pag-importo')?.value)||0;
  const data={cliente_id:clienteId,mese,anno:2026,stato,importo};
  if(pagId){await sb.from('pagamenti_clienti').update({stato,importo}).eq('id',pagId);}
  else{await sb.from('pagamenti_clienti').upsert(data,{onConflict:'cliente_id,mese,anno'});}
  await loadAll();
  // Refresh profilo
  apriProfiloCliente(clienteId);
  toast('Pagamento aggiornato ✓');
}

async function salvaCliente(){
  const ragione=document.getElementById('c-ragione').value.trim();if(!ragione){toast('Inserisci ragione sociale');return;}
  const {data:newCliente,error}=await sb.from('clienti').insert({
    ragione_sociale:ragione,tipo:document.getElementById('c-tipo').value,
    piva:document.getElementById('c-piva').value,
    referente:document.getElementById('c-referente').value,email:document.getElementById('c-email').value,
    telefono:document.getElementById('c-tel').value,settore:document.getElementById('c-settore').value,
    condizioni_pagamento:document.getElementById('c-pagamento').value,
    iban:document.getElementById('c-iban').value,indirizzo:document.getElementById('c-indirizzo').value,
    note:document.getElementById('c-note').value
  }).select().single();
  if(error){toast('Errore: '+error.message);return;}
  const canone=Number(document.getElementById('c-canone').value)||0;
  const inizio=document.getElementById('c-inizio').value;const fine=document.getElementById('c-fine').value;
  if(canone||inizio||fine){
    await sb.from('contratti_clienti').insert({cliente_id:newCliente.id,canone_mensile:canone,data_inizio:inizio||null,data_fine:fine||null});
  }
  toast('Cliente salvato ✓');closeModal('modal-cliente');await loadAll();renderClienti();
  ['c-ragione','c-piva','c-referente','c-email','c-tel','c-settore','c-iban','c-indirizzo','c-note','c-canone'].forEach(id=>document.getElementById(id).value='');
}

async function eliminaCliente(id){
  if(!confirm('Eliminare questo cliente e tutti i suoi dati?'))return;
  await sb.from('clienti').delete().eq('id',id);
  await loadAll();chiudiProfiloCliente();toast('Cliente eliminato');
}

// ---- SCADENZARIO ----
function renderScadenze(){
  const stato=document.getElementById('fil-stato-sc').value;const tipo=document.getElementById('fil-tipo-sc').value;
  const fil=_scadenze.filter(s=>(!stato||s.stato===stato)&&(!tipo||s.tipo===tipo));
  const imm=fil.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<=7&&daysDiff(s.data_scadenza)>=0);
  const scad=fil.filter(s=>s.stato==='In attesa'&&daysDiff(s.data_scadenza)<0);
  let alertHtml='';
  if(scad.length)alertHtml+=`<div class="alert-box" style="border-color:var(--red);color:var(--red);background:var(--red-bg);margin-bottom:12px">⚠️ <strong>${scad.length} scadenze già passate</strong></div>`;
  if(imm.length)alertHtml+=`<div class="alert-box" style="margin-bottom:12px">⏰ <strong>${imm.length} scadenze entro 7 giorni</strong></div>`;
  document.getElementById('scad-alert-box').innerHTML=alertHtml;
  document.getElementById('tb-scadenze').innerHTML=fil.length
    ?fil.map(s=>{
      const days=daysDiff(s.data_scadenza);
      const rowCls=s.stato==='In attesa'&&days<0?'scad-urgente':s.stato==='In attesa'&&days<=7?'scad-imminente':'';
      const dStr=new Date(s.data_scadenza).toLocaleDateString('it-IT');
      const daysTxt=s.stato==='In attesa'?(days<0?`<span style="color:var(--red);font-size:11px">${Math.abs(days)}gg fa</span>`:days===0?`<span style="color:var(--red);font-size:11px">Oggi!</span>`:`<span style="color:var(--amber);font-size:11px">tra ${days}gg</span>`):'';
      return`<tr class="${rowCls}"><td><div style="font-weight:500">${dStr}</div>${daysTxt}</td>
        <td><span class="badge ${s.tipo==='entrata'?'badge-green':'badge-red'}">${s.tipo==='entrata'?'↓ Entrata':'↑ Uscita'}</span></td>
        <td style="font-weight:500">${s.descrizione}</td><td style="color:var(--text-muted)">${s.clienti?.ragione_sociale||'—'}</td>
        <td class="td-mono td-right" style="font-weight:500">${fmt(s.importo)}</td><td>${badgeScad(s.stato)}</td>
        <td style="color:var(--text-muted);font-size:12px">${s.note||'—'}</td>
        <td style="display:flex;gap:4px">${s.stato==='In attesa'?`<button class="btn btn-sm" style="color:var(--green)" onclick="segnaScadenza('${s.id}','Pagato')">✓</button>`:''}
          <button class="btn btn-sm btn-icon" onclick="eliminaScadenza('${s.id}')">✕</button></td></tr>`;}).join('')
    :`<tr><td colspan="8" class="empty">Nessuna scadenza trovata</td></tr>`;
}
async function salvaScadenza(){
  const desc=document.getElementById('sc-desc').value.trim();const importo=Number(document.getElementById('sc-importo').value);const data=document.getElementById('sc-data').value;
  if(!desc||!importo||!data){toast('Inserisci descrizione, importo e data');return;}
  const {error}=await sb.from('scadenze').insert({tipo:document.getElementById('sc-tipo').value,descrizione:desc,importo,data_scadenza:data,stato:document.getElementById('sc-stato').value,cliente_id:document.getElementById('sc-cliente').value||null,note:document.getElementById('sc-note').value});
  if(error){toast('Errore: '+error.message);return;}
  toast('Scadenza salvata ✓');closeModal('modal-scadenza');await loadAll();renderScadenze();
}
async function segnaScadenza(id,stato){await sb.from('scadenze').update({stato}).eq('id',id);await loadAll();renderScadenze();toast(`Segnata come ${stato} ✓`);}
async function eliminaScadenza(id){if(!confirm('Eliminare?'))return;await sb.from('scadenze').delete().eq('id',id);await loadAll();renderScadenze();}

// ---- GOALS ----
function calcolaValoreAttuale(goal){
  const mese=goal.mese;
  switch(goal.tipo){
    case'fatturato':return _entrate.filter(e=>e.stato==='PAGATO'&&(!mese||e.mese===mese)).reduce((a,b)=>a+Number(b.importo),0);
    case'entrate_totali':return _entrate.filter(e=>!mese||e.mese===mese).reduce((a,b)=>a+Number(b.importo),0);
    case'clienti':return _clienti.length;
    case'dipendenti':return _dipendenti.length;
    case'uscite':return _uscite.filter(u=>!mese||u.mese===mese).reduce((a,b)=>a+Number(b.importo),0);
    case'custom':return Number(goal.valore_attuale_custom)||0;
    default:return 0;
  }
}
function fmtGoalVal(val,unita){if(unita==='euro')return'€'+Math.round(val).toLocaleString('it-IT');if(unita==='percentuale')return Math.round(val)+'%';return Math.round(val).toLocaleString('it-IT');}
function renderGoals(){
  const periodo=document.getElementById('fil-periodo-g').value;const mese=document.getElementById('fil-mese-g').value;
  const fil=_goals.filter(g=>(!periodo||g.periodo===periodo)&&(!mese||g.mese===mese||g.periodo==='annuale'));
  if(!fil.length){document.getElementById('goals-grid').innerHTML=`<div class="goals-empty"><div class="emoji">🎯</div><div>Nessun obiettivo impostato</div><div style="margin-top:6px;font-size:12px">Clicca "+ Nuovo obiettivo" per iniziare</div></div>`;return;}
  document.getElementById('goals-grid').innerHTML=fil.map(g=>{
    const attuale=calcolaValoreAttuale(g);const obiettivo=Number(g.valore_obiettivo);
    const pct=obiettivo>0?Math.min(100,Math.round((attuale/obiettivo)*100)):0;
    const raggiunto=pct>=100;const quasi=pct>=75&&!raggiunto;
    const statusTxt=raggiunto?'🎉 Obiettivo raggiunto!':quasi?`Manca ${fmtGoalVal(obiettivo-attuale,g.unita)}`:`${fmtGoalVal(obiettivo-attuale,g.unita)} al traguardo`;
    const statusCls=raggiunto?'raggiunto':quasi?'quasi':'';
    const periodoLabel=g.periodo==='mensile'&&g.mese?`${g.mese} 2026`:'Annuale 2026';
    return`<div class="goal-card" style="--goal-color:${g.colore||'#1A1A18'}">
      <div class="goal-header"><div class="goal-nome">${g.nome}</div>
        <div class="goal-actions"><button class="btn btn-sm btn-icon" onclick="apriModificaGoal('${g.id}')">✎</button><button class="btn btn-sm btn-icon" onclick="eliminaGoal('${g.id}')">✕</button></div>
      </div>
      ${g.descrizione?`<div class="goal-desc">${g.descrizione}</div>`:''}
      <div class="goal-periodo">${periodoLabel}</div>
      <div class="goal-values"><div class="goal-current">${fmtGoalVal(attuale,g.unita)}</div><div class="goal-target">/ ${fmtGoalVal(obiettivo,g.unita)}</div><div class="goal-pct">${pct}%</div></div>
      <div class="goal-bar-wrap"><div class="goal-bar-fill" style="width:${Math.min(100,pct)}%"></div></div>
      <div class="goal-status ${statusCls}">${statusTxt}</div>
    </div>`;
  }).join('');
}
function toggleMeseGoal(){const p=document.getElementById('g-periodo').value;document.getElementById('g-mese-wrap').style.display=p==='mensile'?'block':'none';}
function aggiornaUnitaGoal(){const t=document.getElementById('g-tipo').value;const u=document.getElementById('g-unita');const cw=document.getElementById('g-custom-wrap');if(['clienti','dipendenti'].includes(t))u.value='numero';else if(t==='custom')u.value='numero';else u.value='euro';cw.style.display=t==='custom'?'block':'none';}
function apriModificaGoal(id){const g=_goals.find(x=>x.id===id);if(!g)return;_editingGoal=id;document.getElementById('g-nome').value=g.nome;document.getElementById('g-desc').value=g.descrizione||'';document.getElementById('g-tipo').value=g.tipo;document.getElementById('g-unita').value=g.unita;document.getElementById('g-valore').value=g.valore_obiettivo;document.getElementById('g-colore').value=g.colore||'#1A1A18';document.getElementById('g-periodo').value=g.periodo;document.getElementById('g-mese').value=g.mese||'';document.getElementById('g-attuale').value=g.valore_attuale_custom||'';toggleMeseGoal();aggiornaUnitaGoal();document.getElementById('modal-goal-title').textContent='Modifica obiettivo';openModal('modal-goal');}
async function salvaGoal(){
  const nome=document.getElementById('g-nome').value.trim();const valore=Number(document.getElementById('g-valore').value);
  if(!nome||!valore){toast('Inserisci nome e valore obiettivo');return;}
  const tipo=document.getElementById('g-tipo').value;const periodo=document.getElementById('g-periodo').value;
  const data={nome,descrizione:document.getElementById('g-desc').value,tipo,unita:document.getElementById('g-unita').value,valore_obiettivo:valore,colore:document.getElementById('g-colore').value,periodo,mese:periodo==='mensile'?document.getElementById('g-mese').value:null,anno:2026,valore_attuale_custom:tipo==='custom'?Number(document.getElementById('g-attuale').value)||0:null};
  let error;
  if(_editingGoal){({error}=await sb.from('goals').update(data).eq('id',_editingGoal));}
  else{({error}=await sb.from('goals').insert(data));}
  if(error){toast('Errore: '+error.message);return;}
  toast(_editingGoal?'Obiettivo aggiornato ✓':'Obiettivo salvato ✓');_editingGoal=null;
  document.getElementById('modal-goal-title').textContent='Nuovo obiettivo';closeModal('modal-goal');await loadAll();renderGoals();
  ['g-nome','g-desc','g-valore','g-attuale'].forEach(id=>document.getElementById(id).value='');
}
async function eliminaGoal(id){if(!confirm('Eliminare?'))return;await sb.from('goals').delete().eq('id',id);await loadAll();renderGoals();}

// ---- EXPORT ----
function esportaCSV(){
  let csv='ENTRATE\nCliente,Mese,Importo,Stato,Note\n';
  _entrate.forEach(e=>csv+=`"${e.cliente}","${e.mese}",${e.importo},"${e.stato}","${e.note||''}"\n`);
  csv+='\nUSCITE\nData,Categoria,Mese,Descrizione,Importo,Fornitore,Metodo\n';
  _uscite.forEach(u=>csv+=`"${u.data||''}","${u.categoria}","${u.mese||''}","${u.descrizione||''}",${u.importo},"${u.fornitore||''}","${u.metodo||''}"\n`);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gestionale_2026.csv';a.click();toast('Export avviato ✓');
}

// ---- MODALS ----
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='modal-uscita'&&!_editingUscita){document.getElementById('u-data').value=todayISO();populateCategorieSelect('u-cat');}
  if(id==='modal-scadenza'){const sel=document.getElementById('sc-cliente');sel.innerHTML='<option value="">— Nessuno —</option>'+_clienti.map(c=>`<option value="${c.id}">${c.ragione_sociale}</option>`).join('');}
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  if(id==='modal-entrata'){_editingEntrata=null;document.getElementById('modal-entrata-title').textContent='Nuova entrata';}
  if(id==='modal-uscita'){_editingUscita=null;document.getElementById('modal-uscita-title').textContent='Nuova uscita';}
  if(id==='modal-dipendente'){_editingDip=null;document.getElementById('modal-dip-title').textContent='Nuovo dipendente';}
}
document.querySelectorAll('.modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});});

function populateMesi(){
  ['e-mese','u-mese','g-mese','fil-mese-e','fil-mese-u','fil-mese-g'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=(id.startsWith('fil')?'<option value="">Tutti i mesi</option>':'')+MESI.map(m=>`<option>${m}</option>`).join('');
  });
}

populateMesi();
init();
