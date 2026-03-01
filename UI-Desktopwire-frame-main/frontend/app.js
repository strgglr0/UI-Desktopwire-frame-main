const API_BASE = '/api';
const API_BASE_KEY = 'clinic-api-base';
const SESSION_KEY = 'clinic-session';
const PTSTAFF_APP_URL_KEY = 'ptstaff-app-url';

const USERS = {
  hradmin: { roleLabel: 'HR Admin', portalLabel: 'PT Clinic HR Admin Menu' },
  supervisor: { roleLabel: 'Supervisor', portalLabel: 'PT Clinic Supervisor Menu' },
  manager: { roleLabel: 'Manager', portalLabel: 'Clinic Manager Menu' },
  ptstaff: { roleLabel: 'PT Staff', portalLabel: 'PT Staff Management Portal' },
  superadmin: { roleLabel: 'Super Admin', portalLabel: 'PT Clinic Super Admin Menu' }
};

const ROLE_OPTIONS = ['hradmin', 'supervisor', 'manager', 'ptstaff', 'superadmin'];
const DESIGNATION_OPTIONS = [
  'Physical Therapist',
  'Senior Physical Therapist',
  'PT Assistant',
  'Rehab Aide',
  'Front Desk Officer',
  'Finance Officer'
];

const NAV_BY_ROLE = {
  hradmin: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'hr-payroll', label: '💰 Generate PT Staff Payroll' },
    { id: 'hr-attendance', label: '🗓️ View Staff Attendance' },
    { id: 'hr-staff', label: '👥 PT Staff Management' }
  ],
  supervisor: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'sup-attendance', label: '🗓️ View Staff Attendance' },
    { id: 'sup-requests', label: '📨 Approve Staff Requests' }
  ],
  manager: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'mgr-attendance', label: '🗓️ View Staff Attendance' },
    { id: 'mgr-summaries', label: '📋 View Therapy Summaries' },
    { id: 'mgr-reports', label: '📝 Approve Therapy Reports' }
  ],
  ptstaff: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'pt-home', label: '🧑‍⚕️ PT Staff Workspace' }
  ],
  superadmin: [
    { id: 'dashboard', label: '🏠 Dashboard' },
    { id: 'sa-data', label: '🏥 View All Clinic Data' },
    { id: 'sa-generate', label: '📊 Generate Clinic Reports' },
    { id: 'sa-system', label: '⚙️ Manage Clinic System' },
    { id: 'sa-requests', label: '✅ Approve All Requests' },
    { id: 'sa-reports', label: '✍️ Approve All Reports' }
  ]
};

let activeSession = null;
let currentData = null;
let activeScreen = 'dashboard';
let modalResolver = null;
let payrollPreviewArmed = false;
let payrollPreviewCutoff = '15th';
let payrollPreviewStaffId = '';

document.addEventListener('DOMContentLoaded', () => {
  bootstrapApiBaseFromQuery();
  bindLogin();
  bindLogout();
  bindAppActions();
  bindModal();
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
      let result = null;
      if (action === 'view-month-log' || action === 'view-year-log') {
        const staffId = String(target.dataset.staffId || '').trim();
        const staffName = String(target.dataset.staffName || '').trim();
        if (!staffId) {
          alert('Staff ID not found for this attendance row.');
          return;
        }
        await openAttendanceLogModal(staffId, staffName, action === 'view-month-log' ? 'month' : 'year');
        return;
      } else if (action === 'run-payroll') {
        const cutoffEl = document.getElementById('payroll-cutoff');
        const staffEl = document.getElementById('payroll-staff-id');
        const selectedCutoff = cutoffEl ? cutoffEl.value : '15th';
        result = await apiFetch('/payroll/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cutoff: selectedCutoff
          })
        });
        payrollPreviewArmed = true;
        payrollPreviewCutoff = selectedCutoff;
        payrollPreviewStaffId = String(staffEl?.value || '');
      } else if (action === 'save-payroll') {
        result = await apiFetch('/payroll/save-latest', { method: 'POST' });
      } else if (action === 'toggle-staff') {
        result = await apiFetch(`/staff/${id}/toggle`, { method: 'POST' });
      } else if (action === 'edit-staff') {
        const staff = (currentData?.staff || []).find((s) => String(s.id) === String(id));
        if (!staff) {
          alert('Staff not found.');
          return;
        }
        const payload = await openStaffEditModal(staff);
        if (!payload) return;
        if (Object.keys(payload).length === 0) return;
        result = await apiFetch(`/staff/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'delete-staff') {
        result = await apiFetch(`/staff/${id}`, { method: 'DELETE' });
      } else if (action === 'toggle-user') {
        result = await apiFetch(`/users/${id}/toggle`, { method: 'POST' });
      } else if (action === 'edit-user') {
        const user = (currentData?.users || []).find((u) => String(u.id) === String(id));
        if (!user) {
          alert('User not found.');
          return;
        }
        const payload = await openUserEditModal(user);
        if (!payload) return;
        if (Object.keys(payload).length === 0) return;
        result = await apiFetch(`/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'delete-user') {
        result = await apiFetch(`/users/${id}`, { method: 'DELETE' });
      } else if (action === 'approve-request') {
        const reason = await openReasonModal({
          title: 'Approve Request',
          subtitle: 'Add an optional approval comment for the audit trail.',
          label: 'Approval Comment (Optional)',
          placeholder: 'Approved. Proceed with scheduling.',
          submitLabel: 'Approve Request',
          required: false
        });
        if (reason === null) return;
        result = await apiFetch(`/requests/${id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'Approved', reason })
        });
      } else if (action === 'reject-request') {
        const reason = await openReasonModal({
          title: 'Reject Request',
          subtitle: 'Please enter the rejection reason before continuing.',
          label: 'Rejection Reason',
          placeholder: 'Insufficient details',
          submitLabel: 'Reject Request',
          required: true
        });
        if (reason === null) return;
        result = await apiFetch(`/requests/${id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'Rejected', reason })
        });
      } else if (action === 'mgr-approve-report') {
        result = await apiFetch(`/reports/${id}/manager-approve`, { method: 'POST' });
      } else if (action === 'mgr-return-report') {
        const comments = await openReasonModal({
          title: 'Return Report for Revision',
          subtitle: 'Enter specific revision notes for the report submitter.',
          label: 'Revision Comments',
          placeholder: 'Please update missing therapy details.',
          submitLabel: 'Return Report',
          required: true
        });
        if (comments === null) return;
        result = await apiFetch(`/reports/${id}/manager-return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comments })
        });
      } else if (action === 'sa-final-approve-report') {
        result = await apiFetch(`/reports/${id}/final-approve`, { method: 'POST' });
      } else if (action === 'generate-clinic-report') {
        const reportName = String(document.getElementById('gen-report-name')?.value || '').trim();
        const reportType = String(document.getElementById('gen-report-type')?.value || '').trim();
        const department = String(document.getElementById('gen-report-department')?.value || '').trim();
        const periodStart = String(document.getElementById('gen-report-start')?.value || '').trim();
        const periodEnd = String(document.getElementById('gen-report-end')?.value || '').trim();
        const notes = String(document.getElementById('gen-report-notes')?.value || '').trim();
        if (!reportName || !reportType || !department || !periodStart || !periodEnd) {
          alert('Please complete all required report details.');
          return;
        }
        result = await apiFetch('/reports/generate-comprehensive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            report_name: reportName,
            report_type: reportType,
            department,
            period_start: periodStart,
            period_end: periodEnd,
            notes
          })
        });
      } else if (action === 'delete-generated-report') {
        result = await apiFetch(`/reports/generated/${id}`, { method: 'DELETE' });
      } else if (action === 'reset-demo-data') {
        result = await apiFetch('/system/reset', { method: 'POST' });
      } else if (action === 'save-ptstaff-app-url') {
        const input = document.getElementById('ptstaff-app-url-input');
        const value = String(input?.value || '').trim();
        if (!value) {
          alert('Please enter a PT Staff app URL.');
          return;
        }
        if (!/^https?:\/\//i.test(value)) {
          alert('Please enter a valid URL that starts with http:// or https://');
          return;
        }
        localStorage.setItem(PTSTAFF_APP_URL_KEY, value);
        alert('PT Staff app URL saved. PT Staff logins will now redirect there.');
      } else if (action === 'clear-ptstaff-app-url') {
        localStorage.removeItem(PTSTAFF_APP_URL_KEY);
        const input = document.getElementById('ptstaff-app-url-input');
        if (input) input.value = '';
        alert('PT Staff app URL cleared. PT Staff logins will use local placeholder workspace.');
      }

      if (result?.status === 'notified') {
        alert('Change applied and Super Admin has been notified.');
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
      const designationVal = String(f.get('designation') || '').trim();
      await apiFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(f.get('email') || '').trim().toLowerCase(),
          full_name: String(f.get('full_name') || ''),
          designation: designationVal,
          role: String(f.get('role') || ''),
          password: String(f.get('password') || '')
        })
      });
      e.target.reset();
      await refreshData();
      renderScreen(activeScreen);
    }

    if (e.target.id === 'create-ptstaff-user-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      await apiFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(f.get('email') || '').trim().toLowerCase(),
          full_name: String(f.get('full_name') || ''),
          designation: String(f.get('designation') || '').trim(),
          staff_id: String(f.get('staff_id') || '').trim(),
          role: 'ptstaff',
          password: String(f.get('password') || '')
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
    const ptStaffAppUrl = String(localStorage.getItem(PTSTAFF_APP_URL_KEY) || '').trim();
    if (role === 'ptstaff' && ptStaffAppUrl) {
      const joiner = ptStaffAppUrl.includes('?') ? '&' : '?';
      window.location.href = `${ptStaffAppUrl}${joiner}token=${encodeURIComponent(activeSession.token)}`;
      return;
    }

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
  currentData = { ...result.data, users: result.users || [] };
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
    if (role === 'ptstaff') {
      document.getElementById('screen-title').textContent = 'PT Staff Dashboard';
      screen.innerHTML = ptStaffDashboardHtml(data);
    } else {
      document.getElementById('screen-title').textContent = 'PT Clinic Admin Dashboard';
      screen.innerHTML = dashboardHtml(data, role);
    }
    return;
  }

  const map = {
    hradmin: {
      'hr-payroll': ['Generate PT Staff Payroll', hrPayrollHtml],
      'hr-attendance': ['View PT Staff Attendance', hrAttendanceHtml],
      'hr-staff': ['Manage PT Staff', hrStaffHtml]
    },
    supervisor: {
      'sup-attendance': ['View PT Staff Attendance', supervisorAttendanceHtml],
      'sup-requests': ['Review PT Staff Requests', supervisorRequestsHtml]
    },
    manager: {
      'mgr-attendance': ['View Staff Attendance', managerAttendanceHtml],
      'mgr-summaries': ['View Therapy Summaries', managerSummariesHtml],
      'mgr-reports': ['Review Therapy Reports', managerReportsHtml]
    },
    ptstaff: {
      'pt-home': ['PT Staff Workspace', ptStaffWorkspaceHtml]
    },
    superadmin: {
      'sa-data': ['View Complete Clinic Data', superAdminDataHtml],
      'sa-generate': ['Generate Comprehensive Reports', superAdminGenerateHtml],
      'sa-system': ['Manage Clinic System', superAdminSystemHtml],
      'sa-requests': ['Review All Pending Requests', superAdminRequestsHtml],
      'sa-reports': ['Review All Pending Reports', superAdminReportsHtml]
    }
  };

  const target = map[role]?.[screenId];
  if (!target) {
    document.getElementById('screen-title').textContent = 'PT Clinic Admin Dashboard';
    screen.innerHTML = dashboardHtml(data, role);
    return;
  }

  document.getElementById('screen-title').textContent = target[0];
  screen.innerHTML = target[1](data);
  afterScreenRender(screenId, data, role);
}

function afterScreenRender(screenId, data, role) {
  if (role === 'hradmin' && screenId === 'hr-payroll') {
    bindHrPayrollInputs(data);
  }
}

function dashboardHtml(data, role) {
  const pendingRequests = data.requests.filter((r) => r.status === 'Pending').length;
  const pendingMgrReports = data.reports.filter((r) => r.status === 'Pending Manager Review').length;
  const pendingFinalReports = data.reports.filter((r) => r.status === 'Pending Final Approval').length;
  const activeStaff = data.staff.filter((s) => s.active).length;
  const activeUsers = (data.users || []).filter((u) => u.is_active).length;

  const roleMenuTitle = {
    hradmin: 'PT Clinic HR Admin Menu',
    supervisor: 'PT Clinic Supervisor Menu',
    manager: 'Clinic Manager Menu',
    ptstaff: 'PT Staff Management Menu',
    superadmin: 'PT Clinic Super Admin Menu'
  }[role];

  return `
    <div class="notice"><strong>Role Authorization:</strong> Access is granted based on backend-validated credentials and role.</div>
    <div class="split" style="margin-bottom:12px">
      <article class="card"><h3>${roleMenuTitle}</h3><p class="muted">Login role determines available functions automatically.</p></article>
      <article class="card"><h3>System State</h3><p class="muted">Query / Modify / Update / Store operations are handled by backend APIs with authorization checks.</p></article>
    </div>
    <div class="grid">
      <article class="card"><h3>Active PT Staff</h3><div class="kpi">${activeStaff}</div></article>
      <article class="card"><h3>Pending Requests</h3><div class="kpi">${pendingRequests}</div></article>
      <article class="card"><h3>Pending Manager Reports</h3><div class="kpi">${pendingMgrReports}</div></article>
      <article class="card"><h3>Pending Final Reports</h3><div class="kpi">${pendingFinalReports}</div></article>
      <article class="card"><h3>Active Login Users</h3><div class="kpi">${activeUsers}</div></article>
    </div>
    ${userDirectoryHtml(data, role)}
  `;
}

function ptStaffDashboardHtml(data) {
  const myName = activeSession?.user?.name || 'PT Staff';
  const activeStaff = data.staff.filter((s) => s.active).length;
  const todayAttendance = filterAttendanceByView(data.attendance || [], 'today').length;
  return `
    <div class="notice"><strong>PT Staff Access:</strong> This interface is intentionally separate from admin modules.</div>
    <div class="split" style="margin-bottom:12px">
      <article class="card"><h3>Welcome, ${myName}</h3><p class="muted">You are using the PT Staff portal. Admin pages are hidden from this role.</p></article>
      <article class="card"><h3>Implementation Scope</h3><p class="muted">This PT Staff UI is kept isolated so the employee module can be developed independently.</p></article>
    </div>
    <div class="grid">
      <article class="card"><h3>Active PT Staff</h3><div class="kpi">${activeStaff}</div></article>
      <article class="card"><h3>Today Attendance Records</h3><div class="kpi">${todayAttendance}</div></article>
    </div>
  `;
}

function ptStaffWorkspaceHtml() {
  return `
    <article class="card">
      <h3>PT Staff Workspace</h3>
      <p class="muted">This is a dedicated PT Staff-only page and is intentionally different from admin panels.</p>
      <div class="notice"><strong>Handoff Ready:</strong> Employee-specific features can be implemented here by the PT Staff module owners.</div>
    </article>
  `;
}

function userDirectoryHtml(data, role) {
  const users = data.users || [];
  const rows = users.map((u) => `
    <tr>
      <td>${u.id}</td>
      <td>${u.full_name}</td>
      <td>${u.designation || '—'}</td>
      <td>${u.email}</td>
      <td>${roleLabel(u.role)}</td>
      <td>${u.is_active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
    </tr>
  `).join('');
  const note = role === 'superadmin'
    ? 'Global user source is shared for all roles. Manage users in System Management.'
    : 'This user directory is shared across all roles and updates in real time from Super Admin actions.';

  return `<article class="card" style="margin-top:12px"><h3>Shared User Directory</h3><p class="muted">${note}</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Name</th><th>Designation</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">No users found.</td></tr>'}</tbody></table></div></article>`;
}

function hrPayrollHtml(data) {
  const initialCutoff = '15th';
  const cutoffAttendance = getPayrollCutoffAttendance(data, initialCutoff);
  const periodLabel = getPayrollPeriodLabel(data, initialCutoff, cutoffAttendance.length);
  const preview = buildDesignationPayrollPreview(data, cutoffAttendance);
  const staffOptions = (data.staff || []).map((s) => `<option value="${s.id}">${s.id} - ${s.name}</option>`).join('');
  const canReusePreviewStaff = (data.staff || []).some((s) => s.id === payrollPreviewStaffId);
  const defaultStaffId = canReusePreviewStaff ? payrollPreviewStaffId : (data.staff?.[0]?.id || data.attendance?.[0]?.staffId || '');
  const selected = payrollPreviewArmed ? buildSelectedStaffPayrollPreview(data, defaultStaffId, cutoffAttendance) : null;
  const attendanceRows = data.attendance.map((a) => `
    <tr>
      <td>${a.staffId}</td>
      <td>${a.name}</td>
      <td>${a.timeIn}</td>
      <td>${a.timeOut}</td>
      <td>${Number(a.hours).toFixed(1)}</td>
      <td>${Number(a.ot).toFixed(1)}</td>
      <td>${Number(a.leave || 0).toFixed(1)}</td>
      <td>${statusBadge(a.status)}</td>
    </tr>
  `).join('');
  return `
    <div class="notice">Select cut-off date (15th or 30th), calculate payroll, then save payroll report.</div>
    <div class="split">
      <article class="card">
        <h3>Payroll Input</h3>
        <div class="mini-form">
          <label class="muted">Cut-Off Date</label>
          <select id="payroll-cutoff"><option value="15th">15th</option><option value="30th">30th</option></select>
          <label class="muted">Select Staff</label>
          <select id="payroll-staff-id">${staffOptions}</select>
          <div id="payroll-selected-summary" class="notice" style="margin:0">
            ${payrollPreviewArmed ? 'Payroll details for selected staff will appear here.' : 'Select cut-off and staff, then press Run Payroll Calculation to view payroll breakdown.'}
          </div>
          <div id="payroll-period-label" class="notice" style="margin:0"><strong>Active Payroll Period:</strong> ${periodLabel}</div>
          <button class="btn btn-primary" data-action="run-payroll">Run Payroll Calculation</button>
          <button class="btn btn-outline" data-action="save-payroll">Save Payroll to Database</button>
        </div>
      </article>
      <article class="card">
        <h3>Payroll Breakdown</h3>
        <div id="payroll-breakdown-body">${renderPayrollBreakdownHtml(selected)}</div>
      </article>
    </div>
    <article class="card" style="margin-top:12px">
      <h3>Retrieve Attendance Data</h3>
      <div id="payroll-retrieve-body">${renderPayrollRetrieveHtml(selected)}</div>
      <p class="muted" style="margin-top:8px">Source: Shared staff attendance records retrieved from clinic data.</p>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Calculate Payroll (By Designation)</h3>
      <div id="payroll-calc-body">${renderPayrollCalcHtml(selected)}</div>
      <p class="muted" style="margin-top:8px">Use "Run Payroll Calculation" to generate and store this as a payroll report.</p>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Staff Pay Calculation Details</h3>
      <p class="muted">Each staff pay is calculated from attendance + designation/job-based rates.</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Staff ID</th><th>Name</th><th>Designation</th><th>Hours</th><th>OT</th><th>On-Call</th><th>Leave</th><th>Regular Pay</th><th>OT Pay</th><th>On-Call Pay</th><th>Deductions</th><th>Gross Pay</th></tr></thead>
          <tbody id="payroll-staff-details-body">${renderPayrollStaffDetailRows(selected)}</tbody>
        </table>
      </div>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Generated Payroll Reports</h3>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Payroll ID</th><th>Cut-Off</th><th>Attendance</th><th>OT</th><th>On-Call</th><th>Deductions</th><th>Gross Pay</th><th>Status</th><th>Generated By</th><th>Created</th></tr></thead>
          <tbody>${(data.payrollRuns || []).map((r) => `<tr><td>${r.id}</td><td>${r.cutoff}</td><td>${Number(r.attendanceHours || 0).toFixed(1)}</td><td>${Number(r.approvedOt || 0).toFixed(1)}</td><td>${Number(r.onCallHours || 0).toFixed(1)}</td><td>₱${Number(r.deductions || 0).toLocaleString()}</td><td>₱${Number(r.grossPay || 0).toLocaleString()}</td><td>${statusBadge(r.status)}</td><td>${r.by || '—'}</td><td>${r.createdAt || '—'}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">No payroll reports generated yet.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Shared Attendance Source (All Roles)</h3>
      <p class="muted">HR can review real attendance, leave, and OT here before inputting payroll values. This is the same attendance data used by Supervisor and Manager views.</p>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Staff ID</th><th>Name</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>Leave</th><th>Status</th></tr></thead>
          <tbody>${attendanceRows || '<tr><td colspan="8" class="muted">No attendance records yet.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
  `;
}

function bindHrPayrollInputs(data) {
  const staffSelect = document.getElementById('payroll-staff-id');
  const summary = document.getElementById('payroll-selected-summary');
  const cutoffSelect = document.getElementById('payroll-cutoff');
  const periodLabelEl = document.getElementById('payroll-period-label');

  if (!staffSelect || !summary) return;

  const getCutoff = () => String(cutoffSelect?.value || '15th');

  const syncFromAttendance = () => {
    const cutoff = getCutoff();
    const cutoffAttendance = getPayrollCutoffAttendance(data, cutoff);

    if (periodLabelEl) {
      periodLabelEl.innerHTML = `<strong>Active Payroll Period:</strong> ${getPayrollPeriodLabel(data, cutoff, cutoffAttendance.length)}`;
    }

    if (payrollPreviewCutoff !== cutoff) {
      payrollPreviewArmed = false;
    }

    if (!payrollPreviewArmed) {
      summary.innerHTML = '<strong>Select cut-off and staff, then press Run Payroll Calculation to view payroll breakdown.</strong>';
      renderSelectedPayrollPanels(data, '', cutoffAttendance);
      return;
    }

    const item = buildSelectedStaffPayrollPreview(data, staffSelect.value, cutoffAttendance);
    if (!item) {
      summary.innerHTML = '<strong>No attendance details found for selected staff in this cut-off period.</strong>';
      renderSelectedPayrollPanels(data, '', cutoffAttendance);
      return;
    }

    summary.innerHTML = `<strong>${item.staffId} · ${item.name}</strong><br>Period Totals (${cutoff}): Hours ${Number(item.hours || 0).toFixed(1)} · OT ${Number(item.ot || 0).toFixed(1)} · On-Call ${Number(item.onCall || 0).toFixed(1)} · Leave ${Number(item.leave || 0).toFixed(1)}`;
    renderSelectedPayrollPanels(data, item.staffId, cutoffAttendance);
  };

  staffSelect.addEventListener('change', () => {
    payrollPreviewArmed = false;
    payrollPreviewStaffId = String(staffSelect.value || '');
    syncFromAttendance();
  });
  cutoffSelect?.addEventListener('change', () => {
    payrollPreviewArmed = false;
    payrollPreviewCutoff = String(cutoffSelect.value || '15th');
    syncFromAttendance();
  });
  syncFromAttendance();
}

function buildSelectedStaffPayrollPreview(data, staffId, attendanceRows = null) {
  const preview = buildDesignationPayrollPreview(data, attendanceRows);
  const row = preview.staffRows.find((x) => x.staffId === staffId) || null;
  if (!row) return null;
  return {
    ...row,
    ...getStaffAttendanceContext(data, staffId)
  };
}

function renderPayrollBreakdownHtml(row) {
  if (!row) return '<p class="muted">Select a staff member to view payroll breakdown.</p>';
  return `<div class="list">
    <div class="item"><strong>Staff</strong><span>${row.staffId} · ${row.name}</span></div>
    <div class="item"><strong>Designation</strong><span>${row.designation || 'General Staff'}</span></div>
    <div class="item"><strong>Attendance Hours</strong><span>${Number(row.hours || 0).toFixed(1)}</span></div>
    <div class="item"><strong>Approved OT Hours</strong><span>${Number(row.ot || 0).toFixed(1)}</span></div>
    <div class="item"><strong>On-Call Hours</strong><span>${Number(row.onCall || 0).toFixed(1)}</span></div>
    <div class="item"><strong>Approved Leave</strong><span>${Number(row.leave || 0).toFixed(1)}</span></div>
    <div class="item"><strong>Regular Pay</strong><span>₱${Number(row.regularPay || 0).toLocaleString()}</span></div>
    <div class="item"><strong>OT Pay</strong><span>₱${Number(row.otPay || 0).toLocaleString()}</span></div>
    <div class="item"><strong>On-Call Pay</strong><span>₱${Number(row.onCallPay || 0).toLocaleString()}</span></div>
    <div class="item"><strong>Deductions</strong><span>₱${Number(row.deductions || 0).toLocaleString()}</span></div>
    <div class="item"><strong>Gross Pay</strong><span><span class="badge badge-green">₱${Number(row.grossPay || 0).toLocaleString()}</span></span></div>
  </div>`;
}

function renderPayrollRetrieveHtml(row) {
  if (!row) return '<p class="muted">Select a staff member to retrieve attendance data.</p>';
  return `<div class="list">
    <div class="item"><strong>Attendance Hours</strong><span>${Number(row.hours || 0).toFixed(1)}</span></div>
    <div class="item"><strong>Approved OT</strong><span>${Number(row.ot || 0).toFixed(1)}</span></div>
    <div class="item"><strong>On-Call Hours</strong><span>${Number(row.onCall || 0).toFixed(1)}</span></div>
    <div class="item"><strong>Approved Leave</strong><span>${Number(row.leave || 0).toFixed(1)}</span></div>
    <div class="item"><strong>This Month Hours</strong><span>${Number(row.monthHours || 0).toFixed(1)}</span></div>
    <div class="item"><strong>This Month OT</strong><span>${Number(row.monthOt || 0).toFixed(1)}</span></div>
    <div class="item"><strong>This Year Hours</strong><span>${Number(row.yearHours || 0).toFixed(1)}</span></div>
    <div class="item"><strong>This Year OT</strong><span>${Number(row.yearOt || 0).toFixed(1)}</span></div>
  </div>`;
}

function renderPayrollCalcHtml(row) {
  if (!row) return '<p class="muted">Select a staff member to calculate payroll by designation.</p>';
  return `<div class="list">
    <div class="item"><strong>Regular Pay</strong><span>₱${Number(row.regularPay || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
    <div class="item"><strong>OT Pay</strong><span>₱${Number(row.otPay || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
    <div class="item"><strong>On-Call Pay</strong><span>₱${Number(row.onCallPay || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
    <div class="item"><strong>Deductions</strong><span>₱${Number(row.deductions || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
    <div class="item"><strong>Gross Pay</strong><span><span class="badge badge-green">₱${Number(row.grossPay || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></span></div>
  </div>`;
}

function renderPayrollStaffDetailRows(row) {
  if (!row) return '<tr><td colspan="12" class="muted">No staff payroll details available.</td></tr>';
  return `<tr><td>${row.staffId}</td><td>${row.name}</td><td>${row.designation || 'General Staff'}</td><td>${Number(row.hours || 0).toFixed(1)}</td><td>${Number(row.ot || 0).toFixed(1)}</td><td>${Number(row.onCall || 0).toFixed(1)}</td><td>${Number(row.leave || 0).toFixed(1)}</td><td>₱${Number(row.regularPay || 0).toLocaleString()}</td><td>₱${Number(row.otPay || 0).toLocaleString()}</td><td>₱${Number(row.onCallPay || 0).toLocaleString()}</td><td>₱${Number(row.deductions || 0).toLocaleString()}</td><td><span class="badge badge-green">₱${Number(row.grossPay || 0).toLocaleString()}</span></td></tr>`;
}

function renderSelectedPayrollPanels(data, staffId, attendanceRows = null) {
  const preview = buildDesignationPayrollPreview(data, attendanceRows);
  const row = preview.staffRows.find((x) => x.staffId === staffId) || null;
  const breakdownEl = document.getElementById('payroll-breakdown-body');
  const retrieveEl = document.getElementById('payroll-retrieve-body');
  const calcEl = document.getElementById('payroll-calc-body');
  const detailsEl = document.getElementById('payroll-staff-details-body');

  if (breakdownEl) breakdownEl.innerHTML = renderPayrollBreakdownHtml(row);
  if (retrieveEl) retrieveEl.innerHTML = renderPayrollRetrieveHtml(row);
  if (calcEl) calcEl.innerHTML = renderPayrollCalcHtml(row);
  if (detailsEl) detailsEl.innerHTML = renderPayrollStaffDetailRows(row);
}

function getPayrollReferenceYearMonth(attendance) {
  const valid = (attendance || [])
    .map((x) => String(x.date || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const dateText = valid.length ? valid[valid.length - 1] : new Date().toISOString().slice(0, 10);
  const dt = new Date(dateText);
  if (Number.isNaN(dt.getTime())) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: dt.getFullYear(), month: dt.getMonth() + 1 };
}

function getPayrollCutoffAttendance(data, cutoff) {
  const all = data.attendance || [];
  const { year, month } = getPayrollReferenceYearMonth(all);
  return all.filter((record) => {
    const dateVal = String(record.date || '').slice(0, 10);
    const dt = new Date(dateVal);
    if (!dateVal || Number.isNaN(dt.getTime())) return false;
    if (dt.getFullYear() !== year || (dt.getMonth() + 1) !== month) return false;
    if (String(cutoff) === '15th') return dt.getDate() <= 15;
    return dt.getDate() >= 16;
  });
}

function getPayrollPeriodLabel(data, cutoff, recordsUsed = 0) {
  const all = data.attendance || [];
  const { year, month } = getPayrollReferenceYearMonth(all);
  const monthName = new Date(year, month - 1, 1).toLocaleString(undefined, { month: 'long' });
  const windowLabel = String(cutoff) === '15th' ? 'Days 1-15' : 'Days 16-end';
  return `${monthName} ${year} · ${windowLabel} · Records used: ${recordsUsed}`;
}

function getStaffAttendanceContext(data, staffId) {
  const all = data.attendance || [];
  const { year, month } = getPayrollReferenceYearMonth(all);
  const mine = all.filter((record) => String(record.staffId || '') === String(staffId || ''));
  const monthRows = mine.filter((record) => {
    const dt = new Date(String(record.date || '').slice(0, 10));
    return !Number.isNaN(dt.getTime()) && dt.getFullYear() === year && (dt.getMonth() + 1) === month;
  });
  const yearRows = mine.filter((record) => {
    const dt = new Date(String(record.date || '').slice(0, 10));
    return !Number.isNaN(dt.getTime()) && dt.getFullYear() === year;
  });
  return {
    monthHours: monthRows.reduce((sum, row) => sum + Number(row.hours || 0), 0),
    monthOt: monthRows.reduce((sum, row) => sum + Number(row.ot || 0), 0),
    yearHours: yearRows.reduce((sum, row) => sum + Number(row.hours || 0), 0),
    yearOt: yearRows.reduce((sum, row) => sum + Number(row.ot || 0), 0)
  };
}

function getRatesByDesignation(designation) {
  const text = String(designation || '').toLowerCase();
  if (text.includes('senior physical therapist')) return { regular: 460, ot: 210, onCall: 160, deductionRate: 0.12 };
  if (text.includes('physical therapist') || text.includes('pt')) return { regular: 420, ot: 190, onCall: 145, deductionRate: 0.12 };
  if (text.includes('assistant')) return { regular: 320, ot: 145, onCall: 110, deductionRate: 0.10 };
  if (text.includes('rehab aide') || text.includes('aide')) return { regular: 260, ot: 120, onCall: 90, deductionRate: 0.08 };
  if (text.includes('front desk') || text.includes('admin')) return { regular: 280, ot: 120, onCall: 90, deductionRate: 0.09 };
  return { regular: 300, ot: 120, onCall: 90, deductionRate: 0.10 };
}

function buildDesignationPayrollPreview(data, attendanceRows = null) {
  const sourceAttendance = attendanceRows || (data.attendance || []);
  const staffIndex = Object.fromEntries((data.staff || []).map((s) => [s.id, s]));
  const aggregateByStaff = {};

  sourceAttendance.forEach((record) => {
    const staffId = String(record.staffId || '');
    if (!staffId) return;
    const staffMeta = staffIndex[staffId] || {};
    if (!aggregateByStaff[staffId]) {
      aggregateByStaff[staffId] = {
        staffId,
        name: record.name || staffMeta.name || staffId,
        designation: staffMeta.role || staffMeta.category || 'General Staff',
        hours: 0,
        ot: 0,
        onCall: 0,
        leave: 0
      };
    }
    aggregateByStaff[staffId].hours += Number(record.hours || 0);
    aggregateByStaff[staffId].ot += Number(record.ot || 0);
    aggregateByStaff[staffId].onCall += Number(record.onCall || 0);
    aggregateByStaff[staffId].leave += Number(record.leave || 0);
  });

  (data.staff || []).forEach((staff) => {
    if (!aggregateByStaff[staff.id]) {
      aggregateByStaff[staff.id] = {
        staffId: staff.id,
        name: staff.name || staff.id,
        designation: staff.role || staff.category || 'General Staff',
        hours: 0,
        ot: 0,
        onCall: 0,
        leave: 0
      };
    }
  });

  const staffRows = Object.values(aggregateByStaff)
    .map((row) => {
      const rates = getRatesByDesignation(row.designation);
      const rowRegular = row.hours * rates.regular;
      const rowOt = row.ot * rates.ot;
      const rowOnCall = row.onCall * rates.onCall;
      const rowDeductions = rowRegular * rates.deductionRate;
      const rowGross = rowRegular + rowOt + rowOnCall - rowDeductions;
      return {
        ...row,
        regularPay: rowRegular,
        otPay: rowOt,
        onCallPay: rowOnCall,
        deductions: rowDeductions,
        grossPay: rowGross
      };
    })
    .sort((a, b) => String(a.staffId).localeCompare(String(b.staffId)));

  const attendanceHours = staffRows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const approvedOt = staffRows.reduce((sum, row) => sum + Number(row.ot || 0), 0);
  const onCallHours = staffRows.reduce((sum, row) => sum + Number(row.onCall || 0), 0);
  const approvedLeave = staffRows.reduce((sum, row) => sum + Number(row.leave || 0), 0);
  const regularPay = staffRows.reduce((sum, row) => sum + Number(row.regularPay || 0), 0);
  const otPay = staffRows.reduce((sum, row) => sum + Number(row.otPay || 0), 0);
  const onCallPay = staffRows.reduce((sum, row) => sum + Number(row.onCallPay || 0), 0);
  const deductions = staffRows.reduce((sum, row) => sum + Number(row.deductions || 0), 0);

  return {
    attendanceHours,
    approvedOt,
    onCallHours,
    approvedLeave,
    regularPay,
    otPay,
    onCallPay,
    deductions,
    grossPay: regularPay + otPay + onCallPay - deductions,
    staffRows
  };
}

function filterAttendanceByView(attendance, viewMode) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const todayStr = today.toISOString().slice(0, 10);

  return (attendance || []).filter((record) => {
    const dateVal = String(record.date || '').slice(0, 10);
    const d = new Date(dateVal);
    if (!dateVal || Number.isNaN(d.getTime())) return false;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (viewMode === 'today') return dateVal === todayStr;
    if (viewMode === 'month') return y === currentYear && m === currentMonth;
    if (viewMode === 'year') return y === currentYear;
    return true;
  });
}

function buildAttendanceSummary(rows) {
  const total = rows.length;
  const present = rows.filter((r) => r.status === 'Present').length;
  const late = rows.filter((r) => r.status === 'Late').length;
  const leave = rows.filter((r) => r.status === 'On Leave' || Number(r.leave || 0) > 0).length;
  const hours = rows.reduce((sum, r) => sum + Number(r.hours || 0), 0);
  const ot = rows.reduce((sum, r) => sum + Number(r.ot || 0), 0);
  return { total, present, late, leave, hours, ot };
}

function renderAttendanceTableRows(rows, includeExtendedColumns = false) {
  const colSpan = includeExtendedColumns ? 11 : 9;
  if (!rows.length) return `<tr><td colspan="${colSpan}" class="muted">No attendance records for this view.</td></tr>`;
  return rows.map((a) => `
    <tr>
      <td>${a.staffId}</td>
      <td>
        <div><strong>${a.name}</strong></div>
        <div class="actions" style="margin-top:6px">
          <button class="btn btn-sm btn-outline" data-action="view-month-log" data-staff-id="${escapeHtml(String(a.staffId || ''))}" data-staff-name="${escapeHtml(String(a.name || ''))}">Month Log</button>
          <button class="btn btn-sm btn-outline" data-action="view-year-log" data-staff-id="${escapeHtml(String(a.staffId || ''))}" data-staff-name="${escapeHtml(String(a.name || ''))}">Year Log</button>
        </div>
      </td>
      <td>${a.department}</td>
      <td>${a.date}</td>
      <td>${a.timeIn}</td>
      <td>${a.timeOut}</td>
      <td>${Number(a.hours).toFixed(1)}</td>
      <td>${Number(a.ot).toFixed(1)}</td>
      ${includeExtendedColumns ? `<td>${Number(a.onCall || 0).toFixed(1)}</td><td>${Number(a.leave || 0).toFixed(1)}</td>` : ''}
      <td>${statusBadge(a.status)}</td>
    </tr>
  `).join('');
}

function applyAttendanceView(data, viewMode, options) {
  const {
    bodyId,
    summaryId,
    includeExtendedColumns = false,
    labelPrefix = ''
  } = options;
  const rows = filterAttendanceByView(data.attendance || [], viewMode);
  const summary = buildAttendanceSummary(rows);
  const body = document.getElementById(bodyId);
  const summaryEl = document.getElementById(summaryId);
  if (body) body.innerHTML = renderAttendanceTableRows(rows, includeExtendedColumns);
  if (summaryEl) {
    const label = viewMode === 'today' ? 'Today' : viewMode === 'month' ? 'This Month' : 'This Year';
    const prefix = labelPrefix ? `${labelPrefix} ` : '';
    summaryEl.innerHTML = `<strong>${prefix}${label} Summary:</strong> Records ${summary.total} · Present ${summary.present} · Late ${summary.late} · Leave ${summary.leave} · Hours ${summary.hours.toFixed(1)} · OT ${summary.ot.toFixed(1)}`;
  }
}

function bindAttendanceControls(data, options) {
  const { controlsId } = options;
  const root = document.getElementById(controlsId);
  if (!root) return;
  root.querySelectorAll('[data-attendance-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-attendance-view]').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      applyAttendanceView(data, btn.dataset.attendanceView, options);
    });
  });
  applyAttendanceView(data, 'today', options);
}

function bindHrAttendanceControls(data) {
  bindAttendanceControls(data, {
    controlsId: 'hr-attendance-controls',
    bodyId: 'hr-attendance-body',
    summaryId: 'hr-attendance-summary',
    includeExtendedColumns: true,
    labelPrefix: 'HR'
  });
}

function bindSupervisorAttendanceControls(data) {
  bindAttendanceControls(data, {
    controlsId: 'sup-attendance-controls',
    bodyId: 'sup-attendance-body',
    summaryId: 'sup-attendance-summary',
    includeExtendedColumns: false,
    labelPrefix: 'Supervisor'
  });
}

function bindManagerAttendanceControls(data) {
  bindAttendanceControls(data, {
    controlsId: 'mgr-attendance-controls',
    bodyId: 'mgr-attendance-body',
    summaryId: 'mgr-attendance-summary',
    includeExtendedColumns: false,
    labelPrefix: 'Manager'
  });
}

function filterAttendanceByStaffAndMode(attendance, staffId, viewMode) {
  const scoped = (attendance || []).filter((x) => String(x.staffId || '') === String(staffId || ''));
  const validDates = scoped
    .map((x) => String(x.date || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const anchorText = validDates.length ? validDates[validDates.length - 1] : new Date().toISOString().slice(0, 10);
  const anchor = new Date(anchorText);
  const anchorYear = Number.isNaN(anchor.getTime()) ? new Date().getFullYear() : anchor.getFullYear();
  const anchorMonth = Number.isNaN(anchor.getTime()) ? (new Date().getMonth() + 1) : (anchor.getMonth() + 1);

  const filtered = scoped.filter((record) => {
    const dt = new Date(String(record.date || '').slice(0, 10));
    if (Number.isNaN(dt.getTime())) return false;
    if (viewMode === 'year') return dt.getFullYear() === anchorYear;
    return dt.getFullYear() === anchorYear && (dt.getMonth() + 1) === anchorMonth;
  });

  return filtered.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function attendanceLogTableHtml(rows) {
  if (!rows.length) return '<tr><td colspan="8" class="muted">No attendance logs found for this period.</td></tr>';
  return rows.map((a) => `
    <tr>
      <td>${a.date}</td>
      <td>${a.timeIn}</td>
      <td>${a.timeOut}</td>
      <td>${Number(a.hours || 0).toFixed(1)}</td>
      <td>${Number(a.ot || 0).toFixed(1)}</td>
      <td>${Number(a.onCall || 0).toFixed(1)}</td>
      <td>${Number(a.leave || 0).toFixed(1)}</td>
      <td>${statusBadge(a.status)}</td>
    </tr>
  `).join('');
}

function attendanceMonthRollupHtml(rows) {
  const grouped = {};
  rows.forEach((row) => {
    const dateVal = String(row.date || '').slice(0, 10);
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) {
      grouped[key] = { records: 0, hours: 0, ot: 0, leave: 0 };
    }
    grouped[key].records += 1;
    grouped[key].hours += Number(row.hours || 0);
    grouped[key].ot += Number(row.ot || 0);
    grouped[key].leave += Number(row.leave || 0);
  });

  const keys = Object.keys(grouped).sort().reverse();
  if (!keys.length) return '<tr><td colspan="5" class="muted">No monthly rollup available.</td></tr>';
  return keys.map((key) => {
    const item = grouped[key];
    return `<tr><td>${key}</td><td>${item.records}</td><td>${item.hours.toFixed(1)}</td><td>${item.ot.toFixed(1)}</td><td>${item.leave.toFixed(1)}</td></tr>`;
  }).join('');
}

function openAttendanceLogModal(staffId, staffName, mode) {
  const overlay = document.getElementById('app-modal');
  const form = document.getElementById('modal-form');
  const fields = document.getElementById('modal-fields');
  const title = mode === 'year' ? 'Whole Year Attendance Log' : 'Whole Month Attendance Log';
  const rows = filterAttendanceByStaffAndMode(currentData?.attendance || [], staffId, mode);
  const summary = buildAttendanceSummary(rows);
  const monthRollup = mode === 'year'
    ? `
      <div class="tbl-wrap" style="margin-top:10px">
        <table class="tbl">
          <thead>
            <tr><th>Month</th><th>Records</th><th>Hours</th><th>OT</th><th>Leave</th></tr>
          </thead>
          <tbody>${attendanceMonthRollupHtml(rows)}</tbody>
        </table>
      </div>
    `
    : '';
  const detailTable = mode === 'year'
    ? ''
    : `
      <div class="tbl-wrap" style="margin-top:10px">
        <table class="tbl">
          <thead>
            <tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>On-Call</th><th>Leave</th><th>Status</th></tr>
          </thead>
          <tbody>${attendanceLogTableHtml(rows)}</tbody>
        </table>
      </div>
    `;

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-subtitle').textContent = `${staffName} (${staffId})`;
  document.getElementById('modal-submit-btn').textContent = 'Close';
  form.dataset.mode = 'attendance-log';

  fields.innerHTML = `
    <div class="notice"><strong>Summary:</strong> Records ${summary.total} · Present ${summary.present} · Late ${summary.late} · Leave ${summary.leave} · Hours ${summary.hours.toFixed(1)} · OT ${summary.ot.toFixed(1)}</div>
    ${monthRollup}
    ${detailTable}
  `;

  overlay.classList.remove('hidden');
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function hrAttendanceHtml(data) {
  const todayRows = filterAttendanceByView(data.attendance || [], 'today');
  const rows = renderAttendanceTableRows(todayRows, true);
  return `<article class="card"><h3>HR Attendance View</h3><p class="muted">Today attendance is shown below. To manage full monthly or yearly logs, use <strong>Month Log</strong> or <strong>Year Log</strong> beside each staff name.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff ID</th><th>Name</th><th>Department</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>On-Call</th><th>Leave</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function hrStaffHtml(data) {
  const ptDesignationOptions = ['Physical Therapist', 'Senior Physical Therapist', 'PT Assistant', 'Rehab Aide'];
  const designationOptions = ptDesignationOptions.map((d) => `<option value="${d}">${d}</option>`).join('');
  const staffLinkOptions = (data.staff || []).map((staff) => `<option value="${staff.id}">${staff.id} — ${staff.name}</option>`).join('');
  const rows = data.staff.map((staff) => `
    <tr>
      <td>${staff.id}</td><td>${staff.name}</td><td>${staff.category}</td><td>${staff.department}</td><td>${staff.role}</td><td>${staff.credentials}</td>
      <td>${staff.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
      <td><button class="btn btn-sm btn-outline" data-action="edit-staff" data-id="${staff.id}">Edit</button> <button class="btn btn-sm btn-outline" data-action="toggle-staff" data-id="${staff.id}">${staff.active ? 'Deactivate' : 'Activate'}</button> <button class="btn btn-sm btn-danger" data-action="delete-staff" data-id="${staff.id}">Delete</button></td>
    </tr>
  `).join('');
  const statusLogs = (data.staffStatusLogs || []).map((log) => `
    <tr>
      <td>${log.at}</td>
      <td>${log.staffId}</td>
      <td>${log.staffName}</td>
      <td>${log.action}</td>
      <td>${log.status}</td>
      <td>${log.by}</td>
    </tr>
  `).join('');
  return `
    <div class="split">
      <article class="card">
        <h3>Register Medical Staff</h3>
        <form id="register-staff-form" class="mini-form">
          <input name="name" placeholder="Full name" required />
          <select name="category" required><option>Physical Therapists</option><option>PT Assistants</option><option>Rehab Aides</option><option>Front Desk/Admin</option></select>
          <input name="department" placeholder="Department" required />
          <input name="role" placeholder="Assigned Role" required />
          <input name="credentials" placeholder="Credentials" required />
          <button class="btn btn-primary" type="submit">Register New Staff</button>
        </form>
      </article>
      <article class="card">
        <h3>Create PT Staff Login Account</h3>
        <form id="create-ptstaff-user-form" class="mini-form">
          <input name="full_name" placeholder="Full name" required />
          <input name="email" type="email" placeholder="Email address" required />
          <label class="muted">Link to Medical Staff Record</label>
          <select name="staff_id" required>${staffLinkOptions}</select>
          <label class="muted">Designation</label>
          <select name="designation" required>${designationOptions}</select>
          <input name="password" type="password" placeholder="Temporary password" required />
          <button class="btn btn-primary" type="submit">Create PT Staff User</button>
        </form>
        <p class="muted">This account is automatically assigned to PT Staff interface only.</p>
      </article>
      <article class="card"><h3>Medical Staff Accounts</h3><p class="muted">Use Edit, Activate/Deactivate, or Delete to maintain staff accounts.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Department</th><th>Role</th><th>Credentials</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></article>
    </div>
    <article class="card" style="margin-top:12px"><h3>Medical Staff Account Status Log</h3><p class="muted">Every status update is logged with timestamp and actor.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Staff ID</th><th>Name</th><th>Action</th><th>Updated Status</th><th>Updated By</th></tr></thead><tbody>${statusLogs || '<tr><td colspan="6" class="muted">No status changes logged yet.</td></tr>'}</tbody></table></div></article>
  `;
}

function supervisorAttendanceHtml(data) {
  const todayRows = filterAttendanceByView(data.attendance || [], 'today');
  const rows = renderAttendanceTableRows(todayRows, false);
  return `<article class="card"><h3>Display Attendance Records</h3><p class="muted">Today attendance is shown below. Use the staff name buttons to open full monthly/yearly logs.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff ID</th><th>Name</th><th>Department</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function supervisorRequestsHtml(data) {
  const queue = data.requests.filter((r) => ['Leave', 'OT', 'Shift Change'].includes(r.type));
  const rows = queue.map((r) => `
    <div class="item item-block"><div><strong>${r.employee} — ${r.type}</strong><br><span>${r.details}</span><br><span>Reason: ${r.reason}</span><br><span>Status: ${statusBadge(r.status)} ${r.decidedBy ? `· by ${r.decidedBy}` : ''}</span></div><div class="actions">${r.status === 'Pending' ? `<button class="btn btn-primary btn-sm" data-action="approve-request" data-id="${r.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="reject-request" data-id="${r.id}">Reject</button>` : ''}</div></div>
  `).join('');
  return `<article class="card"><h3>View Pending Requests</h3><div class="list">${rows}</div></article>`;
}

function managerAttendanceHtml(data) {
  const todayRows = filterAttendanceByView(data.attendance || [], 'today');
  const rows = renderAttendanceTableRows(todayRows, false);
  return `<article class="card"><h3>Display Staff Attendance</h3><p class="muted">Today attendance is shown below. Use <strong>Month Log</strong> / <strong>Year Log</strong> beside each staff name for full logs.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Staff ID</th><th>Name</th><th>Department</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Hours</th><th>OT</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

function managerSummariesHtml() {
  return `<div class="grid"><article class="card"><h3>Patient Caseload</h3><div class="kpi">46</div></article><article class="card"><h3>Therapist Performance</h3><div class="kpi">4.7</div></article><article class="card"><h3>Resource Usage</h3><div class="kpi">78%</div></article><article class="card"><h3>Treatment Outcomes</h3><div class="kpi">92%</div></article></div>`;
}

function managerReportsHtml(data) {
  const queue = data.reports.filter((r) => r.status === 'Pending Manager Review' || r.status === 'Returned for Revision');
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.title}</strong><br><span>${r.category} · ${r.submittedBy}</span><br><span>Status: ${statusBadge(r.status)}</span></div><div class="actions">${r.status === 'Pending Manager Review' ? `<button class="btn btn-primary btn-sm" data-action="mgr-approve-report" data-id="${r.id}">Sign & Approve</button><button class="btn btn-danger btn-sm" data-action="mgr-return-report" data-id="${r.id}">Return</button>` : ''}</div></div>`).join('');
  return `<article class="card"><h3>Review Therapy Reports</h3><div class="list">${rows || '<p class="muted">No reports awaiting manager action.</p>'}</div></article>`;
}

function superAdminDataHtml(data) {
  return `<div class="grid"><article class="card"><h3>Patient Caseload Records</h3><div class="kpi">1,482</div></article><article class="card"><h3>Staff Data</h3><div class="kpi">${data.staff.length}</div></article><article class="card"><h3>Financial Data</h3><div class="kpi">₱4.2M</div></article><article class="card"><h3>System Logs</h3><div class="kpi">${data.auditLogs.length}</div></article></div>`;
}

function superAdminGenerateHtml(data) {
  const rows = data.generatedHospitalReports.map((r) => `<tr><td>${r.name || '—'}</td><td>${r.reportType || '—'}</td><td>${r.department || '—'}</td><td>${r.periodStart || '—'} to ${r.periodEnd || '—'}</td><td>${r.notes || '—'}</td><td>${r.generatedBy}</td><td>${r.createdAt}</td><td><button class="btn btn-sm btn-danger" data-action="delete-generated-report" data-id="${r.id}">Delete</button></td></tr>`).join('');
  return `<article class="card"><h3>Generate Comprehensive Reports</h3><div class="mini-form"><input id="gen-report-name" placeholder="Report name (e.g. March Clinic Operations Bundle)" required /><select id="gen-report-type"><option value="Operational">Operational</option><option value="Financial">Financial</option><option value="Clinical Outcomes">Clinical Outcomes</option><option value="Compliance">Compliance</option></select><input id="gen-report-department" placeholder="Department (e.g. Orthopedic Rehabilitation)" required /><label class="muted">Period Start</label><input id="gen-report-start" type="date" required /><label class="muted">Period End</label><input id="gen-report-end" type="date" required /><textarea id="gen-report-notes" rows="3" placeholder="Additional details or purpose of this report"></textarea><button class="btn btn-primary" data-action="generate-clinic-report">Generate PT Clinic Report Bundle</button></div><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Report Name</th><th>Type</th><th>Department</th><th>Period</th><th>Notes</th><th>Generated By</th><th>Date</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="muted">No generated reports yet.</td></tr>'}</tbody></table></div></article>`;
}

function superAdminSystemHtml(data) {
  const ptStaffAppUrl = String(localStorage.getItem(PTSTAFF_APP_URL_KEY) || '');
  const rows = (data.users || []).map((u) => `<tr><td>${u.id}</td><td>${u.full_name}</td><td>${u.email}</td><td>${roleLabel(u.role)}</td><td>${u.is_active ? 'Active' : 'Inactive'}</td><td><button class="btn btn-sm btn-outline" data-action="edit-user" data-id="${u.id}">Edit</button> <button class="btn btn-sm btn-outline" data-action="toggle-user" data-id="${u.id}">${u.is_active ? 'Deactivate' : 'Activate'}</button> <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}">Delete</button></td></tr>`).join('');
  const roleOptions = ROLE_OPTIONS.map((r) => `<option value="${r}">${roleLabel(r)}</option>`).join('');
  return `<div class="split"><article class="card"><h3>Create Login User</h3><form id="create-user-form" class="mini-form"><input name="full_name" placeholder="Full name" required><input name="email" type="email" placeholder="Email address" required><select name="role" required>${roleOptions}</select><input name="password" type="password" placeholder="Temporary password" required><button class="btn btn-primary" type="submit">Create User</button></form><button style="margin-top:10px" class="btn btn-outline" data-action="reset-demo-data">Reset Demo Data</button><hr style="margin:12px 0;border:0;border-top:1px solid #dbe1ec" /><h3>PT Staff App Integration</h3><p class="muted">Set teammate PT Staff frontend URL for handoff after PT Staff login.</p><div class="mini-form"><input id="ptstaff-app-url-input" type="url" placeholder="https://your-ptstaff-app.example.com" value="${escapeHtml(ptStaffAppUrl)}" /><button class="btn btn-primary" data-action="save-ptstaff-app-url">Save PT Staff App URL</button><button class="btn btn-outline" data-action="clear-ptstaff-app-url">Use Local PT Staff Placeholder</button></div></article><article class="card"><h3>All Login Users & Roles</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></article></div>`;
}

function roleLabel(roleKey) {
  return USERS[roleKey]?.roleLabel || roleKey;
}

function superAdminRequestsHtml(data) {
  const queue = data.requests.filter((r) => r.status === 'Pending');
  const adminQueue = data.adminChangeRequests || [];
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.type}: ${r.employee}</strong><br><span>${r.details}</span><br><span>Reason: ${r.reason}</span></div><div class="actions"><button class="btn btn-primary btn-sm" data-action="approve-request" data-id="${r.id}">Approve</button><button class="btn btn-danger btn-sm" data-action="reject-request" data-id="${r.id}">Reject</button></div></div>`).join('');
  const adminRows = adminQueue.map((r) => `<div class="item item-block"><div><strong>${r.summary}</strong><br><span>ID: ${r.id}</span><br><span>Changed By: ${r.requestedBy} (${roleLabel(r.requestedRole)})</span><br><span>Status: ${statusBadge(r.status)}</span></div></div>`).join('');
  return `<div class="split"><article class="card"><h3>Review All Pending Requests</h3><div class="list">${rows || '<p class="muted">No pending requests.</p>'}</div></article><article class="card"><h3>Admin Change Notifications</h3><div class="list">${adminRows || '<p class="muted">No admin changes yet.</p>'}</div></article></div>`;
}

function superAdminReportsHtml(data) {
  const queue = data.reports.filter((r) => r.status === 'Pending Final Approval');
  const rows = queue.map((r) => `<div class="item item-block"><div><strong>${r.title}</strong><br><span>${r.category} · ${r.submittedBy}</span><br><span>Manager Sign: ${r.managerSign || '—'}</span></div><div class="actions"><button class="btn btn-primary btn-sm" data-action="sa-final-approve-report" data-id="${r.id}">Final Sign & Approve</button></div></div>`).join('');
  return `<article class="card"><h3>Review All Pending Reports</h3><div class="list">${rows || '<p class="muted">No reports awaiting final approval.</p>'}</div></article>`;
}

function statusBadge(status) {
  if (status === 'Approved' || status === 'Present' || status === 'Final Approved' || status === 'Saved' || status === 'Notified') return '<span class="badge badge-green">' + status + '</span>';
  if (status === 'Rejected' || status === 'Absent') return '<span class="badge badge-red">' + status + '</span>';
  return '<span class="badge badge-yellow">' + status + '</span>';
}

async function apiFetch(path, options = {}, auth = true) {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error('Backend API is not configured for this deployment. Add ?apiBase=https://your-backend-domain to the URL once, then reload.');
  }

  const headers = { ...(options.headers || {}) };
  if (auth && activeSession?.token) headers.Authorization = `Bearer ${activeSession.token}`;

  const res = await fetch(`${apiBase}${path}`, { ...options, headers });
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

function bootstrapApiBaseFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const apiBase = String(params.get('apiBase') || '').trim();
    if (!apiBase) return;
    localStorage.setItem(API_BASE_KEY, apiBase);
  } catch (_e) {
  }
}

function resolveApiBase() {
  const fromWindow = String(window.CLINIC_API_BASE || '').trim();
  const fromStorage = String(localStorage.getItem(API_BASE_KEY) || '').trim();
  const raw = fromWindow || fromStorage;

  if (!raw) {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host.endsWith('github.io')) {
      return '';
    }
    return API_BASE;
  }

  const normalized = raw.replace(/\/+$/, '');
  if (/\/api$/i.test(normalized)) return normalized;
  return `${normalized}/api`;
}

function showError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('login-error').classList.add('hidden');
}

function bindModal() {
  const overlay = document.getElementById('app-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const form = document.getElementById('modal-form');

  const closeModal = (value) => {
    overlay.classList.add('hidden');
    document.getElementById('modal-fields').innerHTML = '';
    if (modalResolver) {
      modalResolver(value);
      modalResolver = null;
    }
  };

  closeBtn.addEventListener('click', () => closeModal(null));
  cancelBtn.addEventListener('click', () => closeModal(null));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(null);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = form.dataset.mode;

    if (mode === 'reason') {
      const value = String(document.getElementById('modal-reason-input')?.value || '').trim();
      const required = form.dataset.required === 'true';
      if (required && !value) {
        alert('Please provide a reason/comment.');
        return;
      }
      closeModal(value);
      return;
    }

    if (mode === 'user-edit') {
      const payload = {};
      const fullName = String(document.getElementById('modal-user-name')?.value || '').trim();
      const role = String(document.getElementById('modal-user-role')?.value || '').trim().toLowerCase();
      const password = String(document.getElementById('modal-user-password')?.value || '').trim();
      const originalName = String(form.dataset.originalName || '');
      const originalRole = String(form.dataset.originalRole || '');

      if (fullName && fullName !== originalName) payload.full_name = fullName;
      if (role && role !== originalRole) payload.role = role;
      if (password) payload.password = password;

      closeModal(payload);
      return;
    }

    if (mode === 'staff-edit') {
      const payload = {};
      const name = String(document.getElementById('modal-staff-name')?.value || '').trim();
      const category = String(document.getElementById('modal-staff-category')?.value || '').trim();
      const department = String(document.getElementById('modal-staff-department')?.value || '').trim();
      const role = String(document.getElementById('modal-staff-role')?.value || '').trim();
      const credentials = String(document.getElementById('modal-staff-credentials')?.value || '').trim();

      if (name && name !== String(form.dataset.originalName || '')) payload.name = name;
      if (category && category !== String(form.dataset.originalCategory || '')) payload.category = category;
      if (department && department !== String(form.dataset.originalDepartment || '')) payload.department = department;
      if (role && role !== String(form.dataset.originalRole || '')) payload.role = role;
      if (credentials && credentials !== String(form.dataset.originalCredentials || '')) payload.credentials = credentials;

      closeModal(payload);
      return;
    }

    if (mode === 'attendance-log') {
      closeModal(null);
    }
  });
}

function openReasonModal({ title, subtitle, label, placeholder, submitLabel, required }) {
  const overlay = document.getElementById('app-modal');
  const form = document.getElementById('modal-form');
  const fields = document.getElementById('modal-fields');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-subtitle').textContent = subtitle || '';
  document.getElementById('modal-submit-btn').textContent = submitLabel || 'Submit';
  form.dataset.mode = 'reason';
  form.dataset.required = required ? 'true' : 'false';
  fields.innerHTML = `
    <div class="modal-field">
      <label>${label}</label>
      <textarea id="modal-reason-input" rows="4" placeholder="${placeholder || ''}"></textarea>
    </div>
  `;
  overlay.classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('modal-reason-input')?.focus();
  }, 0);
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function openUserEditModal(user) {
  const overlay = document.getElementById('app-modal');
  const form = document.getElementById('modal-form');
  const fields = document.getElementById('modal-fields');
  const roleOptions = ROLE_OPTIONS.map((r) => `<option value="${r}" ${r === user.role ? 'selected' : ''}>${roleLabel(r)}</option>`).join('');

  document.getElementById('modal-title').textContent = 'Edit User Details';
  document.getElementById('modal-subtitle').textContent = `Update account details for ${user.email}`;
  document.getElementById('modal-submit-btn').textContent = 'Save Changes';
  form.dataset.mode = 'user-edit';
  form.dataset.originalName = user.full_name;
  form.dataset.originalRole = user.role;

  fields.innerHTML = `
    <div class="modal-field">
      <label>Full Name</label>
      <input id="modal-user-name" type="text" value="${escapeHtml(user.full_name)}" required />
    </div>
    <div class="modal-field">
      <label>Email</label>
      <input type="text" value="${escapeHtml(user.email)}" disabled />
    </div>
    <div class="modal-field">
      <label>Role</label>
      <select id="modal-user-role">${roleOptions}</select>
    </div>
    <div class="modal-field">
      <label>New Password (Optional)</label>
      <input id="modal-user-password" type="password" placeholder="Leave blank to keep current password" />
    </div>
  `;
  overlay.classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('modal-user-name')?.focus();
  }, 0);
  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function openStaffEditModal(staff) {
  const overlay = document.getElementById('app-modal');
  const form = document.getElementById('modal-form');
  const fields = document.getElementById('modal-fields');

  document.getElementById('modal-title').textContent = 'Edit Medical Staff Account';
  document.getElementById('modal-subtitle').textContent = `Update staff details for ${staff.id}`;
  document.getElementById('modal-submit-btn').textContent = 'Save Staff Changes';
  form.dataset.mode = 'staff-edit';
  form.dataset.originalName = staff.name || '';
  form.dataset.originalCategory = staff.category || '';
  form.dataset.originalDepartment = staff.department || '';
  form.dataset.originalRole = staff.role || '';
  form.dataset.originalCredentials = staff.credentials || '';

  fields.innerHTML = `
    <div class="modal-field">
      <label>Staff ID</label>
      <input type="text" value="${escapeHtml(staff.id)}" disabled />
    </div>
    <div class="modal-field">
      <label>Full Name</label>
      <input id="modal-staff-name" type="text" value="${escapeHtml(staff.name)}" required />
    </div>
    <div class="modal-field">
      <label>Category</label>
      <input id="modal-staff-category" type="text" value="${escapeHtml(staff.category)}" required />
    </div>
    <div class="modal-field">
      <label>Department</label>
      <input id="modal-staff-department" type="text" value="${escapeHtml(staff.department)}" required />
    </div>
    <div class="modal-field">
      <label>Role / Designation</label>
      <input id="modal-staff-role" type="text" value="${escapeHtml(staff.role)}" required />
    </div>
    <div class="modal-field">
      <label>Credentials</label>
      <input id="modal-staff-credentials" type="text" value="${escapeHtml(staff.credentials)}" required />
    </div>
  `;

  overlay.classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('modal-staff-name')?.focus();
  }, 0);

  return new Promise((resolve) => {
    modalResolver = resolve;
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
