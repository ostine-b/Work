// ===== API HELPER =====
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('hostel_token');
}

function getUser() {
  const u = localStorage.getItem('hostel_user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('hostel_token', token);
  localStorage.setItem('hostel_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('hostel_token');
  localStorage.removeItem('hostel_user');
}

function requireAuth(role) {
  const user = getUser();
  const token = getToken();
  if (!user || !token) {
    const loginPage =
      role === 'manager' ? '/pages/manager-login.html' :
      role === 'admin'   ? '/pages/admin-login.html' :
                           '/pages/student-login.html';
    window.location.href = loginPage;
    return false;
  }
  if (role && user.role !== role) {
    // Send the user to their own dashboard rather than bouncing to home.
    const ownDash =
      user.role === 'manager' ? '/pages/manager-dashboard.html' :
      user.role === 'admin'   ? '/pages/admin-dashboard.html' :
                                '/pages/student-dashboard.html';
    alert(`This page is for ${role}s only.`);
    window.location.href = ownDash;
    return false;
  }
  return true;
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
    body: options.body instanceof FormData
      ? options.body
      : options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 || res.status === 403) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) { clearAuth(); window.location.href = '/index.html'; }
    throw new Error(err.error || 'Unauthorised');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Convenience methods
const api = {
  get:    (path)          => apiFetch(path, { method: 'GET' }),
  post:   (path, body)    => apiFetch(path, { method: 'POST', body }),
  put:    (path, body)    => apiFetch(path, { method: 'PUT',  body }),
  delete: (path)          => apiFetch(path, { method: 'DELETE' }),
  upload: (path, formData, method = 'POST') => apiFetch(path, { method, body: formData })
};

// ===== UI HELPERS =====
function showAlert(container, message, type = 'danger') {
  const icons = { success: '✅', danger: '❌', info: 'ℹ️', warning: '⚠️' };
  container.innerHTML = `<div class="alert alert-${type}">${icons[type] || ''} ${message}</div>`;
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearAlert(container) { container.innerHTML = ''; }

function setLoading(btn, loading, text = '') {
  if (loading) {
    btn.disabled = true;
    btn._originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${text || 'Please wait...'}`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._originalText || text;
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(amount);
}

function avatarInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function updateNavbar() {
  const user = getUser();
  const navUser = document.getElementById('nav-user');
  const navLogin = document.getElementById('nav-login');
  const navDash  = document.getElementById('nav-dashboard');
  const navLogout= document.getElementById('nav-logout');

  if (!navUser) return;

  if (user) {
    navUser.textContent = `${user.role === 'admin' ? '⚙️' : '👋'} ${user.name}`;
    if (navLogin)  navLogin.classList.add('hidden');
    if (navDash)  {
      navDash.classList.remove('hidden');
      navDash.href =
        user.role === 'manager' ? '/pages/manager-dashboard.html' :
        user.role === 'admin'   ? '/pages/admin-dashboard.html' :
                                  '/pages/student-dashboard.html';
    }
    if (navLogout) navLogout.classList.remove('hidden');
  } else {
    navUser.textContent = '';
    if (navLogin)  navLogin.classList.remove('hidden');
    if (navDash)   navDash.classList.add('hidden');
    if (navLogout) navLogout.classList.add('hidden');
  }
}

function logout() {
  clearAuth();
  window.location.href = '/index.html';
}
