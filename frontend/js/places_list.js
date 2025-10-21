import { API_BASE } from './config.js';

const cardGrid = document.getElementById('placesCardGrid');
const searchInput = document.getElementById('searchInput');
const typeSelect = document.getElementById('typeFilter');
const countLabel = document.getElementById('countLabel');

let categories = [];
let id = 0;

async function adminEnsure() {
  try {
    const secret = sessionStorage.getItem('adminSecret') || '';
    const res = await fetch(`${API_BASE}/admin_check`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': secret },
    });
    if (!res.ok) throw new Error('unauthorized');
  } catch (e) {
    alert('Админ эрх шаардлагатай. Нэвтэрч орно уу.');
    location.href = '/';
    throw e;
  }
}
async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    const cats = await res.json();
    categories = (cats || []).filter(c => c !== 'bus_stop');
    if (typeSelect) {
      typeSelect.innerHTML =
        '<option value="">Бүгд</option>' +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  } catch (e) {
    console.error('Категори ачаалах алдаа:', e);
    if (typeSelect) {
      typeSelect.innerHTML = '<option value="">Бүгд</option>';
    }
  }
}

function renderRows(features) {
  cardGrid.innerHTML = '';
  id = 0;

  if (!features || features.length === 0) {
    cardGrid.innerHTML =
      '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:#6b7280;">Газар олдсонгүй</div>';
    if (countLabel) countLabel.textContent = 'Нийт: 0';
    return;
  }

  features.forEach(f => {
    id++;
    const p = f.properties || {};
    const coords = (f.geometry && f.geometry.coordinates) || [null, null];

    const card = document.createElement('div');
    card.className = 'place-card';
    card.style.cssText = `
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    `;

    card.innerHTML = `
      <div style="position:relative; height:180px; background:#e5e7eb; overflow:hidden;">
        ${
          p.image_url
            ? `<img src="${p.image_url}" alt="${escapeHtml(
                p.name || ''
              )}" style="width:100%; height:100%; object-fit:cover;">`
            : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#9ca3af; font-size:48px;">🖼️</div>`
        }
        <div style="position:absolute; top:12px; right:12px; background:rgba(255,255,255,0.95); padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600; color:#059669;">
          ${p.type ? escapeHtml(p.type) : 'Төрөлгүй'}
        </div>
      </div>
      <div style="padding:16px;">
        <h3 style="margin:0 0 8px 0; font-size:18px; color:#0f172a; font-weight:600;">
          ${p.name ? escapeHtml(p.name) : 'Нэргүй'}
        </h3>
        <p style="margin:0 0 12px 0; color:#6b7280; font-size:14px; line-height:1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${p.description ? escapeHtml(p.description) : 'Тайлбар байхгүй'}
        </p>
        <div style="display:flex; align-items:center; gap:6px; color:#6b7280; font-size:13px; margin-bottom:16px;">
          <span>📍</span>
          <span>${
            coords[1] != null && coords[0] != null
              ? `${Number(coords[1]).toFixed(5)}, ${Number(coords[0]).toFixed(
                  5
                )}`
              : 'Байршил тодорхойгүй'
          }</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button data-act="edit" data-id="${
            p.id
          }" class="card-btn card-btn-edit" style="flex:1; padding:10px; background:#3b82f6; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:500; transition: background 0.2s;">
             Засах
          </button>
          <button data-act="del" data-id="${
            p.id
          }" class="card-btn card-btn-del" style="flex:1; padding:10px; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; font-size:14px; font-weight:500; transition: background 0.2s;">
             Устгах
          </button>
        </div>
      </div>
    `;

    // Hover effect
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-4px)';
      card.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    });

    cardGrid.appendChild(card);
  });

  if (countLabel) countLabel.textContent = `Нийт: ${features.length}`;

  // Add button hover effects
  document.querySelectorAll('.card-btn-edit').forEach(btn => {
    btn.addEventListener(
      'mouseenter',
      () => (btn.style.background = '#2563eb')
    );
    btn.addEventListener(
      'mouseleave',
      () => (btn.style.background = '#3b82f6')
    );
  });
  document.querySelectorAll('.card-btn-del').forEach(btn => {
    btn.addEventListener(
      'mouseenter',
      () => (btn.style.background = '#dc2626')
    );
    btn.addEventListener(
      'mouseleave',
      () => (btn.style.background = '#ef4444')
    );
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadPlaces() {
  const q = searchInput?.value?.trim() || '';
  const type = typeSelect?.value || '';
  const url = new URL(`${API_BASE}/places`);
  if (q) url.searchParams.set('q', q);
  if (type) {
    url.searchParams.set('type', type);
  } else if (categories && categories.length) {
    // When no single type selected, request all categories except bus_stop
    url.searchParams.set('types', categories.join(','));
  }
  const res = await fetch(url);
  const data = await res.json();
  // Extra guard: exclude any bus_stop features if present
  const features = (data.features || []).filter(
    f => (f.properties?.type || f.properties?.place_type) !== 'bus_stop'
  );
  renderRows(features);
}

// Debounce helper
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Events
searchInput?.addEventListener('input', debounce(loadPlaces, 300));
typeSelect?.addEventListener('change', loadPlaces);

cardGrid?.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (act === 'edit') {
    location.href = `new_place.html?id=${id}`;
    return;
  }
  if (act === 'del') {
    const ok = confirm('Энэ газрыг устгах уу?');
    if (!ok) return;
    const secret = sessionStorage.getItem('adminSecret') || '';
    const res = await fetch(`${API_BASE}/places/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Secret': secret },
    });
    if (res.ok) {
      await loadPlaces();
    } else {
      if (res.status === 401) {
        alert('Админ эрх баталгаажсангүй. Дахин нэвтэрнэ үү.');
        location.href = '/';
        return;
      }
      const d = await res.json().catch(() => ({}));
      alert('Устгах үед алдаа: ' + (d.error || ''));
    }
  }
});

// init
await adminEnsure();
await loadCategories();
await loadPlaces();
