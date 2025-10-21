const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001'
    : 'http://localhost:5001';

const map = L.map('map').setView([47.918, 106.917], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const placesLayer = L.geoJSON([], {
  pointToLayer: (feature, latlng) => {
    const p = feature.properties || {};
    // Use different icon for bus stops
    if (p.type === 'bus_stop') {
      const busIcon = L.divIcon({
        className: 'bus-stop-marker',
        html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 14px;">🚌</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      return L.marker(latlng, { icon: busIcon });
    }
    return L.marker(latlng);
  },
  onEachFeature: (feature, layer) => {
    const p = feature.properties || {};
    const popupContent = `
      <b>${p.name || 'Place'}</b><br>
      ${p.type || ''}<br>
      ${p.description || ''}<br>
      <button onclick="showDetail(${
        p.id
      })" style="margin-top:8px; padding:4px 8px; cursor:pointer;">Дэлгэрэнгүй үзэх</button>
      <button onclick="addToBucketQuick(${
        p.id
      })" style="margin-top:8px; padding:4px 8px; cursor:pointer; background:#3b82f6; color:white; border:none; border-radius:4px;">+ Жагсаалт</button>
    `;
    layer.bindPopup(popupContent);
  },
}).addTo(map);

const routeLayer = L.geoJSON([], {
  style: { color: '#ef4444', weight: 4 },
}).addTo(map);

// Detail panel cache
let allPlaces = [];
// Bucket list (visit list) - stored in localStorage
let bucketList = JSON.parse(localStorage.getItem('ubBucketList') || '[]');
let currentDetailPlaceId = null;
// User's current location
let userLocation = null;
let userLocationMarker = null;

async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const cats = await res.json();
  const sel = document.getElementById('categorySelect');
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
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
  const type = document.getElementById('categorySelect').value;
  const url = new URL(`${API_BASE}/places`);
  url.searchParams.set('bbox', bbox);
  if (type) url.searchParams.set('type', type);

  const res = await fetch(url);
  const geojson = await res.json();

  allPlaces = geojson.features || []; // cache for detail lookup
  placesLayer.clearLayers();
  placesLayer.addData(geojson);
}

function setupInteractions() {
  document
    .getElementById('categorySelect')
    .addEventListener('change', loadPlaces);
  map.on('moveend', loadPlaces);

  let start = null;
  let startMarker = null,
    endMarker = null;

  map.on('click', async e => {
    if (!start) {
      start = e.latlng;
      if (startMarker) map.removeLayer(startMarker);
      startMarker = L.marker(start, { draggable: true })
        .addTo(map)
        .bindPopup('Start')
        .openPopup();
      startMarker.on('dragend', () => {
        start = startMarker.getLatLng();
      });
    } else {
      const end = e.latlng;
      if (endMarker) map.removeLayer(endMarker);
      endMarker = L.marker(end, { draggable: true })
        .addTo(map)
        .bindPopup('End')
        .openPopup();
      endMarker.on('dragend', () => {});

      await drawRoute(start, end);
      start = null;
    }
  });

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
  document.getElementById('detailDesc').textContent =
    p.description || 'Тайлбар байхгүй';
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

  if (bucketList.length === 0) {
    container.innerHTML = '<p style="color:#9ca3af;">Одоогоор хоосон байна</p>';
    return;
  }

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

  // Start from user's current location to first bucket item
  let start = [userLocation.lng, userLocation.lat]; // [lon, lat]
  let end = bucketList[0].coords;

  const busMode = mode === 'bus';
  let url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
  url.searchParams.set('start', `${start[0]},${start[1]}`);
  url.searchParams.set('end', `${end[0]},${end[1]}`);
  if (!busMode) url.searchParams.set('mode', mode);

  let res = await fetch(url);
  let geo = await res.json();
  routeLayer.addData(geo);

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
  document.getElementById('bucketPanel').classList.remove('open');

  // Show bus summary if bus mode
  if (busMode) {
    const el = document.getElementById('busSummary');
    if (el) {
      const s = geo.summary;
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
          </div>`;
      } else {
        el.textContent = '';
      }
    }
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

(async function init() {
  updateBucketUI();
  await loadCategories();
  setupInteractions();
  // Try to locate user immediately on startup
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
