export function LegacyPortal() {
  return (
    <>
      <section id="login-screen" className="login-screen">
        <div className="login-card">
          <div className="brand">
            <img src="/assets/summit-logo.png" alt="Summit PT Clinic Logo" className="brand-logo" />
            <div>
              <h1>SUMMIT PT CLINIC</h1>
              <p>Physical Therapy Clinic Admin Access</p>
            </div>
          </div>

          <h2>Sign In</h2>
          <p className="subtitle">Secure login with backend role-based authorization</p>

          <div id="login-error" className="error hidden"></div>

          <form id="login-form" className="form" autoComplete="on">
            <label>
              Email
              <input
                id="login-email"
                type="email"
                placeholder="Email address"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                inputMode="email"
                maxLength={120}
                required
              />
            </label>
            <label>
              Password
              <div className="password-input-wrap">
                <input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  minLength={4}
                  maxLength={128}
                  required
                />
                <button
                  id="toggle-login-password"
                  className="btn btn-outline btn-sm password-toggle-btn"
                  type="button"
                  aria-controls="login-password"
                  aria-label="Show password"
                  aria-pressed="false"
                  title="Show password"
                >
                  <img className="eye-icon eye-open hidden" src="/assets/eye-open.svg" alt="" aria-hidden="true" />
                  <img className="eye-icon eye-off" src="/assets/eye-off.svg" alt="" aria-hidden="true" />
                </button>
              </div>
            </label>
            <button type="submit" className="btn btn-primary full">Sign In</button>
          </form>
        </div>
      </section>

      <section id="app" className="app hidden">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <img src="/assets/summit-logo.png" alt="Summit PT Clinic Logo" className="sidebar-logo" />
            <h3>SUMMIT PT CLINIC</h3>
            <p id="portal-label">Portal</p>
          </div>
          <nav id="nav-list" className="nav-list"></nav>
          <div className="sidebar-footer">
            <div>
              <strong id="user-name">User</strong>
              <p id="user-role">Role</p>
            </div>
            <button id="logout-btn" className="btn btn-outline">Logout</button>
          </div>
        </aside>

        <main className="content">
          <header className="topbar">
            <h2 id="screen-title">Dashboard</h2>
            <div className="topbar-actions">
              <span id="data-sync-label" className="sync-label">Data not synced yet</span>
              <button id="refresh-data-btn" className="btn btn-outline btn-sm" type="button">Refresh Data</button>
            </div>
          </header>
          <section id="screen-main" className="screen active"></section>
        </main>
      </section>

      <section id="app-modal" className="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-panel">
          <div className="modal-header">
            <h3 id="modal-title">Action</h3>
            <button id="modal-close-btn" className="btn btn-outline btn-sm" type="button">Close</button>
          </div>
          <p id="modal-subtitle" className="muted"></p>
          <form id="modal-form" className="mini-form">
            <div id="modal-fields"></div>
            <div className="modal-actions">
              <button id="modal-cancel-btn" className="btn btn-outline" type="button">Cancel</button>
              <button id="modal-submit-btn" className="btn btn-primary" type="submit">Submit</button>
            </div>
          </form>
        </div>
      </section>

      <div id="toast-container" className="toast-container" aria-live="polite" aria-atomic="true"></div>
    </>
  );
}
