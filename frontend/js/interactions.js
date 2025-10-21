import { baseLayers, currentBase, map } from './map.js';
import { loadPlaces } from './data.js';
import { bucketList, setUserLocation, userLocationMarker } from './state.js';
import { updateBucketUI } from './ui.js';
import { showBucketRoute } from './routing.js';
import { API_BASE } from './config.js';

let _currentBase = currentBase; // local tracking for removal

export function setupInteractions() {
  map.on('moveend', loadPlaces);

  const basemapSelect = document.getElementById('basemapSelect');
  if (basemapSelect) {
    basemapSelect.addEventListener('change', e => {
      const name = e.target.value;
      if (_currentBase) map.removeLayer(_currentBase);
      const layer = baseLayers[name];
      if (layer) _currentBase = layer.addTo(map);
    });
  }

  document.getElementById('locateBtn').addEventListener('click', () => {
    map.locate({
      setView: true,
      maxZoom: 15,
      timeout: 30000,
      maximumAge: 10000,
      enableHighAccuracy: true,
    });
  });

  map.on('locationfound', e => {
    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: '<div style="background-color: #3b82f6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    if (userLocationMarker) {
      map.removeLayer(userLocationMarker);
    }
    const marker = L.marker(e.latlng, { icon: userIcon })
      .addTo(map)
      .bindPopup('<b>Таны байршил</b>')
      .openPopup();
    L.circle(e.latlng, {
      radius: e.accuracy / 2,
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(map);
    setUserLocation(e.latlng, marker);
    try {
      updateBucketUI();
    } catch {}
  });

  map.on('locationerror', e => {
    alert('Байршил олдсонгүй: ' + e.message);
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

  // Delegate remove button clicks in bucket list
  document.getElementById('bucketList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-remove-id]');
    if (!btn) return;
    const id = Number(btn.getAttribute('data-remove-id'));
    const idx = bucketList.findIndex(b => b.id === id);
    if (idx !== -1) {
      bucketList.splice(idx, 1);
      localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
      updateBucketUI();
    }
  });

  // New Place: admin password modal
  document
    .getElementById('placesListButton')
    .addEventListener('click', showPasswordModal);

  //   const placesListButton = document.getElementById('placesListButton');
  //   if (placesListButton) {
  //     placesListButton.addEventListener('click', showPasswordModal);
  //   }
}

export function showPasswordModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h3> Админ нэвтрэх</h3>
      <input type="password" id="pwdInput" placeholder="Нууц үг" />
      <p class="error" id="error"></p>
      <div class="modal-btns">
        <button onclick="this.closest('.modal-overlay').remove()">Цуцлах</button>
        <button id="adminLoginBtn">Нэвтрэх</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = document.getElementById('pwdInput');
  input.focus();
  document
    .getElementById('adminLoginBtn')
    .addEventListener('click', () => checkPassword());
}

export async function checkPassword() {
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
      //   location.href = 'new_place.html';
      location.href = 'places.html';
    } else {
      error.textContent = 'Нууц үг буруу';
    }
  } catch (e) {
    error.textContent = 'Холболтын алдаа';
  }
}
