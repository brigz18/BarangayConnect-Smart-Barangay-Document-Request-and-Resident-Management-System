/* ============================= DATA LAYER ============================= */
const DOC_TYPES = ["Barangay Clearance","Certificate of Residency","Certificate of Indigency","Business Clearance","Certificate of Good Moral Character","First Time Job Seeker Certificate"];
const STATUS_FLOW = ["Pending","Under Review","Approved","Ready for Pickup","Completed"];
const STATUS_BADGE = {Pending:"badge-pending","Under Review":"badge-review",Approved:"badge-approved","Ready for Pickup":"badge-ready",Completed:"badge-completed",Rejected:"badge-rejected"};

let DB = { users:[], residents:[], requests:[], appointments:[], payments:[], auditlog:[] };
let session = null; // {role, name, residentId}
let currentTab = "home";
let staffSub = "requests";
let adminSub = "users";

function pad(n){return n.toString().padStart(4,"0");}
function genId(prefix){ return prefix + "-" + new Date().getFullYear() + "-" + pad(Math.floor(Math.random()*9000)+100); }
function nowStr(){ return new Date().toLocaleString('en-PH',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }

async function loadKey(key, fallback){
  try{
    const r = await window.storage.get(key, true);
    return r ? JSON.parse(r.value) : fallback;
  }catch(e){ return fallback; }
}
async function saveKey(key, val){
  try{ await window.storage.set(key, JSON.stringify(val), true); }catch(e){ console.error("storage save failed", key, e); }
}
function audit(action, detail){
  DB.auditlog.unshift({time:nowStr(), action, detail});
  DB.auditlog = DB.auditlog.slice(0,80);
  saveKey('auditlog', DB.auditlog);
}

async function loadAll(){
  DB.users = await loadKey('users', null);
  DB.residents = await loadKey('residents', null);
  DB.requests = await loadKey('requests', null);
  DB.appointments = await loadKey('appointments', null);
  DB.payments = await loadKey('payments', null);
  DB.auditlog = await loadKey('auditlog', null);

  if(!DB.users){
    DB.users = [
      {id:"U-0001", name:"Maria Santos", email:"maria.santos@example.ph", role:"Resident"},
      {id:"U-0002", name:"Rosario Dizon", email:"rosario.dizon@barangay.gov.ph", role:"Staff"},
      {id:"U-0003", name:"Herminia Cruz", email:"herminia.cruz@barangay.gov.ph", role:"Secretary"},
      {id:"U-0004", name:"Ederic Villanueva", email:"ederic.v@barangay.gov.ph", role:"Administrator"},
    ];
    await saveKey('users', DB.users);
  }
  if(!DB.residents){
    DB.residents = [
      {id:"R-0001", userId:"U-0001", fullname:"Maria Santos", address:"12 Sampaguita St., Purok 3", birthdate:"1990-04-12", civilStatus:"Married", occupation:"Seamstress", contact:"0917-555-0142", household:"HH-0231", archived:false},
      {id:"R-0002", userId:null, fullname:"Jonalyn Reyes", address:"45 Ilang-Ilang St., Purok 1", birthdate:"1998-11-02", civilStatus:"Single", occupation:"Student", contact:"0917-555-0288", household:"HH-0118", archived:false},
    ];
    await saveKey('residents', DB.residents);
  }
  if(!DB.requests){
    DB.requests = [
      {id:"BC-2026-3841", residentId:"R-0001", residentName:"Maria Santos", type:"Barangay Clearance", purpose:"Local employment requirement", status:"Approved", dateRequested:"Jul 08, 2026, 09:14 AM", history:["Pending","Under Review","Approved"]},
      {id:"BC-2026-3902", residentId:"R-0002", residentName:"Jonalyn Reyes", type:"Certificate of Indigency", purpose:"Medical assistance application", status:"Pending", dateRequested:"Jul 11, 2026, 03:40 PM", history:["Pending"]},
    ];
    await saveKey('requests', DB.requests);
  }
  if(!DB.appointments){
    DB.appointments = [
      {id:"APT-2026-118", residentId:"R-0001", residentName:"Maria Santos", date:"2026-07-15", time:"10:00 AM", status:"Confirmed"},
    ];
    await saveKey('appointments', DB.appointments);
  }
  if(!DB.payments){
    DB.payments = [
      {id:"PAY-2026-0091", requestId:"BC-2026-3841", amount:60, status:"Paid"},
      {id:"PAY-2026-0092", requestId:"BC-2026-3902", amount:40, status:"Unpaid"},
    ];
    await saveKey('payments', DB.payments);
  }
  if(!DB.auditlog){
    DB.auditlog = [{time:nowStr(), action:"System initialized", detail:"Demo data seeded"}];
    await saveKey('auditlog', DB.auditlog);
  }
}

/* ============================= RENDER HELPERS ============================= */
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
function toast(msg){
  const t = el(`<div class="toast">${msg}</div>`);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 3200);
}
function stepperHtml(status){
  if(status==="Rejected"){
    return `<div class="badge badge-rejected" style="margin-top:8px;">Rejected</div>`;
  }
  const idx = STATUS_FLOW.indexOf(status);
  return `<div class="stepper">${STATUS_FLOW.map((s,i)=>{
    const cls = i<idx?"done":(i===idx?"current":"");
    return `<div class="step ${cls}"><div class="dot"></div><div class="lbl">${s}</div></div>`;
  }).join("")}</div>`;
}
function badgeHtml(status){ return `<span class="badge ${STATUS_BADGE[status]||'badge-pending'}">${status}</span>`; }

/* ============================= APP SHELL ============================= */
function renderApp(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <div class="topbar-row">
        <div class="brand">
          <div class="seal">BC</div>
          <div class="brand-text">
            <p class="eyebrow">Barangay Services · Digital Platform</p>
            <h1>BarangayConnect</h1>
          </div>
        </div>
        ${session ? `<div class="session-pill">Signed in as <strong>&nbsp;${session.name}</strong>&nbsp;(${session.role}) <button onclick="signOut()">Sign out</button></div>` : ``}
      </div>
      <nav class="tabs" id="tabs">
        ${tabBtn('home','Home')}
        ${tabBtn('resident','Resident Portal')}
        ${tabBtn('staff','Staff Portal')}
        ${tabBtn('admin','Administration')}
      </nav>
    </div>
    <main id="main"></main>
    <footer>BarangayConnect prototype — demo data only, no real accounts or documents are created. Built to illustrate the BarangayConnect PRD.</footer>
  `;
  renderMain();
}
function tabBtn(id,label){ return `<button class="${currentTab===id?'active':''}" onclick="goTab('${id}')">${label}</button>`; }
function goTab(id){ currentTab=id; renderApp(); window.scrollTo({top:0,behavior:'smooth'}); }
function signOut(){ session=null; currentTab='home'; renderApp(); }

function renderMain(){
  const main = document.getElementById('main');
  if(currentTab==='home') return main.innerHTML = homeView();
  if(currentTab==='resident') return renderResident(main);
  if(currentTab==='staff') return renderStaffGate(main);
  if(currentTab==='admin') return renderAdminGate(main);
}

/* ============================= HOME ============================= */
function homeView(){
  const pending = DB.requests.filter(r=>r.status==='Pending').length;
  const completed = DB.requests.filter(r=>r.status==='Completed').length;
  return `
  <section class="hero">
    <div>
      <p class="eyebrow">No more waiting in line at the barangay hall</p>
      <h2>Request barangay documents, track them, and pick a time — all online.</h2>
      <p>BarangayConnect lets residents request clearances and certificates, book an appointment, and follow their request from submission to release. Staff process everything from one queue, with every document sealed with a verifiable QR code.</p>
      <div class="hero-actions">
        <button class="btn btn-primary" onclick="goTab('resident')">Request a document</button>
        <button class="btn btn-outline" onclick="goTab('staff')">Staff sign in</button>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-grid">
        <div><div class="stat-num">${DB.residents.filter(r=>!r.archived).length}</div><div class="stat-label">Registered residents</div></div>
        <div><div class="stat-num">${DB.requests.length}</div><div class="stat-label">Total requests</div></div>
        <div><div class="stat-num">${pending}</div><div class="stat-label">Awaiting action</div></div>
        <div><div class="stat-num">${completed}</div><div class="stat-label">Completed</div></div>
      </div>
    </div>
  </section>

  <div class="grid-3">
    <div class="card">
      <div class="stamp" style="margin-bottom:14px;">Verified<br>Original</div>
      <h3 style="margin:0 0 8px 0;font-size:17px;">QR-verified documents</h3>
      <p style="color:var(--slate);font-size:14px;line-height:1.6;margin:0;">Every released certificate carries a unique ID and QR code so anyone can confirm it was issued by the barangay.</p>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px 0;font-size:17px;">Six document types</h3>
      <p style="color:var(--slate);font-size:14px;line-height:1.6;margin:0 0 10px 0;">${DOC_TYPES.slice(0,3).join(", ")}, and ${DOC_TYPES.length-3} more — requestable in a few minutes from home.</p>
      <button class="btn btn-ghost btn-sm" onclick="goTab('resident')">See the list →</button>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px 0;font-size:17px;">Five-stage tracking</h3>
      <p style="color:var(--slate);font-size:14px;line-height:1.6;margin:0;">Pending → Under Review → Approved → Ready for Pickup → Completed. Residents see exactly where their request stands.</p>
    </div>
  </div>
  `;
}

/* ============================= RESIDENT PORTAL ============================= */
function renderResident(main){
  if(!session || session.role!=='Resident'){
    main.innerHTML = residentGateHtml();
    return;
  }
  const resident = DB.residents.find(r=>r.id===session.residentId);
  const myRequests = DB.requests.filter(r=>r.residentId===resident.id);
  const myAppts = DB.appointments.filter(a=>a.residentId===resident.id);

  main.innerHTML = `
    <div class="section-title"><span class="num">01</span><h3>My profile</h3></div>
    <div class="card">
      <form id="profileForm" onsubmit="return saveProfile(event)">
        <div class="field-row">
          <div><label>Full name</label><input name="fullname" value="${resident.fullname}" required></div>
          <div><label>Household number</label><input name="household" value="${resident.household}"></div>
        </div>
        <div class="field-row">
          <div><label>Address</label><input name="address" value="${resident.address}" required></div>
          <div><label>Contact number</label><input name="contact" value="${resident.contact}" required></div>
        </div>
        <div class="field-row">
          <div><label>Birthdate</label><input type="date" name="birthdate" value="${resident.birthdate}"></div>
          <div><label>Civil status</label>
            <select name="civilStatus">
              ${["Single","Married","Widowed","Separated"].map(c=>`<option ${resident.civilStatus===c?'selected':''}>${c}</option>`).join("")}
            </select>
          </div>
        </div>
        <label>Occupation</label><input name="occupation" value="${resident.occupation}">
        <div style="margin-top:16px;"><button class="btn btn-primary btn-sm">Save profile</button></div>
      </form>
    </div>

    <div class="section-title"><span class="num">02</span><h3>Request a document</h3></div>
    <div class="card">
      <form onsubmit="return submitRequest(event)">
        <label>Document type</label>
        <select name="type" required>${DOC_TYPES.map(d=>`<option>${d}</option>`).join("")}</select>
        <label>Purpose</label>
        <textarea name="purpose" placeholder="e.g. Local employment requirement" required></textarea>
        <label>Supporting document (optional, for demo only)</label>
        <input type="file" name="upload">
        <div style="margin-top:16px;"><button class="btn btn-maroon">Submit request</button></div>
      </form>
    </div>

    <div class="section-title"><span class="num">03</span><h3>My requests</h3></div>
    ${myRequests.length===0 ? `<p style="color:var(--slate);">No requests yet — submit one above.</p>` :
      myRequests.map(r=>requestCardHtml(r)).join("")}

    <div class="section-title"><span class="num">04</span><h3>Schedule an appointment</h3></div>
    <div class="grid-2">
      <div class="card">
        <form onsubmit="return bookAppointment(event)">
          <label>Preferred date</label><input type="date" name="date" required min="2026-07-13">
          <label>Time slot</label>
          <select name="time" required>
            ${["9:00 AM","10:00 AM","11:00 AM","1:00 PM","2:00 PM","3:00 PM"].map(t=>`<option>${t}</option>`).join("")}
          </select>
          <div style="margin-top:16px;"><button class="btn btn-primary btn-sm">Book appointment</button></div>
        </form>
      </div>
      <div class="card">
        <h3 style="margin-top:0;font-size:15px;">Upcoming appointments</h3>
        ${myAppts.length===0? `<p style="color:var(--slate);font-size:13.5px;">None booked yet.</p>` :
          myAppts.map(a=>`<div class="kv"><span>${a.date} · ${a.time}</span><span class="mono">${a.id}</span></div>`).join("")}
      </div>
    </div>
  `;
}

function residentGateHtml(){
  return `
  <div class="gate card">
    <h3 style="margin-top:0;">Resident sign-in</h3>
    <p class="note">Prototype sign-in: enter your name and email — a resident profile is created automatically if one doesn't exist yet. No password is required in this demo.</p>
    <form onsubmit="return residentSignIn(event)">
      <label>Full name</label><input name="fullname" required placeholder="e.g. Juan Dela Cruz">
      <label>Email address</label><input type="email" name="email" required placeholder="you@example.com">
      <div style="margin-top:18px;"><button class="btn btn-primary">Continue</button></div>
    </form>
    <p style="font-size:12.5px;color:var(--slate);margin-top:16px;">Try an existing demo resident: <strong>Maria Santos</strong> / maria.santos@example.ph</p>
  </div>`;
}

function residentSignIn(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const email = f.get('email').trim().toLowerCase();
  const fullname = f.get('fullname').trim();
  let user = DB.users.find(u=>u.email.toLowerCase()===email);
  let resident;
  if(user){
    resident = DB.residents.find(r=>r.userId===user.id);
  }
  if(!user){
    user = {id:"U-"+pad(DB.users.length+1), name:fullname, email:f.get('email'), role:"Resident"};
    DB.users.push(user); saveKey('users',DB.users);
  }
  if(!resident){
    resident = {id:"R-"+pad(DB.residents.length+1), userId:user.id, fullname, address:"", birthdate:"", civilStatus:"Single", occupation:"", contact:"", household:"", archived:false};
    DB.residents.push(resident); saveKey('residents',DB.residents);
    audit("Resident registered", fullname);
  }
  session = {role:"Resident", name:fullname||user.name, residentId:resident.id};
  renderApp();
  return false;
}

function saveProfile(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const resident = DB.residents.find(r=>r.id===session.residentId);
  ["fullname","address","contact","birthdate","civilStatus","occupation","household"].forEach(k=>resident[k]=f.get(k));
  saveKey('residents', DB.residents);
  toast("Profile saved.");
  session.name = resident.fullname;
  renderApp();
  return false;
}

function submitRequest(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const resident = DB.residents.find(r=>r.id===session.residentId);
  const req = {
    id: genId("BC"), residentId: resident.id, residentName: resident.fullname,
    type: f.get('type'), purpose: f.get('purpose'), status:"Pending",
    dateRequested: nowStr(), history:["Pending"]
  };
  DB.requests.unshift(req); saveKey('requests', DB.requests);
  const pay = {id: genId("PAY"), requestId: req.id, amount: 40 + Math.floor(Math.random()*40), status:"Unpaid"};
  DB.payments.unshift(pay); saveKey('payments', DB.payments);
  audit("Document request submitted", `${req.type} — ${resident.fullname} (${req.id})`);
  toast(`Request submitted. Reference: ${req.id}`);
  renderApp();
  return false;
}

function bookAppointment(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const resident = DB.residents.find(r=>r.id===session.residentId);
  const apt = {id: genId("APT"), residentId: resident.id, residentName: resident.fullname, date:f.get('date'), time:f.get('time'), status:"Confirmed"};
  DB.appointments.unshift(apt); saveKey('appointments', DB.appointments);
  audit("Appointment booked", `${resident.fullname} — ${apt.date} ${apt.time}`);
  toast(`Appointment confirmed. Reference: ${apt.id}`);
  renderApp();
  return false;
}

function requestCardHtml(r){
  const showDoc = (r.status==="Approved"||r.status==="Ready for Pickup"||r.status==="Completed");
  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
      <div>
        <div class="mono" style="font-size:12.5px;color:var(--slate);">${r.id}</div>
        <h3 style="margin:4px 0 2px 0;font-size:17px;">${r.type}</h3>
        <p style="margin:0;font-size:13px;color:var(--slate);">${r.purpose} · filed ${r.dateRequested}</p>
      </div>
      ${badgeHtml(r.status)}
    </div>
    ${stepperHtml(r.status)}
    ${showDoc ? `<div style="margin-top:14px;"><button class="btn btn-outline btn-sm" onclick="viewCertificate('${r.id}')">View / download document</button></div>` : ``}
  </div>`;
}

function viewCertificate(reqId){
  const r = DB.requests.find(x=>x.id===reqId);
  const resident = DB.residents.find(x=>x.id===r.residentId);
  const main = document.getElementById('main');
  main.innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="renderApp()">← Back</button>
    <div style="max-width:640px;margin:24px auto;">
      <div class="certificate">
        <div class="cert-header">
          <p class="eyebrow">Republic of the Philippines · Office of the Barangay</p>
          <h2>${r.type}</h2>
          <p class="eyebrow" style="letter-spacing:.08em;">Document No. ${r.id}</p>
        </div>
        <div class="cert-body">
          This is to certify that <strong>${resident.fullname}</strong>, of legal age, residing at
          ${resident.address || "[address on file]"}, is a bona fide resident of this barangay and is
          issued this <strong>${r.type}</strong> for the purpose of: <em>${r.purpose}</em>.
          <br><br>
          Issued this ${nowStr()} at the Barangay Hall.
        </div>
        <div class="cert-footer">
          <div>
            <div style="border-top:1px solid var(--ink-text);width:180px;margin-bottom:4px;"></div>
            <div style="font-size:12.5px;">Punong Barangay</div>
          </div>
          <div class="qr-box">
            <div id="qrHolder" class="qrcanvas"></div>
            <div style="margin-top:6px;">Scan to verify authenticity</div>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;text-align:center;">
        <span class="stamp ${r.status==='Completed'?'':''}">${r.status==='Completed'?'Released':'Approved'}<br>Original</span>
      </div>
    </div>
  `;
  setTimeout(()=>{
    const holder = document.getElementById('qrHolder');
    if(holder && window.QRCode){
      new QRCode(holder, {text:`BARANGAYCONNECT-VERIFY:${r.id}:${resident.fullname}`, width:96, height:96, colorDark:"#16324A", colorLight:"#ffffff"});
    }
  }, 30);
}

/* ============================= STAFF PORTAL ============================= */
function renderStaffGate(main){
  if(!session || (session.role!=='Staff' && session.role!=='Secretary')){
    main.innerHTML = `
    <div class="gate card">
      <h3 style="margin-top:0;">Staff sign-in</h3>
      <p class="note">Prototype sign-in — pick a demo staff account. Real deployments would require a verified password login.</p>
      <label>Account</label>
      <select id="staffAcct">
        ${DB.users.filter(u=>u.role==='Staff'||u.role==='Secretary').map(u=>`<option value="${u.id}">${u.name} — ${u.role}</option>`).join("")}
      </select>
      <div style="margin-top:18px;"><button class="btn btn-primary" onclick="staffSignIn()">Continue</button></div>
    </div>`;
    return;
  }
  renderStaffPortal(main);
}
function staffSignIn(){
  const id = document.getElementById('staffAcct').value;
  const u = DB.users.find(x=>x.id===id);
  session = {role:u.role, name:u.name};
  audit("Staff signed in", u.name);
  renderApp();
}

function renderStaffPortal(main){
  const pending = DB.requests.filter(r=>r.status==='Pending').length;
  const review = DB.requests.filter(r=>r.status==='Under Review').length;
  const approved = DB.requests.filter(r=>r.status==='Approved').length;
  main.innerHTML = `
    <div class="grid-3" style="margin-bottom:28px;">
      <div class="stat-card"><div class="stat-num">${pending}</div><div class="stat-label">Pending</div></div>
      <div class="stat-card"><div class="stat-num">${review}</div><div class="stat-label">Under review</div></div>
      <div class="stat-card"><div class="stat-num">${approved}</div><div class="stat-label">Ready to generate</div></div>
    </div>
    <div class="subtab">
      ${subtabBtn('requests','Requests','staff')}
      ${subtabBtn('residents','Residents','staff')}
      ${subtabBtn('appointments','Appointments','staff')}
      ${subtabBtn('payments','Payments','staff')}
    </div>
    <div id="staffContent"></div>
  `;
  renderStaffSub();
}
function subtabBtn(id,label,scope){
  const active = (scope==='staff'?staffSub:adminSub)===id;
  return `<button class="${active?'active':''}" onclick="${scope}SubGo('${id}')">${label}</button>`;
}
function staffSubGo(id){ staffSub=id; renderStaffSub(); }
function renderStaffSub(){
  document.querySelectorAll('#main .subtab button').forEach((b,i)=>{
    const ids=['requests','residents','appointments','payments'];
    b.classList.toggle('active', ids[i]===staffSub);
  });
  const c = document.getElementById('staffContent');
  if(staffSub==='requests') c.innerHTML = staffRequestsHtml();
  if(staffSub==='residents') c.innerHTML = staffResidentsHtml();
  if(staffSub==='appointments') c.innerHTML = staffAppointmentsHtml();
  if(staffSub==='payments') c.innerHTML = staffPaymentsHtml();
}

function staffRequestsHtml(){
  if(DB.requests.length===0) return `<div class="card"><p style="color:var(--slate);">No requests filed yet.</p></div>`;
  return `<div class="card"><table><thead><tr><th>Reference</th><th>Resident</th><th>Document</th><th>Status</th><th>Filed</th><th>Actions</th></tr></thead><tbody>
    ${DB.requests.map(r=>`
      <tr>
        <td class="mono">${r.id}</td>
        <td>${r.residentName}</td>
        <td>${r.type}</td>
        <td>${badgeHtml(r.status)}</td>
        <td>${r.dateRequested}</td>
        <td><div class="action-row">${staffActionButtons(r)}</div></td>
      </tr>`).join("")}
  </tbody></table></div>`;
}
function staffActionButtons(r){
  if(r.status==='Pending') return `<button class="btn btn-ghost btn-sm" onclick="advanceRequest('${r.id}','Under Review')">Review</button><button class="btn btn-maroon btn-sm" onclick="rejectRequest('${r.id}')">Reject</button>`;
  if(r.status==='Under Review') return `<button class="btn btn-success btn-sm" onclick="advanceRequest('${r.id}','Approved')">Approve</button><button class="btn btn-maroon btn-sm" onclick="rejectRequest('${r.id}')">Reject</button>`;
  if(r.status==='Approved') return `<button class="btn btn-primary btn-sm" onclick="advanceRequest('${r.id}','Ready for Pickup')">Generate document</button>`;
  if(r.status==='Ready for Pickup') return `<button class="btn btn-primary btn-sm" onclick="advanceRequest('${r.id}','Completed')">Mark released</button>`;
  return `<span style="font-size:12px;color:var(--slate);">No action</span>`;
}
function advanceRequest(id,newStatus){
  const r = DB.requests.find(x=>x.id===id);
  r.status = newStatus; r.history.push(newStatus);
  saveKey('requests', DB.requests);
  audit("Request status updated", `${id} → ${newStatus}`);
  toast(`${id} moved to "${newStatus}".`);
  renderStaffSub();
  refreshStatCards();
}
function rejectRequest(id){
  const r = DB.requests.find(x=>x.id===id);
  r.status = "Rejected"; r.history.push("Rejected");
  saveKey('requests', DB.requests);
  audit("Request rejected", id);
  toast(`${id} rejected.`);
  renderStaffSub();
}
function refreshStatCards(){ renderApp(); staffSub = staffSub; setTimeout(()=>{ /* noop, app re-render handles counts */ },0); }

function staffResidentsHtml(){
  const active = DB.residents.filter(r=>!r.archived);
  return `
  <div class="card">
    <h3 style="margin-top:0;font-size:15px;">Add resident record</h3>
    <form onsubmit="return staffAddResident(event)">
      <div class="field-row">
        <div><label>Full name</label><input name="fullname" required></div>
        <div><label>Household number</label><input name="household"></div>
      </div>
      <div class="field-row">
        <div><label>Address</label><input name="address"></div>
        <div><label>Contact number</label><input name="contact"></div>
      </div>
      <div style="margin-top:14px;"><button class="btn btn-primary btn-sm">Add resident</button></div>
    </form>
  </div>
  <div class="card">
    <input placeholder="Search residents by name..." oninput="filterResidents(this.value)" style="margin-bottom:14px;">
    <table id="residentTable"><thead><tr><th>ID</th><th>Name</th><th>Address</th><th>Household</th><th>Contact</th><th></th></tr></thead>
    <tbody>${active.map(residentRowHtml).join("")}</tbody></table>
  </div>`;
}
function residentRowHtml(r){
  return `<tr><td class="mono">${r.id}</td><td>${r.fullname}</td><td>${r.address||'—'}</td><td>${r.household||'—'}</td><td>${r.contact||'—'}</td>
  <td><button class="btn btn-ghost btn-sm" onclick="archiveResident('${r.id}')">Archive</button></td></tr>`;
}
function filterResidents(q){
  const rows = DB.residents.filter(r=>!r.archived && r.fullname.toLowerCase().includes(q.toLowerCase()));
  document.querySelector('#residentTable tbody').innerHTML = rows.map(residentRowHtml).join("") || `<tr class="empty-row"><td colspan="6">No matches.</td></tr>`;
}
function staffAddResident(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const r = {id:"R-"+pad(DB.residents.length+1), userId:null, fullname:f.get('fullname'), address:f.get('address'), household:f.get('household'), contact:f.get('contact'), birthdate:"", civilStatus:"Single", occupation:"", archived:false};
  DB.residents.push(r); saveKey('residents', DB.residents);
  audit("Resident added by staff", r.fullname);
  toast("Resident record added.");
  renderStaffSub();
  return false;
}
function archiveResident(id){
  const r = DB.residents.find(x=>x.id===id);
  r.archived = true; saveKey('residents', DB.residents);
  audit("Resident archived", r.fullname);
  toast(`${r.fullname} archived.`);
  renderStaffSub();
}

function staffAppointmentsHtml(){
  if(DB.appointments.length===0) return `<div class="card"><p style="color:var(--slate);">No appointments booked.</p></div>`;
  return `<div class="card"><table><thead><tr><th>Reference</th><th>Resident</th><th>Date</th><th>Time</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${DB.appointments.map(a=>`<tr><td class="mono">${a.id}</td><td>${a.residentName}</td><td>${a.date}</td><td>${a.time}</td><td>${badgeHtml(a.status==='Confirmed'?'Approved':a.status)}</td>
    <td><div class="action-row">
      <button class="btn btn-ghost btn-sm" onclick="cancelAppt('${a.id}')">Cancel</button>
    </div></td></tr>`).join("")}
  </tbody></table></div>`;
}
function cancelAppt(id){
  const a = DB.appointments.find(x=>x.id===id);
  a.status = "Cancelled"; saveKey('appointments', DB.appointments);
  audit("Appointment cancelled", id);
  toast(`${id} cancelled.`);
  renderStaffSub();
}

function staffPaymentsHtml(){
  const total = DB.payments.filter(p=>p.status==='Paid').reduce((s,p)=>s+p.amount,0);
  return `
  <div class="card"><div class="kv"><span>Today's collections</span><span class="mono">₱${total.toFixed(2)}</span></div></div>
  <div class="card"><table><thead><tr><th>Payment ID</th><th>Request</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${DB.payments.map(p=>`<tr><td class="mono">${p.id}</td><td class="mono">${p.requestId}</td><td>₱${p.amount.toFixed(2)}</td><td>${badgeHtml(p.status==='Paid'?'Completed':'Pending')}</td>
  <td>${p.status==='Unpaid'?`<button class="btn btn-success btn-sm" onclick="markPaid('${p.id}')">Mark paid</button>`:'—'}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function markPaid(id){
  const p = DB.payments.find(x=>x.id===id);
  p.status='Paid'; saveKey('payments', DB.payments);
  audit("Payment recorded", id);
  toast(`${id} marked as paid.`);
  renderStaffSub();
}

/* ============================= ADMIN PORTAL ============================= */
function renderAdminGate(main){
  if(!session || session.role!=='Administrator'){
    main.innerHTML = `
    <div class="gate card">
      <h3 style="margin-top:0;">Administrator sign-in</h3>
      <p class="note">Prototype sign-in for the administration portal.</p>
      <label>Account</label>
      <select id="adminAcct">
        ${DB.users.filter(u=>u.role==='Administrator').map(u=>`<option value="${u.id}">${u.name}</option>`).join("")}
      </select>
      <div style="margin-top:18px;"><button class="btn btn-primary" onclick="adminSignIn()">Continue</button></div>
    </div>`;
    return;
  }
  renderAdminPortal(main);
}
function adminSignIn(){
  const id = document.getElementById('adminAcct').value;
  const u = DB.users.find(x=>x.id===id);
  session = {role:'Administrator', name:u.name};
  audit("Administrator signed in", u.name);
  renderApp();
}
function renderAdminPortal(main){
  main.innerHTML = `
    <div class="subtab">
      ${subtabBtn('users','User Management','admin')}
      ${subtabBtn('roles','Role Management','admin')}
      ${subtabBtn('audit','Audit Logs','admin')}
      ${subtabBtn('reports','Reports','admin')}
    </div>
    <div id="adminContent"></div>
  `;
  renderAdminSub();
}
function adminSubGo(id){ adminSub=id; renderAdminSub(); }
function renderAdminSub(){
  document.querySelectorAll('#main .subtab button').forEach((b,i)=>{
    const ids=['users','roles','audit','reports'];
    b.classList.toggle('active', ids[i]===adminSub);
  });
  const c = document.getElementById('adminContent');
  if(adminSub==='users') c.innerHTML = adminUsersHtml();
  if(adminSub==='roles') c.innerHTML = adminRolesHtml();
  if(adminSub==='audit') c.innerHTML = adminAuditHtml();
  if(adminSub==='reports'){ c.innerHTML = adminReportsHtml(); setTimeout(drawCharts,30); }
}
function adminUsersHtml(){
  return `
  <div class="card">
    <h3 style="margin-top:0;font-size:15px;">Add staff account</h3>
    <form onsubmit="return adminAddUser(event)">
      <div class="field-row">
        <div><label>Full name</label><input name="name" required></div>
        <div><label>Email</label><input type="email" name="email" required></div>
      </div>
      <label>Role</label>
      <select name="role">
        <option>Staff</option><option>Secretary</option><option>Administrator</option>
      </select>
      <div style="margin-top:14px;"><button class="btn btn-primary btn-sm">Add account</button></div>
    </form>
  </div>
  <div class="card"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
  ${DB.users.map(u=>`<tr><td class="mono">${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
  <td>${u.role!=='Resident'?`<button class="btn btn-ghost btn-sm" onclick="removeUser('${u.id}')">Deactivate</button>`:'—'}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function adminAddUser(ev){
  ev.preventDefault();
  const f = new FormData(ev.target);
  const u = {id:"U-"+pad(DB.users.length+1), name:f.get('name'), email:f.get('email'), role:f.get('role')};
  DB.users.push(u); saveKey('users', DB.users);
  audit("Staff account created", `${u.name} — ${u.role}`);
  toast("Account added.");
  renderAdminSub();
  return false;
}
function removeUser(id){
  DB.users = DB.users.filter(u=>u.id!==id);
  saveKey('users', DB.users);
  audit("Account deactivated", id);
  toast("Account deactivated.");
  renderAdminSub();
}
function adminRolesHtml(){
  const roles = [
    {r:"Resident", perms:"Register, request documents, book appointments, track status, download receipts"},
    {r:"Staff", perms:"Verify requests, manage residents, approve/reject applications, generate documents, schedule appointments"},
    {r:"Secretary", perms:"Manage all records, generate reports, verify residents, monitor transactions"},
    {r:"Administrator", perms:"Manage users, configure settings, access all reports, audit activities"},
  ];
  return `<div class="card"><table><thead><tr><th>Role</th><th>Permissions</th></tr></thead><tbody>
  ${roles.map(r=>`<tr><td><strong>${r.r}</strong></td><td style="color:var(--slate);">${r.perms}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function adminAuditHtml(){
  return `<div class="card">
  ${DB.auditlog.length===0?`<p style="color:var(--slate);">No activity recorded yet.</p>`:
    DB.auditlog.map(a=>`<div class="audit-item"><span class="t">${a.time}</span><span><strong>${a.action}</strong> — ${a.detail}</span></div>`).join("")}
  </div>`;
}
function adminReportsHtml(){
  return `
  <div class="grid-2">
    <div class="card"><h3 style="margin-top:0;font-size:15px;">Requests by document type</h3><canvas id="chartType" height="220"></canvas></div>
    <div class="card"><h3 style="margin-top:0;font-size:15px;">Requests by status</h3><canvas id="chartStatus" height="220"></canvas></div>
  </div>`;
}
function drawCharts(){
  if(!window.Chart) return;
  const byType = {};
  DOC_TYPES.forEach(t=>byType[t]=0);
  DB.requests.forEach(r=>byType[r.type]=(byType[r.type]||0)+1);
  const byStatus = {};
  [...STATUS_FLOW,"Rejected"].forEach(s=>byStatus[s]=0);
  DB.requests.forEach(r=>byStatus[r.status]=(byStatus[r.status]||0)+1);

  const navy = "#16324A", ochre="#C08F32", maroon="#8C2F2F", success="#3F6B4F", slate="#4B5A66";
  new Chart(document.getElementById('chartType'), {
    type:'bar',
    data:{labels:Object.keys(byType), datasets:[{label:'Requests', data:Object.values(byType), backgroundColor:navy}]},
    options:{plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:9}}}}}
  });
  new Chart(document.getElementById('chartStatus'), {
    type:'doughnut',
    data:{labels:Object.keys(byStatus), datasets:[{data:Object.values(byStatus), backgroundColor:[slate,ochre,success,navy,"#254A68",maroon]}]},
    options:{plugins:{legend:{position:'bottom', labels:{font:{size:10}}}}}
  });
}

/* ============================= INIT ============================= */
(async function init(){
  document.getElementById('app').innerHTML = `<main style="padding:60px;text-align:center;color:#F6F1E1;">Loading BarangayConnect…</main>`;
  await loadAll();
  renderApp();
})();