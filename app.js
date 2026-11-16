/* SawahTrack MVP. Supabase project settings are in config.js. */
const cfg = window.SAWAHTRACK_CONFIG || {};
const supabaseReady = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("PROJECT-ID") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("ISI_");
const sb = supabaseReady ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
let currentUser = null, profile = null, workspaceId = null, map = null, drawnLayer = null, drawGroup = null;
let owners = [], fields = [], jobs = [], payments = [], expenses = [];
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
const num = n => new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
function msg(id,text){$(id).textContent=text||''}
function requireDb(){if(!sb){alert('Hubungkan Supabase terlebih dahulu. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di config.js.');return false}return true}
function showAuth(){ $('authView').classList.remove('hidden');$('appView').classList.add('hidden') }
function showApp(){ $('authView').classList.add('hidden');$('appView').classList.remove('hidden');$('userEmail').textContent=currentUser.email;$('rolePill').textContent=(profile?.role||'operator').toUpperCase(); }
function navigate(page){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(page+'Page').classList.remove('hidden');document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('pageTitle').textContent=({dashboard:'Dashboard',owners:'Pemilik Sawah',fields:'Petakan & Peta',jobs:'Pekerjaan',finance:'Keuangan',team:'Tim & Akses'})[page];if(page==='fields'&&!map){setTimeout(initMap,100)}}
async function loadProfile(){const {data,error}=await sb.from('profiles').select('*').eq('id',currentUser.id).single();if(error)throw error;profile=data}
async function loadAll(){
  const [o,f,j,p,e]=await Promise.all([
    sb.from('owners').select('*').order('name'),
    sb.from('fields').select('*, owners(name)').order('field_name'),
    sb.from('jobs').select('*, job_fields(boxes_snapshot,subtotal,fields(field_name)), machines(name)').order('job_date',{ascending:false}),
    sb.from('payments').select('*').order('payment_date',{ascending:false}),
    sb.from('expenses').select('*').order('expense_date',{ascending:false})
  ]);
  for(const r of [o,f,j,p,e])if(r.error)throw r.error;
  owners=o.data||[];fields=f.data||[];jobs=j.data||[];payments=p.data||[];expenses=e.data||[];
  renderAll();
}
function renderAll(){
  $('statOwners').textContent=owners.length;$('statFields').textContent=fields.length;
  $('statBoxes').textContent=num(fields.reduce((s,f)=>s+Number(f.local_boxes||0),0));
  $('statJobs').textContent=jobs.filter(j=>j.status==='selesai').length;
  $('ownersTable').innerHTML=owners.map(o=>`<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.phone||'-')}</td><td>${esc([o.village,o.address].filter(Boolean).join(' · ')||'-')}</td><td><button data-edit-owner="${o.id}">Edit</button></td></tr>`).join('')||emptyRow(4,'Belum ada pemilik');
  $('fieldOwner').innerHTML='<option value="">Pilih pemilik</option>'+owners.map(o=>`<option value="${o.id}">${esc(o.name)}</option>`).join('');
  $('fieldsTable').innerHTML=fields.map(f=>`<tr><td><b>${esc(f.field_name)}</b></td><td>${esc(f.owners?.name||'-')}</td><td>${num(f.local_boxes)}</td><td>${num(f.area_m2)} m²</td><td><button data-edit-field="${f.id}">Edit</button></td></tr>`).join('')||emptyRow(5,'Belum ada petakan');
  $('jobFields').innerHTML=fields.map(f=>`<option value="${f.id}">${esc(f.field_name)} — ${esc(f.owners?.name||'')}</option>`).join('');
  $('jobsTable').innerHTML=jobs.map(j=>`<tr><td>${esc(j.job_date)}</td><td>${esc(j.job_type)}</td><td>${(j.job_fields||[]).map(x=>esc(x.fields?.field_name||'')).join(', ')}</td><td>${num(j.total_boxes)}</td><td>${fmt(j.gross_amount)}</td><td>${esc(j.status)}</td></tr>`).join('')||emptyRow(6,'Belum ada pekerjaan');
  $('paymentJob').innerHTML='<option value="">Pilih pekerjaan</option>'+jobs.map(j=>`<option value="${j.id}">${j.job_date} · ${j.job_type} · ${fmt(j.gross_amount)}</option>`).join('');
  const gross=jobs.reduce((s,j)=>s+Number(j.gross_amount||0),0),paid=payments.reduce((s,p)=>s+Number(p.amount||0),0),expense=expenses.reduce((s,e)=>s+Number(e.amount||0),0);
  $('financeGross').textContent=fmt(gross);$('financePaid').textContent=fmt(paid);$('financeExpense').textContent=fmt(expense);$('financeNet').textContent=fmt(paid-expense);
  $('financeList').innerHTML=[...payments.map(x=>({date:x.payment_date,label:'Pembayaran pekerjaan',amount:x.amount})),...expenses.map(x=>({date:x.expense_date,label:x.expense_type+' · '+(x.description||''),amount:-Number(x.amount)}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(x=>`<div class="list-row"><div>${esc(x.label)}<small>${esc(x.date)}</small></div><b>${fmt(x.amount)}</b></div>`).join('')||'<p class="muted">Belum ada transaksi.</p>';
  if(map)renderFieldPolygons();
}
function emptyRow(n,t){return `<tr><td colspan="${n}" class="muted">${t}</td></tr>`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function saveOwner(e){e.preventDefault();const id=$('ownerId').value;const payload={workspace_id:workspaceId,name:$('ownerName').value.trim(),phone:$('ownerPhone').value.trim(),village:$('ownerVillage').value.trim(),address:$('ownerAddress').value.trim(),notes:$('ownerNotes').value.trim()};const q=id?sb.from('owners').update(payload).eq('id',id):sb.from('owners').insert(payload);const {error}=await q;if(error)return alert(error.message);$('ownerForm').classList.add('hidden');$('ownerForm').reset();$('ownerId').value='';await loadAll()}
function editOwner(id){const o=owners.find(x=>x.id===id);if(!o)return;$('ownerId').value=o.id;$('ownerName').value=o.name;$('ownerPhone').value=o.phone||'';$('ownerVillage').value=o.village||'';$('ownerAddress').value=o.address||'';$('ownerNotes').value=o.notes||'';$('ownerForm').classList.remove('hidden');$('ownerForm').scrollIntoView({behavior:'smooth'})}
function initMap(){
  if(map)return;
  map=L.map('map').setView([-6.75,111.15],13);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri'}).addTo(map);
  drawGroup=new L.FeatureGroup();map.addLayer(drawGroup);
  const drawControl=new L.Control.Draw({draw:{polygon:{allowIntersection:false,showArea:true},rectangle:false,circle:false,circlemarker:false,marker:false,polyline:false},edit:{featureGroup:drawGroup}});
  map.addControl(drawControl);
  map.on(L.Draw.Event.CREATED,e=>{drawGroup.clearLayers();drawGroup.addLayer(e.layer);drawnLayer=e.layer;const geo=e.layer.toGeoJSON();const area=L.GeometryUtil?L.GeometryUtil.geodesicArea(e.layer.getLatLngs()[0]):null;if(area)$('fieldArea').value=(area).toFixed(2);else $('fieldArea').placeholder='Masukkan luas manual jika perlu';});
  renderFieldPolygons();
  setTimeout(()=>map.invalidateSize(),200);
}
function renderFieldPolygons(){if(!map||!drawGroup)return;drawGroup.clearLayers();fields.forEach(f=>{if(f.boundary_geojson){try{const layer=L.geoJSON(f.boundary_geojson,{style:{color:'#e7c56e',weight:2,fillOpacity:.15}}).bindPopup(`<b>${esc(f.field_name)}</b><br>${esc(f.owners?.name||'')}<br>${num(f.local_boxes)} kotak · ${num(f.area_m2)} m²`);layer.addTo(map)}catch(_){}}});}
async function saveField(e){
 e.preventDefault();const ownerId=$('fieldOwner').value;if(!ownerId)return msg('fieldMessage','Pilih pemilik sawah.');
 const polygon=drawnLayer?drawnLayer.toGeoJSON():null;
 const payload={workspace_id:workspaceId,owner_id:ownerId,field_name:$('fieldName').value.trim(),local_boxes:Number($('fieldBoxes').value||0),area_m2:Number($('fieldArea').value||0),plow_rate_per_box:Number($('fieldPlowRate').value||0),combine_rate_per_box:Number($('fieldCombineRate').value||0),notes:$('fieldNotes').value.trim(),boundary_geojson:polygon?.geometry||null};
 const id=$('fieldId').value;const q=id?sb.from('fields').update(payload).eq('id',id):sb.from('fields').insert(payload).select('id').single();
 const {data,error}=await q;if(error)return msg('fieldMessage',error.message);
 $('fieldForm').reset();$('fieldId').value='';drawGroup?.clearLayers();drawnLayer=null;msg('fieldMessage','Petakan berhasil disimpan.');await loadAll();
}
function editField(id){const f=fields.find(x=>x.id===id);if(!f)return;navigate('fields');$('fieldId').value=f.id;$('fieldOwner').value=f.owner_id;$('fieldName').value=f.field_name;$('fieldBoxes').value=f.local_boxes;$('fieldArea').value=f.area_m2;$('fieldPlowRate').value=f.plow_rate_per_box||'';$('fieldCombineRate').value=f.combine_rate_per_box||'';$('fieldNotes').value=f.notes||'';if(f.boundary_geojson){drawGroup.clearLayers();drawnLayer=L.geoJSON(f.boundary_geojson).getLayers()[0];drawGroup.addLayer(drawnLayer);map.fitBounds(drawnLayer.getBounds())}}
async function saveJob(e){
 e.preventDefault();const selected=[...$('jobFields').selectedOptions].map(x=>x.value);if(!selected.length)return alert('Pilih minimal satu petakan.');
 const chosen=fields.filter(f=>selected.includes(f.id));const type=$('jobType').value;let totalBoxes=chosen.reduce((s,f)=>s+Number(f.local_boxes||0),0),totalArea=chosen.reduce((s,f)=>s+Number(f.area_m2||0),0);
 const rate=Number($('jobRate').value||0);const gross=chosen.reduce((s,f)=>s+Number((type==='bajak'?f.plow_rate_per_box:f.combine_rate_per_box)||rate)*Number(f.local_boxes||0),0);
 const {data:job,error}=await sb.from('jobs').insert({workspace_id:workspaceId,job_type:type,job_date:$('jobDate').value,season_name:$('jobSeason').value,machine_name:$('jobMachine').value,status:$('jobStatus').value,total_boxes:totalBoxes,total_area_m2:totalArea,gross_amount:gross,notes:$('jobNotes').value}).select().single();
 if(error)return alert(error.message);
 const rows=chosen.map(f=>({workspace_id:workspaceId,job_id:job.id,field_id:f.id,boxes_snapshot:f.local_boxes,area_snapshot_m2:f.area_m2,rate_per_box:Number((type==='bajak'?f.plow_rate_per_box:f.combine_rate_per_box)||rate),subtotal:Number((type==='bajak'?f.plow_rate_per_box:f.combine_rate_per_box)||rate)*Number(f.local_boxes||0)}));
 const r=await sb.from('job_fields').insert(rows);if(r.error)alert('Pekerjaan tersimpan, tetapi detail petakan gagal: '+r.error.message);
 $('jobForm').reset();$('jobDate').value=today();await loadAll();
}
async function savePayment(e){e.preventDefault();const {error}=await sb.from('payments').insert({workspace_id:workspaceId,job_id:$('paymentJob').value,amount:Number($('paymentAmount').value),payment_date:$('paymentDate').value,status:'paid'});if(error)return alert(error.message);$('paymentForm').reset();$('paymentDate').value=today();await loadAll()}
async function saveExpense(e){e.preventDefault();const amount=Number($('expenseAmount').value),type=$('expenseType').value;const {data,error}=await sb.from('expenses').insert({workspace_id:workspaceId,expense_type:type,amount,expense_date:$('expenseDate').value,description:$('expenseDescription').value}).select().single();if(error)return alert(error.message);const liters=Number($('fuelLiters').value||0);if(type==='Solar'&&liters>0){const machine=await sb.from('machines').select('id').limit(1).maybeSingle();if(machine.data)await sb.from('fuel_logs').insert({workspace_id:workspaceId,machine_id:machine.data.id,expense_id:data.id,fuel_date:$('expenseDate').value,liters,price_per_liter:amount/liters,total_cost:amount})}$('expenseForm').reset();$('expenseDate').value=today();await loadAll()}
async function startApp(){if(!requireDb())return;try{const {data:{session}}=await sb.auth.getSession();if(!session){showAuth();return}currentUser=session.user;workspaceId=session.user.id;await loadProfile();showApp();await loadAll()}catch(e){console.error(e);showAuth();msg('authMessage',e.message)}}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireDb())return;const {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});if(error)return msg('authMessage',error.message);startApp()});
$('showSignup').onclick=()=>$('signupDialog').showModal();$('closeSignup').onclick=()=>$('signupDialog').close();
$('signupForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireDb())return;const {data,error}=await sb.auth.signUp({email:$('signupEmail').value,password:$('signupPassword').value,options:{data:{full_name:$('signupName').value}}});if(error)return msg('signupMessage',error.message);msg('signupMessage','Pendaftaran berhasil. Periksa email jika konfirmasi email diaktifkan.');});
$('logoutBtn').onclick=async()=>{await sb.auth.signOut();currentUser=null;showAuth()};
$('addOwnerBtn').onclick=()=>{$('ownerForm').reset();$('ownerId').value='';$('ownerForm').classList.remove('hidden')};
$('ownerForm').addEventListener('submit',saveOwner);$('fieldForm').addEventListener('submit',saveField);$('jobForm').addEventListener('submit',saveJob);$('paymentForm').addEventListener('submit',savePayment);$('expenseForm').addEventListener('submit',saveExpense);
$('addFieldBtn').onclick=()=>{navigate('fields');$('fieldForm').reset();$('fieldId').value='';drawGroup?.clearLayers();drawnLayer=null};
$('clearPolygonBtn').onclick=()=>{drawGroup?.clearLayers();drawnLayer=null};
$('jobDate').value=today();$('paymentDate').value=today();$('expenseDate').value=today();
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
document.addEventListener('click',e=>{const o=e.target.closest('[data-edit-owner]');if(o)editOwner(o.dataset.editOwner);const f=e.target.closest('[data-edit-field]');if(f)editField(f.dataset.editField);const c=e.target.closest('[data-cancel]');if(c)$(c.dataset.cancel).classList.add('hidden')});
$('ownerSearch').addEventListener('input',()=>{const q=$('ownerSearch').value.toLowerCase();document.querySelectorAll('#ownersTable tr').forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none')});
$('refreshBtn').onclick=()=>loadAll().catch(e=>alert(e.message));
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
if(sb)startApp();else{showAuth();msg('authMessage','Konfigurasi Supabase belum diisi.')}
