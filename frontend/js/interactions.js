import { baseLayers, currentBase, map } from './map.js';
import { loadPlaces, selectedCategories, placesLayer } from './data.js';
import {
  bucketList,
  setUserLocation,
  userLocationMarker,
  allPlaces,
} from './state.js';
import { updateBucketUI } from './ui.js';
import {
  showBucketRoute,
  clearRoute,
  showDirectRouteToPlace,
  updateModeDurations,
} from './routing.js';
import { API_BASE } from './config.js';
import {
  bucketList as _bucketList,
  lastDirectDestination,
  currentRouteType,
} from './state.js';

let _currentBase = currentBase;
let searchMarker = null;

export function setupInteractions() {
  map.on('moveend', loadPlaces);

  // Search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', e => {
      const query = e.target.value.trim().toLowerCase();
      if (!query) {
        // Clear search highlighting
        if (searchMarker) {
          map.removeLayer(searchMarker);
          searchMarker = null;
        }
        return;
      }

      // Debounce search
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        await searchPlaceByName(query);
      }, 300);
    });

    // Clear search on Enter
    searchInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchInput.value = '';
        if (searchMarker) {
          map.removeLayer(searchMarker);
          searchMarker = null;
        }
      }
    });
  }

  // Basemap button to toggle filter panel
  const basemapBtn = document.getElementById('basemapBtn');
  const filterPanel = document.getElementById('filterPanel');

  if (basemapBtn && filterPanel) {
    basemapBtn.addEventListener('click', () => {
      filterPanel.classList.toggle('open');
    });
  }

  // Quick action buttons
  document.getElementById('restaurantsBtn')?.addEventListener('click', () => {
    filterByCategory('restaurant');
  });

  document.getElementById('hotelsBtn')?.addEventListener('click', () => {
    filterByCategory('hotel');
  });

  document.getElementById('museumsBtn')?.addEventListener('click', () => {
    filterByCategory('museum');
  });

  document.getElementById('photoSpotsBtn')?.addEventListener('click', () => {
    filterByCategory('photo_spot');
  });

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

  const toggleBtn = document.getElementById('toggleBucketBtn');
  const bucketPanel = document.getElementById('bucketPanel');
  toggleBtn.addEventListener('click', () => {
    bucketPanel.classList.toggle('open');
    // Move the side tab depending on state and flip arrow
    toggleBtn.classList.toggle('open', bucketPanel.classList.contains('open'));
    const arrow = toggleBtn.querySelector('.arrow');
    if (arrow) {
      arrow.textContent = bucketPanel.classList.contains('open') ? '‹' : '›';
    }
  });
  // document.getElementById('closeBucketBtn').addEventListener('click', () => {
  //   bucketPanel.classList.remove('open');
  //   toggleBtn.classList.remove('open');
  //   const arrow = toggleBtn.querySelector('.arrow');
  //   if (arrow) arrow.textContent = '›';
  // });
  document
    .getElementById('showBucketRouteBtn')
    .addEventListener('click', showBucketRoute);

  document
    .getElementById('clearRouteBtn')
    .addEventListener('click', clearRoute);

  // Mode toggle (car/bus/foot) buttons
  const modeToggle = document.getElementById('modeToggle');
  const hiddenMode = document.getElementById('routeModeSelect');
  if (modeToggle && hiddenMode) {
    modeToggle.addEventListener('click', e => {
      const btn = e.target.closest('.mode-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      // Update active state
      modeToggle.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      // Keep compatibility with existing code
      hiddenMode.value = mode;

      // Immediately recompute route
      try {
        if (
          currentRouteType === 'direct' &&
          Array.isArray(lastDirectDestination)
        ) {
          showDirectRouteToPlace(lastDirectDestination);
        } else if (
          currentRouteType === 'bucket' &&
          Array.isArray(_bucketList) &&
          _bucketList.length > 0
        ) {
          showBucketRoute();
        } else if (Array.isArray(_bucketList) && _bucketList.length > 0) {
          showBucketRoute();
        } else if (Array.isArray(lastDirectDestination)) {
          showDirectRouteToPlace(lastDirectDestination);
        }
        updateModeDurations();
      } catch (err) {
        console.warn('Mode toggle re-route failed:', err);
      }
    });
  }

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
  const placesListButton = document.getElementById('placesListButton');
  if (placesListButton) {
    placesListButton.addEventListener('click', showPasswordModal);
  }
}

function filterByCategory(category) {
  // Clear all selections
  selectedCategories.clear();
  // Add only the selected category
  selectedCategories.add(category);
  // Update checkboxes
  const checkboxes = document.querySelectorAll(
    '#categoryChecks input[type="checkbox"]'
  );
  checkboxes.forEach(cb => {
    cb.checked = cb.value === category;
  });
  // Reload places with new filter
  loadPlaces();
  // Close filter panel if open
  document.getElementById('filterPanel')?.classList.remove('open');
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

// Search place by name from backend (search all places, not just visible ones)
async function searchPlaceByName(query) {
  try {
    const url = new URL(`${API_BASE}/places`);
    url.searchParams.set('q', query);

    const response = await fetch(url);
    const geojson = await response.json();
    const features = geojson.features || [];

    // Find first non-bus_stop match
    const found = features.find(place => {
      const type = place.properties?.type || '';
      return type !== 'bus_stop';
    });

    if (found) {
      const coords = found.geometry.coordinates;
      const lat = coords[1];
      const lon = coords[0];

      // Remove previous search marker
      if (searchMarker) {
        map.removeLayer(searchMarker);
      }

      // Add highlight marker
      searchMarker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'search-marker',
          html: '<div style="background-color: #ea4335; width: 36px; height: 36px; border-radius: 50%; border: 4px solid white; box-shadow: 0 0 0 2px #ea4335, 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 20px; animation: pulse 1.5s infinite;">📍</div>',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(map);

      searchMarker
        .bindPopup(
          `<b>${found.properties.name}</b><br>${found.properties.type}`
        )
        .openPopup();

      // Fly to location
      map.flyTo([lat, lon], 17, {
        duration: 1.5,
      });
    }
  } catch (error) {
    console.error('Search error:', error);
  }
}
