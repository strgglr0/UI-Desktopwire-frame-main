const API_BASE = 'http://localhost:8000/api';
const SESSION_KEY = 'clinic-session';

const USERS = {
  hradmin: { roleLabel: 'HR Admin', portalLabel: 'Hospital HR Admin Menu' },
  supervisor: { roleLabel: 'Supervisor', portalLabel: 'Medical Supervisor Menu' },
  manager: { roleLabel: 'Manager', portalLabel: 'Clinic Manager Menu' },
  superadmin: { roleLabel: 'Super Admin', portalLabel: 'Hospital Super Admin Menu' }
};

const NAV_BY_ROLE = {
  hradmin: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'hr-payroll', label: '💰 Generate Medical Payroll' },
    { id: 'hr-staff', label: '👥 Medical Staff Management' }
  ],
  supervisor: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'sup-attendance', label: '🗓️ View Staff Attendance' },
    { id: 'sup-requests', label: '📨 Approve Staff Requests' }
  ],
  manager: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'mgr-attendance', label: '🗓️ View Staff Attendance' },
    { id: 'mgr-summaries', label: '📋 View Medical Summaries' },
    { id: 'mgr-reports', label: '📝 Approve Medical Reports' }
  ],
  superadmin: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'sa-data', label: '🏥 View All Hospital Data' },
    { id: 'sa-generate', label: '📊 Generate Hospital Reports' },
    { id: 'sa-system', label: '⚙️ Manage Hospital System' },
    { id: 'sa-requests', label: '✅ Approve All Requests' },
    { id: 'sa-reports', label: '✍️ Approve All Reports' }
  ]
};

let activeSession = null;
let currentData = null;
let activeScreen = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
  bindLogin();
  bindLogout();
  bindAppActions();
  restoreSession();
});

function bindLogin() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();

    try {
      const result = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }, false);

      activeSession = { token: result.token, user: result.user };
      localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
      hideError();
      await launchApp();
    } catch (err) {
      showError(err.message || 'Login failed. Access denied.');
    }
  });
}

function bindLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (activeSession?.token) {
      try { await apiFetch('/auth/logout', { method: 'POST' }); } catch (_e) {}
    }
    localStorage.removeItem(SESSION_KEY);
    activeSession = null;
    currentData = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-password').value = '';
  });
}

function bindAppActions() {
  document.getElementById('app').addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const id = target.dataset.id;

    try {
      if (action === 'run-payroll') {
        const cutoffEl = document.getElementById('payroll-cutoff');
        await apiFetch('/payroll/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cutoff: cutoffEl ? cutoffEl.value : '15th' })
        });
      } else if (action === 'save-payroll') {
        await apiFetch('/payroll/save-latest', { method: 'POST' });
      } else if (action === 'toggle-staff' || action === 'toggle-user') {
        await apiFetch(`/staff/${id}/toggle`, { method: 'POST' });
      } else if (action === 'delete-user') {
        await apiFetch(`/staff/${id}`, { method: 'DELETE' });
      } else if (action === 'approve-request') {
        await apiFetch(`/requests/${id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'Approved' })
        });
      } else if (action === 'reject-request') {
        const reason = prompt('Provide rejection reason:', 'Insufficient details') || 'Rejected';
        await apiFetch(`/requests/${id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'Rejected', reason })
        });
      } else if (action === 'mgr-approve-report') {
        await apiFetch(`/reports/${id}/manager-approve`, { method: 'POST' });
      } else if (action === 'mgr-return-report') {
        const comments = prompt('Add revision comments:', 'Please update missing clinical details.') || '';
        await apiFetch(`/reports/${id}/manager-return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments })
        });
      } else if (action === 'sa-final-approve-report') {
        await apiFetch(`/reports/${id}/final-approve`, { method: 'POST' });
      } else if (action === 'generate-hospital-report') {
        await apiFetch('/reports/generate-comprehensive', { method: 'POST' });
      } else if (action === 'reset-demo-data') {
        await apiFetch('/system/reset', { method: 'POST' });
      }

      await refreshData();
      renderScreen(activeScreen);
    } catch (err) {
      alert(err.message || 'Action failed');
    }
  });

  document.getElementById('app').addEventListener('submit', async (e) => {
    if (e.target.id === 'register-staff-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      await apiFetch('/staff/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(f.get('name') || ''),
          category: String(f.get('category') || ''),
          department: String(f.get('department') || ''),
          role: String(f.get('role') || ''),
          credentials: String(f.get('credentials') || '')
        })
      });
      e.target.reset();
      await refreshData();
      renderScreen(activeScreen);
    }

    if (e.target.id === 'create-user-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      await apiFetch('/staff/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(f.get('name') || ''),
          category: String(f.get('category') || ''),
          department: String(f.get('department') || ''),
          role: String(f.get('role') || ''),
          credentials: String(f.get('credentials') || '')
        })
      });
      e.target.reset();
      await refreshData();
      renderScreen(activeScreen);
    }
  });
}

function restoreSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    activeSession = JSON.parse(raw);
    if (!activeSession?.token) return;
    launchApp();
  } catch (_e) {
    localStorage.removeItem(SESSION_KEY);
  }
}

async function launchApp() {
  try {
    await refreshData();

    const role = activeSession.user.role;
    const cfg = USERS[role];

    document.getElementById('portal-label').textContent = cfg?.portalLabel || 'Portal';
    document.getElementById('user-name').textContent = activeSession.user.name;
    document.getElementById('user-role').textContent = cfg?.roleLabel || role;

    buildNav(role);
    renderScreen('dashboard');

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  } catch (err) {
    localStorage.removeItem(SESSION_KEY);
    activeSession = null;
    showError(err.message || 'Session expired. Login again.');
  }
}

async function refreshData() {
  const result = await apiFetch('/data', { method: 'GET' });
  currentData = result.data;
  if (activeSession?.user) {
    activeSession.user.role = result.role;
    activeSession.user.name = result.name;
    localStorage.setItem(SESSION_KEY, JSON.stringify(activeSession));
  }
}

function buildNav(role) {
  const nav = document.getElementById('nav-list');
  nav.innerHTML = '';
  (NAV_BY_ROLE[role] || []).forEach((item, index) => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (index === 0 ? ' active' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      renderScreen(item.id);
    });
    nav.appendChild(btn);
  });
}

function renderScreen(screenId) {
  activeScreen = screenId;
  const data = currentData;
  const role = activeSession.user.role;
  const screen = document.getElementById('screen-main');

  if (!data) {
    screen.innerHTML = '<article class="card"><h3>Loading...</h3></article>';
    return;
  }

  if (screenId === 'dashboard') {
    document.getElementById('screen-title').textContent = 'Hospital Admin Dashboard';
    screen.innerHTML = dashboardHtml(data, role);
    return;
  }

  const map = {
    hradmin: {
      'hr-payroll': ['Generate Medical Staff Payroll', hrPayrollHtml],
      'hr-staff': ['Manage Medical Staff', hrStaffHtml]
    },
    supervisor: {
      'sup-attendance': ['View Medical Staff Attendance', supervisorAttendanceHtml],
      'sup-requests': ['Review Medical Staff Requests', supervisorRequestsHtml]
    },
    manager: {
      'mgr-attendance': ['View Staff Attendance', managerAttendanceHtml],
      'mgr-summaries': ['View Medical Summaries', managerSummariesHtml],
      'mgr-reports': ['Review Medical Reports', managerReportsHtml]
    },
    superadmin: {
      'sa-data': ['View Complete Hospital Data', superAdminDataHtml],
      'sa-generate': ['Generate Comprehensive Reports', superAdminGenerateHtml],
      'sa-system': ['Manage Hospital System', superAdminSystemHtml],
      'sa-requests': ['Review All Pending Requests', superAdminRequestsHtml],
      'sa-reports': ['Review All Pending Reports', superAdminReportsHtml]
    }
  };

  const target = map[role]?.[screenId];
  if (!target) {
    document.getElementById('screen-title').textContent = 'Hospital Admin Dashboard';
    screen.innerHTML = dashboardHtml(data, role);
    return;
  }

  document.getElementById('screen-title').textContent = target[0];
  screen.innerHTML = target[1](data);
}

function dashboardHtml(data, role) {
  const pendingRequests = data.requests.filter((r) => r.status === 'Pending').length;
  const pendingMgrReports = data.reports.filter((r) => r.status === 'Pending Manager Review').length;
  const pendingFinalReports = data.reports.filter((r) => r.status === 'Pending Final Approval').length;
  const activeStaff = data.staff.filter((s) => s.active).length;

  const roleMenuTitle = {
    hradmin: 'Hospital HR Admin Menu',
    supervisor: 'Medical Supervisor Menu',
    manager: 'Clinic Manager Menu',
    superadmin: 'Hospital Super Admin Menu'
  }[role];

  return `
    <div class="notice"><strong>Role Authorization:</strong> Access is granted based on backend-validated credentials and role.</div>
    <div class="split" style="margin-bottom:12px">
      <article class="card"><h3>${roleMenuTitle}</h3><p class="muted">Login role determines available functions automatically.</p></article>
      <article class="card"><h3>System State</h3><p class="muted">Query / Modify / Update / Store operations are handled by backend APIs with authorization checks.</p></article>
    </div>
    <div class="grid">
      <article class="card"><h3>Active Medical Staff</h3><div class="kpi">${activeStaff}</div></article>
      <article class="card"><h3>Pending Requests</h3><div class="kpi">${pendingRequests}</div></article>
      <article class="card"><h3>Pending Manager Reports</h3><div class="kpi">${pendingMgrReports}</div></article>
      <article class="card"><h3>Pending Final Reports</h3><div class="kpi">${pendingFinalReports}</div></article>
    </div>
  `;
}

function hrPayrollHtml(data) {
  const lastRun = data.payrollRuns[0];
  return `
    <div class="notice">Select cut-off date (15th or 30th), calculate payroll, then save payroll report.</div>
    <div class="split">
      <article class="card">
        <h3>Payroll Input</h3>
        <div class="mini-form">
          <label class="muted">Cut-Off Date</label>
          <select id="payroll-cutoff"><option value="15th">15th</option><option value="30th">30th</option></select>
          <button class="btn btn-primary" data-action="run-payroll">Run Payroll Calculation</button>
          <button class="btn btn-outline" data-action="save-payroll">Save Payroll to Database</button>
        </div>
      </article>
      <article class="card">
        <h3>Payroll Breakdown</h3>
        ${lastRun ? `<div class="list">
          <div class="item"><strong>Cut-Off</strong><span>${lastRun.cutoff}</span></div>
          <div class="item"><strong>Attendance Hours</strong><span>${Number(lastRun.attendanceHours).toFixed(1)}</span></div>
          <div class="item"><strong>Approved OT Hours</strong><span>${Number(lastRun.approvedOt).toFixed(1)}</span></div>
          <div class="item"><strong>On-Call Hours</strong><span>${Number(lastRun.onCallHours).toFixed(1)}</span></div>
          <div class="item"><strong>Approved Leave Days</strong><span>${Number(lastRun.approvedLeave).toFixed(1)}</span></div>
          <div class="item"><strong>Gross Pay</strong><span><span class="badge badge-green">₱${Number(lastRun.grossPay).toLocaleString()}</span></span></div>
          <div class="item"><strong>Status</strong><span>${statusBadge(lastRun.status)}</span></div>
        </div>` : '<p class="muted">No payroll run yet.</p>'}
      </article>
    </div>
  `;
}

function hrStaffHtml(data) {
  const rows = data.staff.map((staff) => `
    <tr>
      <td>${staff.id}</td><td>${staff.name}</td><td>${staff.category}</td><td>${staff.department}</td><td>${staff.role}</td><td>${staff.credentials}</td>
      <td>${staff.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td><button class="btn btn-sm btn-outline" data-action="toggle-staff" data-id="${staff.id}">${staff.active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>
  `).join('');
  return `
    <div class="split">
      <article class="card">
        <h3>Register Medical Staff</h3>
        <form id="register-staff-form" class="mini-form">
          <input name="name" placeholder="Full name" required />
          <select name="category" required><option>Doctors</option><option>Nurses</option><option>Admin Staff</option></select>
          <input name="department" placeholder="Department" required />
          <input name="role" placeholder="Assigned Role" required />
          <input name="credentials" placeholder="Credentials" required />
          <button class="btn btn-primary" type="submit">Register New Staff</button>
        </form>
      </article>
      <article class="card"><h3>Medical Staff Accounts</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Department</th><th>Role</th><th>Credentials</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></article>
    </div>
  `;
}

function supervisorAttendanceHtml(data) {
  const rows = data.attendance.map((a) => `
    <tr><td>${a.staffId}</td><td>${a.name}</td><td>${a.department}</td><td>${a.timeIn}</td><td>${a.timeOut}</td><td>${Number(a.hours).toFixed(1)}</td><td>${Number(a.ot).toFixed(1)}</td><td>${statusBadge(a.status)}</td></tr>
  `).join('');
  return `<article class="card"><h3>Display Attendance Records</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff ID</th><th>Name</th><th>Department</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function supervisorRequestsHtml(data) {
  const queue = data.requests.filter((r) => ['Leave', 'OT', 'Shift Change'].includes(r.type));
  const rows = queue.map((r) => `
    <div class="item item-block"><div><strong>${r.employee} — ${r.type}</strong><br><span>${r.details}</span><br><span>Reason: ${r.reason}</span><br><span>Status: ${statusBadge(r.status)} ${r.decidedBy ? `· by ${r.decidedBy}` : ''}</span></div><div class="actions">${r.status === 'Pending' ? `<button class="btn btn-primary btn-sm" data-action="approve-request" data-id="${r.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="reject-request" data-id="${r.id}">Reject</button>` : ''}</div></div>
  `).join('');
  return `<article class="card"><h3>View Pending Requests</h3><div class="list">${rows}</div></article>`;
}

function managerAttendanceHtml(data) {
  const byDept = {};
  data.attendance.forEach((a) => {
    if (!byDept[a.department]) byDept[a.department] = { total: 0, present: 0, ot: 0 };
    byDept[a.department].total += 1;
    if (a.status === 'Present' || a.status === 'Late') byDept[a.department].present += 1;
    byDept[a.department].ot += Number(a.ot);
  });
  const rows = Object.entries(byDept).map(([dept, s]) => `<tr><td>${dept}</td><td>${s.total}</td><td>${s.present}</td><td>${((s.present / s.total) * 100).toFixed(1)}%</td><td>${s.ot.toFixed(1)}</td></tr>`).join('');
  return `<article class="card"><h3>Display Attendance by Department</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Department</th><th>Total Staff</th><th>Present</th><th>Coverage</th><th>OT Hours</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function managerSummariesHtml() {
  return `<div class="grid"><article class="card"><h3>Patient Statistics</h3><div class="kpi">46</div></article><article class="card"><h3>Staff Performance</h3><div class="kpi">4.7</div></article><article class="card"><h3>Resource Usage</h3><div class="kpi">78%</div></article><article class="card"><h3>Performance Metrics</h3><div class="kpi">92%</div></article></div>`;
}

function managerReportsHtml(data) {
  const queue = data.reports.filter((r) => r.status === 'Pending Manager Review' || r.status === 'Returned for Revision');
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.title}</strong><br><span>${r.category} · ${r.submittedBy}</span><br><span>Status: ${statusBadge(r.status)}</span></div><div class="actions">${r.status === 'Pending Manager Review' ? `<button class="btn btn-primary btn-sm" data-action="mgr-approve-report" data-id="${r.id}">Sign & Approve</button><button class="btn btn-danger btn-sm" data-action="mgr-return-report" data-id="${r.id}">Return</button>` : ''}</div></div>`).join('');
  return `<article class="card"><h3>Review Medical Reports</h3><div class="list">${rows || '<p class="muted">No reports awaiting manager action.</p>'}</div></article>`;
}

function superAdminDataHtml(data) {
  return `<div class="grid"><article class="card"><h3>Patient Records</h3><div class="kpi">1,482</div></article><article class="card"><h3>Staff Data</h3><div class="kpi">${data.staff.length}</div></article><article class="card"><h3>Financial Data</h3><div class="kpi">₱4.2M</div></article><article class="card"><h3>System Logs</h3><div class="kpi">${data.auditLogs.length}</div></article></div>`;
}

function superAdminGenerateHtml(data) {
  const rows = data.generatedHospitalReports.map((r) => `<tr><td>${r.name}</td><td>${r.generatedBy}</td><td>${r.createdAt}</td></tr>`).join('');
  return `<article class="card"><h3>Generate Comprehensive Reports</h3><button class="btn btn-primary" data-action="generate-hospital-report">Generate Hospital Report Bundle</button><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Report Bundle</th><th>Generated By</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">No generated reports yet.</td></tr>'}</tbody></table></div></article>`;
}

function superAdminSystemHtml(data) {
  const rows = data.staff.map((u) => `<tr><td>${u.id}</td><td>${u.name}</td><td>${u.role}</td><td>${u.department}</td><td>${u.active ? 'Active' : 'Inactive'}</td><td><button class="btn btn-sm btn-outline" data-action="toggle-user" data-id="${u.id}">${u.active ? 'Deactivate' : 'Activate'}</button> <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}">Delete</button></td></tr>`).join('');
  return `<div class="split"><article class="card"><h3>Create / Edit Users</h3><form id="create-user-form" class="mini-form"><input name="name" placeholder="Full name" required><input name="category" placeholder="Category" required><input name="department" placeholder="Department" required><input name="role" placeholder="Role" required><input name="credentials" placeholder="Credentials" required><button class="btn btn-primary" type="submit">Create User</button></form><button style="margin-top:10px" class="btn btn-outline" data-action="reset-demo-data">Reset Demo Data</button></article><article class="card"><h3>All Users & Permissions</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></article></div>`;
}

function superAdminRequestsHtml(data) {
  const queue = data.requests.filter((r) => r.status === 'Pending');
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.type}: ${r.employee}</strong><br><span>${r.details}</span><br><span>Reason: ${r.reason}</span></div><div class="actions"><button class="btn btn-primary btn-sm" data-action="approve-request" data-id="${r.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="reject-request" data-id="${r.id}">Reject</button></div></div>`).join('');
  return `<article class="card"><h3>Review All Pending Requests</h3><div class="list">${rows || '<p class="muted">No pending requests.</p>'}</div></article>`;
}

function superAdminReportsHtml(data) {
  const queue = data.reports.filter((r) => r.status === 'Pending Final Approval');
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.title}</strong><br><span>${r.category} · ${r.submittedBy}</span><br><span>Manager Sign: ${r.managerSign || '—'}</span></div><div class="actions"><button class="btn btn-primary btn-sm" data-action="sa-final-approve-report" data-id="${r.id}">Final Sign & Approve</button></div></div>`).join('');
  return `<article class="card"><h3>Review All Pending Reports</h3><div class="list">${rows || '<p class="muted">No reports awaiting final approval.</p>'}</div></article>`;
}

function statusBadge(status) {
  if (status === 'Approved' || status === 'Present' || status === 'Final Approved' || status === 'Saved') return '<span class="badge badge-green">' + status + '</span>';
  if (status === 'Rejected' || status === 'Absent') return '<span class="badge badge-red">' + status + '</span>';
  return '<span class="badge badge-yellow">' + status + '</span>';
}

async function apiFetch(path, options = {}, auth = true) {
  const headers = { ...(options.headers || {}) };
  if (auth && activeSession?.token) headers.Authorization = `Bearer ${activeSession.token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let body = {};
  try { body = await res.json(); } catch (_e) {}
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(SESSION_KEY);
      activeSession = null;
    }
    throw new Error(body.detail || 'Request failed');
  }
  return body;
}

function showError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('login-error').classList.add('hidden');
}
