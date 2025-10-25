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

// Gallery images preview
const galleryInput = document.getElementById('galleryImages');
galleryInput.addEventListener('change', () => {
  const pre = document.getElementById('galleryPreview');
  pre.innerHTML = '';
  const files = galleryInput.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(f => {
      const img = document.createElement('img');
      img.style.width = '100px';
      img.style.height = '80px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '6px';
      img.style.border = '2px solid #e5e7eb';
      img.src = URL.createObjectURL(f);
      pre.appendChild(img);
    });
    const info = document.createElement('div');
    info.style.width = '100%';
    info.style.fontSize = '14px';
    info.style.color = '#6b7280';
    info.textContent = `${files.length} зураг сонгогдсон`;
    pre.appendChild(info);
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
  const galleryFiles = galleryInput.files;

  if (!name || !place_type || !lon || !lat) {
    alert('Нэр, төрөл, координатыг бөглөнө үү');
    return;
  }

  const btn = document.getElementById('submitBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Хадгалж байна...';

  try {
    // Step 1: Create/update the place
    const form = new FormData();
    form.set('name', name);
    form.set('place_type', place_type);
    form.set('description', description);
    form.set('lon', lon);
    form.set('lat', lat);
    if (file) form.set('image', file);
    
    // Add social media and contact info
    const facebook_url = document.getElementById('facebook_url').value.trim();
    const instagram_url = document.getElementById('instagram_url').value.trim();
    const website_url = document.getElementById('website_url').value.trim();
    const phone = document.getElementById('phone').value.trim();
    
    if (facebook_url) form.set('facebook_url', facebook_url);
    if (instagram_url) form.set('instagram_url', instagram_url);
    if (website_url) form.set('website_url', website_url);
    if (phone) form.set('phone', phone);

    const url = editId ? `${API_BASE}/places/${editId}` : `${API_BASE}/places`;
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'X-Admin-Secret': secret },
      body: form,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Газар хадгалахад алдаа гарлаа');
    }

    // Get place ID from response
    const placeId = data.properties?.id || data.id || editId;
    console.log('Created/Updated place ID:', placeId);
    console.log('Response data:', data);
    console.log('Gallery files count:', galleryFiles ? galleryFiles.length : 0);

    // Step 2: Upload gallery images if any
    if (galleryFiles && galleryFiles.length > 0 && placeId) {
      console.log('Starting gallery upload for place:', placeId);
      btn.textContent = 'Gallery зураг оруулж байна...';

      const galleryForm = new FormData();
      Array.from(galleryFiles).forEach(f => {
        galleryForm.append('images', f);
        console.log('Adding image to form:', f.name);
      });

      console.log('Uploading to:', `${API_BASE}/places/${placeId}/images`);
      const galleryRes = await fetch(`${API_BASE}/places/${placeId}/images`, {
        method: 'POST',
        headers: { 'X-Admin-Secret': secret },
        body: galleryForm,
      });

      console.log('Gallery upload response status:', galleryRes.status);
      if (!galleryRes.ok) {
        const galleryError = await galleryRes.json();
        console.error('Gallery upload failed:', galleryError);
        alert(
          `Газар амжилттай хадгаллаа, гэвч gallery зураг оруулахад алдаа: ${
            galleryError.error || 'unknown'
          }`
        );
      } else {
        const galleryResult = await galleryRes.json();
        console.log('Gallery upload success:', galleryResult);
        alert(
          `Амжилттай! ${
            galleryResult.uploaded_count || 0
          } gallery зураг нэмэгдлээ.`
        );
      }
    } else {
      console.log('Skipping gallery upload:', {
        hasFiles: !!galleryFiles,
        fileCount: galleryFiles?.length,
        placeId,
      });
      alert(editId ? 'Амжилттай засварлалаа' : 'Амжилттай хадгаллаа');
    }

    location.href = '/places.html';
  } catch (error) {
    console.error('Submit error:', error);
    alert('Алдаа: ' + error.message);
    btn.disabled = false;
    btn.textContent = originalText;
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
    document.getElementById('facebook_url').value = p.facebook_url || '';
    document.getElementById('instagram_url').value = p.instagram_url || '';
    document.getElementById('website_url').value = p.website_url || '';
    document.getElementById('phone').value = p.phone || '';
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
