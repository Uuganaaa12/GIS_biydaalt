const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001'
    : 'http://localhost:5001';

const map = L.map('map').setView([47.918, 106.917], 13);

const baseLayers = {
  OpenStreetMap: L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }
  ),
  'Esri World Imagery': L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    }
  ),
  OpenTopoMap: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution:
      'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
  }),
  'Carto Light': L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap contributors & CARTO',
    }
  ),
};

let currentBase = baseLayers['OpenStreetMap'].addTo(map);

const placesLayer = L.geoJSON([], {
  pointToLayer: (feature, latlng) => {
    const p = feature.properties || {};
    // Use different icon for bus stops
    if (p.type === 'bus_stop') {
      const busIcon = L.divIcon({
        className: 'bus-stop-marker',
        html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px;">🚌</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      return L.marker(latlng, { icon: busIcon });
    }

    if (p.type === 'photo_spot') {
      const photoIcon = L.divIcon({
        className: 'photo-spot-marker',
        html: '<div style="background-color: #f59e0b; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">📸</div>',
        iconSize: [30, 30],
        iconAnchor: [16, 16],
      });
      return L.marker(latlng, { icon: photoIcon });
    }

    if (p.type === 'restaurant') {
      const restaurantIcon = L.divIcon({
        className: 'restaurant-marker',
        html: '<div style="background-color: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🍽️</div>',
        iconSize: [30, 30],
        iconAnchor: [16, 16],
      });
      return L.marker(latlng, { icon: restaurantIcon });
    }

    if (p.type === 'hotel') {
      const hotelIcon = L.divIcon({
        className: 'hotel-marker',
        html: '<div style="background-color: #3b82f6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🏨</div>',
        iconSize: [30, 30],
        iconAnchor: [16, 16],
      });
      return L.marker(latlng, { icon: hotelIcon });
    }

    if (p.type === 'museum') {
      const museumIcon = L.divIcon({
        className: 'museum-marker',
        html: '<div style="background-color: #8b5cf6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🏛️</div>',
        iconSize: [30, 30],
        iconAnchor: [16, 16],
      });
      return L.marker(latlng, { icon: museumIcon });
    }

    return L.marker(latlng);
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const inBucket = bucketList.some(item => item.id === p.id);
    const popupContent = `
    <b>${p.name || 'Place'}</b><br>
    ${p.type || ''}<br>
    ${p.description || ''}<br>
    <button onclick="showDetail(${
      p.id
    })" style="margin-top:8px; padding:4px 8px; cursor:pointer;">Дэлгэрэнгүй үзэх</button>
    <button 
      data-place-id="${p.id}"
      onclick="addToBucketQuick(${p.id})"
      style="margin-top:8px; padding:4px 8px; cursor:pointer; background:${
        inBucket ? '#9ca3af' : '#3b82f6'
      }; color:white; border:none; border-radius:4px;"
    >
      ${inBucket ? 'Жагсаалтад байна ✓' : '+ Жагсаалт'}
    </button>
  `;
    layer.bindPopup(popupContent);
  },
}).addTo(map);

// Route layer with per-segment styling
const routeLayer = L.geoJSON([], {
  style: feature => {
    const seg = feature?.properties?.segment || 'route';
    const styles = {
      'walk-to-stop': { color: '#22c55e', weight: 4, dashArray: '6 6' },
      bus: { color: '#ef4444', weight: 5 },
      'walk-from-stop': { color: '#3b82f6', weight: 4, dashArray: '6 6' },
      route: { color: '#ef4444', weight: 4 },
    };
    return styles[seg] || styles['route'];
  },
}).addTo(map);

// Layer to hold numbered markers for route order
const routeMarkersLayer = L.layerGroup().addTo(map);

// Helper to create a numbered marker icon
function createNumberedIcon(n, color = '#ef4444') {
  return L.divIcon({
    className: 'numbered-marker',
    html: `<div style="background:${color}; color:#fff; width:26px; height:26px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); font-weight:700;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Detail panel cache
let allPlaces = [];
// Bucket list (visit list) - stored in localStorage
let bucketList = JSON.parse(localStorage.getItem('ubBucketList') || '[]');
let currentDetailPlaceId = null;
// User's current location
let userLocation = null;
let userLocationMarker = null;

// Selected categories state (Set)
const selectedCategories = new Set();

async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const cats = await res.json();
  const wrap = document.getElementById('categoryChecks');
  if (!wrap) return;
  wrap.innerHTML = '';
  cats.forEach(c => {
    const id = `cat_${c}`;
    const label = document.createElement('label');
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '4px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = c;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedCategories.add(c);
      else selectedCategories.delete(c);
      loadPlaces();
    });
    const span = document.createElement('span');
    span.textContent = c;
    label.appendChild(cb);
    label.appendChild(span);
    wrap.appendChild(label);
  });
}

async function loadPlaces() {
  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].join(',');
  const url = new URL(`${API_BASE}/places`);
  url.searchParams.set('bbox', bbox);
  if (selectedCategories.size > 0) {
    url.searchParams.set('types', Array.from(selectedCategories).join(','));
  }

  const res = await fetch(url);
  const geojson = await res.json();

  allPlaces = geojson.features || []; // cache for detail lookup
  placesLayer.clearLayers();
  placesLayer.addData(geojson);
}

function setupInteractions() {
  map.on('moveend', loadPlaces);

  // Basemap switching
  const basemapSelect = document.getElementById('basemapSelect');
  if (basemapSelect) {
    basemapSelect.addEventListener('change', e => {
      const name = e.target.value;
      if (currentBase) map.removeLayer(currentBase);
      const layer = baseLayers[name];
      if (layer) {
        currentBase = layer.addTo(map);
      }
    });
  }

  document.getElementById('locateBtn').addEventListener('click', () => {
    map.locate({
      setView: true,
      maxZoom: 15,
      timeout: 30000, // 30 seconds timeout
      maximumAge: 10000, // accept cached location up to 10 seconds old
      enableHighAccuracy: true, // request high accuracy
    });
  });

  // Handle location found
  map.on('locationfound', e => {
    userLocation = e.latlng;

    // Remove old marker if exists
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
    }

    // Create a custom icon for user location
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: '<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    // Add marker with custom icon
    userLocationMarker = L.marker(userLocation, { icon: userIcon })
      .addTo(map)
      .bindPopup('<b>Таны байршил</b>')
      .openPopup();

    // Add accuracy circle
    L.circle(userLocation, {
      radius: e.accuracy / 2,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(map);

    // Refresh bucket UI so "My Location" appears at the top
    try {
      updateBucketUI();
    } catch (_) {}
  });

  map.on('locationerror', e => {
    alert('Байршил олдсонгүй: ' + e.message);
  });
}

async function drawRoute(a, b) {
  const start = `${a.lng},${a.lat}`;
  const end = `${b.lng},${b.lat}`;
  const mode = document.getElementById('routeModeSelect')?.value || 'car';
  const isBus = mode === 'bus';
  const path = isBus ? '/route_bus' : '/route';
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  if (!isBus) url.searchParams.set('mode', mode);
  const res = await fetch(url);
  const geo = await res.json();
  routeLayer.clearLayers();
  routeLayer.addData(geo);
  // Add simple directional arrows using small circle markers along the line (fallback if decorator not available)
  try {
    const addArrows = f => {
      if (f.type === 'Feature' && f.geometry?.type === 'LineString') {
        const coords = f.geometry.coordinates;
        for (let i = 10; i < coords.length; i += 20) {
          const [lon, lat] = coords[i];
          L.circleMarker([lat, lon], { radius: 2, color: '#111827' }).addTo(
            map
          );
        }
      }
    };
    if (geo.features) geo.features.forEach(addArrows);
    else addArrows(geo);
  } catch (e) {}

  // If bus mode, show only route-related bus stops
  if (isBus && geo.summary) {
    const s = geo.summary;
    const relevantStopIds = new Set();
    if (s.start_stop?.id) relevantStopIds.add(s.start_stop.id);
    if (s.end_stop?.id) relevantStopIds.add(s.end_stop.id);
    (s.intermediate_stops || []).forEach(st => relevantStopIds.add(st.id));

    const filtered = {
      type: 'FeatureCollection',
      features: (allPlaces || []).filter(
        f =>
          f.properties?.type === 'bus_stop' &&
          relevantStopIds.has(f.properties.id)
      ),
    };
    placesLayer.clearLayers();
    placesLayer.addData(filtered);
  }
  // Optional: show bus summary
  if (isBus && geo.summary) {
    const s = geo.summary;
    const el = document.getElementById('busSummary');
    if (el) {
      const inter = (s.intermediate_stops || [])
        .map(st => `• ${st.name}`)
        .join('<br>');
      el.innerHTML = `
        <div style="background:#ecfeff; border:1px solid #a5f3fc; padding:8px; border-radius:6px;">
          <div style="font-weight:600; margin-bottom:4px;">Автобусын чиглэл (туршилт)</div>
          <div>Суух: <strong>${s.start_stop?.name || '-'}</strong></div>
          <div style="margin:4px 0; color:#075985;">Дайрах зогсоолууд:</div>
          <div>${inter || '—'}</div>
          <div style="margin-top:4px;">Буух: <strong>${
            s.end_stop?.name || '-'
          }</strong></div>
        </div>`;
    }
  }
}

function showDetail(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates; // [lon, lat]
  currentDetailPlaceId = placeId;

  document.getElementById('detailName').textContent = p.name || 'Нэргүй';
  document.getElementById('detailType').textContent = p.type || '-';
  if (p.type === 'bus_stop') {
    document.getElementById('detailDesc').textContent = 'Автобусны буудал';
  } else {
    document.getElementById('detailDesc').textContent =
      p.description || 'Тайлбар байхгүй';
  }

  document.getElementById('detailCoords').textContent = `${coords[1].toFixed(
    5
  )}, ${coords[0].toFixed(5)}`;

  // Optional: if you have image_url field in properties
  const imgContainer = document.getElementById('detailImageContainer');
  imgContainer.innerHTML = '';
  if (p.image_url) {
    const img = document.createElement('img');
    img.src = p.image_url;
    img.alt = p.name;
    imgContainer.appendChild(img);
  }

  // Update add button text based on whether already in bucket
  const addBtn = document.getElementById('addToBucketBtn');
  if (bucketList.some(item => item.id === placeId)) {
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  } else {
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }

  document.getElementById('detailPanel').classList.add('open');
}

document.getElementById('closePanelBtn').addEventListener('click', () => {
  document.getElementById('detailPanel').classList.remove('open');
});

// Bucket list functions
function addToBucket(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates;

  if (bucketList.some(item => item.id === placeId)) return; // already exists

  bucketList.push({
    id: placeId,
    name: p.name || 'Нэргүй',
    type: p.type,
    coords: coords,
  });

  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();

  // Update detail panel button if open
  if (currentDetailPlaceId === placeId) {
    const addBtn = document.getElementById('addToBucketBtn');
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  }
}

function addToBucketQuick(placeId) {
  addToBucket(placeId);
}

function removeFromBucket(placeId) {
  bucketList = bucketList.filter(item => item.id !== placeId);
  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();

  // Update detail panel button if that place is open
  if (currentDetailPlaceId === placeId) {
    const addBtn = document.getElementById('addToBucketBtn');
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }
}

function updateBucketUI() {
  document.getElementById('bucketCount').textContent = bucketList.length;
  const container = document.getElementById('bucketList');
  container.innerHTML = '';

  // If no items AND no user location, show empty state
  if (bucketList.length === 0 && !userLocation) {
    container.innerHTML = '<p style="color:#9ca3af;">Одоогоор хоосон байна</p>';
    return;
  }

  // Pin user's current location at the top (read-only) if available
  if (userLocation) {
    const myLoc = document.createElement('div');
    myLoc.className = 'bucket-item';
    myLoc.innerHTML = `
      <div>
        <strong>Миний байршил</strong>
        <small style="color:#6b7280;">Эхлэх цэг</small>
      </div>
      <span style="font-size:12px; color:#9ca3af;">\u2713</span>
    `;
    container.appendChild(myLoc);
  }

  // Then render the rest of the places
  bucketList.forEach(item => {
    const div = document.createElement('div');
    div.className = 'bucket-item';
    div.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <small style="color:#6b7280;">${item.type || ''}</small>
      </div>
      <button onclick="removeFromBucket(${item.id})">Устгах</button>
    `;
    container.appendChild(div);
  });
}

async function showBucketRoute() {
  if (bucketList.length < 1) {
    alert('Маршрут үүсгэхийн тулд 1-с дээш газар нэм');
    return;
  }

  // Check if user location is available
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }

  const mode = document.getElementById('routeModeSelect').value;
  routeLayer.clearLayers();
  routeMarkersLayer.clearLayers();
  // Clear previous textual summary if any
  const elSummary = document.getElementById('busSummary');
  if (elSummary) elSummary.innerHTML = '';

  // Start from user's current location to first bucket item
  let start = [userLocation.lng, userLocation.lat]; // [lon, lat]
  let end = bucketList[0].coords;

  const busMode = mode === 'bus';
  let firstLegSummary = null; // capture the first leg's summary (from My Location)
  let url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
  url.searchParams.set('start', `${start[0]},${start[1]}`);
  url.searchParams.set('end', `${end[0]},${end[1]}`);
  if (!busMode) url.searchParams.set('mode', mode);

  let res = await fetch(url);
  let geo = await res.json();
  routeLayer.addData(geo);
  if (busMode && geo.summary) firstLegSummary = geo.summary;

  // Add numbered markers: 0 = My Location, 1..N = bucket order
  // 0: My Location (blue)
  routeMarkersLayer.addLayer(
    L.marker([userLocation.lat, userLocation.lng], {
      icon: createNumberedIcon(0, '#3b82f6'),
    }).bindPopup('<b>Эхлэх цэг</b>: Миний байршил')
  );
  // 1..N: bucket items (red)
  bucketList.forEach((item, idx) => {
    const marker = L.marker([item.coords[1], item.coords[0]], {
      icon: createNumberedIcon(idx + 1, '#ef4444'),
    }).bindPopup(`<b>${idx + 1}. ${item.name}</b>`);
    routeMarkersLayer.addLayer(marker);
  });

  // Draw lines between consecutive bucket items
  for (let i = 0; i < bucketList.length - 1; i++) {
    start = bucketList[i].coords; // [lon, lat]
    end = bucketList[i + 1].coords;

    url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
    url.searchParams.set('start', `${start[0]},${start[1]}`);
    url.searchParams.set('end', `${end[0]},${end[1]}`);
    if (!busMode) url.searchParams.set('mode', mode);

    res = await fetch(url);
    geo = await res.json();
    routeLayer.addData(geo);
  }

  // Fit map to show user location and all bucket items
  const allPoints = [
    [userLocation.lat, userLocation.lng],
    ...bucketList.map(item => [item.coords[1], item.coords[0]]),
  ];
  const bounds = L.latLngBounds(allPoints);
  map.fitBounds(bounds, { padding: [50, 50] });

  // Close bucket panel
  // document.getElementById('bucketPanel').classList.remove('open');

  // Show bus summary if bus mode
  if (busMode) {
    const el = document.getElementById('busSummary');
    if (el) {
      const s = firstLegSummary || geo.summary;
      if (s) {
        const inter = (s.intermediate_stops || [])
          .map(st => `• ${st.name}`)
          .join('<br>');
        el.innerHTML = `
          <div style="background:#ecfeff; border:1px solid #a5f3fc; padding:8px; border-radius:6px;">
            <div style="font-weight:600; margin-bottom:4px;">Автобусын чиглэл (туршилт)</div>
            <div>Суух: <strong>${s.start_stop?.name || '-'}</strong></div>
            <div style=\"margin:4px 0; color:#075985;\">Дайрах зогсоолууд:</div>
            <div>${inter || '—'}</div>
            <div style="margin-top:4px;">Буух: <strong>${
              s.end_stop?.name || '-'
            }</strong></div>
            <div style="margin-top:8px; font-size:12px; color:#334155;">Эхлэх цэг: Миний байршил → 1-р газар</div>
          </div>`;
      } else {
        el.textContent = '';
      }
    }
  }

  // Render a simple itinerary list showing order 0..N
  const itin = document.getElementById('itinerary');
  if (itin) {
    const items = [
      {
        label: '0. Миний байршил',
        coords: [userLocation.lng, userLocation.lat],
      },
      ...bucketList.map((b, i) => ({
        label: `${i + 1}. ${b.name}`,
        coords: b.coords,
      })),
    ];
    const html = [
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px; border-radius:6px;">',
      '<div style="font-weight:600; margin-bottom:6px;">Очих дараалал</div>',
      '<ol style="margin:0; padding-left:18px;">',
      ...items.map(it => `<li>${it.label}</li>`),
      '</ol>',
      '</div>',
    ].join('');
    itin.innerHTML = html;
  }
}

// Removed bus-stop-based routing; routes are computed directly per segment

document.getElementById('addToBucketBtn').addEventListener('click', () => {
  if (currentDetailPlaceId !== null) {
    addToBucket(currentDetailPlaceId);
  }
});

document.getElementById('toggleBucketBtn').addEventListener('click', () => {
  document.getElementById('bucketPanel').classList.toggle('open');
});

document.getElementById('closeBucketBtn').addEventListener('click', () => {
  document.getElementById('bucketPanel').classList.remove('open');
});

document
  .getElementById('showBucketRouteBtn')
  .addEventListener('click', showBucketRoute);

// New Place button flow: prompt password, verify, then go to new_place.html
document.getElementById('newPlaceBtn').addEventListener('click', () => {
  showPasswordModal();
});

function showPasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h3> Админ нэвтрэх</h3>
      <input type="password" id="pwdInput" placeholder="Нууц үг" />
      <p class="error" id="error"></p>
      <div class="modal-btns">
        <button onclick="this.closest('.modal-overlay').remove()">Цуцлах</button>
        <button onclick="checkPassword()">Нэвтрэх</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('pwdInput').focus();
}

async function checkPassword() {
  const pwd = document.getElementById('pwdInput').value;
  const error = document.getElementById('error');

  if (!pwd) {
    error.textContent = 'Нууц үг оруулна уу';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin_check`, {
      method: 'POST',
      headers: { 'X-Admin-Secret': pwd },
    });

    if (res.ok) {
      sessionStorage.setItem('adminSecret', pwd);
      location.href = 'new_place.html';
    } else {
      error.textContent = 'Нууц үг буруу';
    }
  } catch (e) {
    error.textContent = 'Холболтын алдаа';
  }
}

(async function init() {
  updateBucketUI();
  await loadCategories();
  setupInteractions();
  try {
    map.locate({
      setView: true,
      maxZoom: 15,
      timeout: 30000,
      maximumAge: 10000,
      enableHighAccuracy: true,
    });
  } catch (e) {
    console.warn('Auto locate failed:', e);
  }
  await loadPlaces();
})();
