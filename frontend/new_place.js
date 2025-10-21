const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001'
    : 'http://localhost:5001';

// Require admin before entering (this page should be navigated to only after check)
async function adminEnsure() {
  try {
    const secret = sessionStorage.getItem('adminSecret') || '';
    const res = await fetch(`${API_BASE}/admin_check`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': secret },
    });
    if (!res.ok) throw new Error('auth');
  } catch {
    alert('Дахин нэвтэрнэ үү.');
    location.href = '/';
  }
}

adminEnsure();

// Map for picking coordinates
const map = L.map('pickMap').setView([47.918, 106.917], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

let marker = null;
let fillFromMap = true;

// Determine edit mode
const params = new URLSearchParams(location.search);
const editId = params.get('id');

map.on('click', async e => {
  if (!fillFromMap) return;
  const { lat, lng } = e.latlng;
  document.getElementById('lat').value = lat.toFixed(6);
  document.getElementById('lon').value = lng.toFixed(6);

  if (marker) map.removeLayer(marker);
  marker = L.marker(e.latlng).addTo(map);

  // Try reverse geocoding via Nominatim (optional)
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lat', lat);
    url.searchParams.set('lon', lng);
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    const res = await fetch(url, { headers: { 'Accept-Language': 'mn' } });
    if (res.ok) {
      const data = await res.json();
      const display = data.display_name;
      if (display) {
        const nameEl = document.getElementById('name');
        if (!nameEl.value) nameEl.value = display.split(',')[0];
        const descEl = document.getElementById('description');
        if (!descEl.value) descEl.value = display;
      }
    }
  } catch (e) {
    console.warn('Reverse geocode failed', e);
  }
});

// document.getElementById('reverseBtn').addEventListener('click', () => {
//   fillFromMap = !fillFromMap;
//   alert(
//     fillFromMap
//       ? 'Газрын зураг дээр дарж бөглөх идэвхтэй'
//       : 'Газрын зураг дээр дарж бөглөх унтраалттай'
//   );
// });

// Image preview
const imgInput = document.getElementById('image');
imgInput.addEventListener('change', () => {
  const pre = document.getElementById('preview');
  pre.innerHTML = '';
  const f = imgInput.files?.[0];
  if (f) {
    const img = document.createElement('img');
    img.style.maxWidth = '200px';
    img.style.borderRadius = '6px';
    img.src = URL.createObjectURL(f);
    pre.appendChild(img);
  }
});

// Submit
async function handleSubmit() {
  const secret = sessionStorage.getItem('adminSecret') || '';
  const name = document.getElementById('name').value.trim();
  const place_type = document.getElementById('place_type').value.trim();
  const description = document.getElementById('description').value.trim();
  const lon = document.getElementById('lon').value.trim();
  const lat = document.getElementById('lat').value.trim();
  const file = imgInput.files?.[0];

  if (!name || !place_type || !lon || !lat) {
    alert('Нэр, төрөл, координатыг бөглөнө үү');
    return;
  }

  const form = new FormData();
  form.set('name', name);
  form.set('place_type', place_type);
  form.set('description', description);
  form.set('lon', lon);
  form.set('lat', lat);
  if (file) form.set('image', file);

  const url = editId ? `${API_BASE}/places/${editId}` : `${API_BASE}/places`;
  const method = editId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'X-Admin-Secret': secret },
    body: form,
  });
  const data = await res.json();
  if (res.ok) {
    alert(editId ? 'Амжилттай засварлалаа' : 'Амжилттай хадгаллаа');
    location.href = '/places.html';
  } else {
    alert('Алдаа: ' + (data.error || ''));
  }
}

document.getElementById('submitBtn').addEventListener('click', handleSubmit);

// If edit mode, load existing and populate
async function loadForEdit() {
  if (!editId) return;
  try {
    const res = await fetch(`${API_BASE}/places/${editId}`);
    if (!res.ok) return;
    const feat = await res.json();
    const p = feat.properties || {};
    const coords = (feat.geometry && feat.geometry.coordinates) || [null, null];
    document.getElementById('name').value = p.name || '';
    document.getElementById('place_type').value = p.type || '';
    document.getElementById('description').value = p.description || '';
    if (coords[0] != null && coords[1] != null) {
      document.getElementById('lon').value = coords[0];
      document.getElementById('lat').value = coords[1];
      const ll = L.latLng(coords[1], coords[0]);
      map.setView(ll, 15);
      if (marker) map.removeLayer(marker);
      marker = L.marker(ll).addTo(map);
    }
    const pre = document.getElementById('preview');
    pre.innerHTML = '';
    if (p.image_url) {
      const img = document.createElement('img');
      img.style.maxWidth = '200px';
      img.style.borderRadius = '6px';
      img.src = p.image_url;
      pre.appendChild(img);
    }
    // Change button text
    const btn = document.getElementById('submitBtn');
    btn.textContent = 'Засварлах';
  } catch (e) {
    // ignore
  }
}

loadForEdit();
