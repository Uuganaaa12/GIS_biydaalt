import { placesLayer, loadPlaces } from './data.js';
import { map } from './map.js';
import { allPlaces, bucketList } from './state.js';
import { updateBucketUI } from './ui.js';

// -----------------------------
// Popup үүсгэх ба хамгаалалт нэмсэн
// -----------------------------
function bindPopupHandlers(feature, layer) {
  // 🛡 feature эсвэл properties байхгүй бол алгас
  if (!feature || !feature.properties) return;

  const p = feature.properties;
  if (!p.id && !p.name) return; // ID, name аль аль нь байхгүй бол алгас

  const inBucket = Array.isArray(bucketList)
    ? bucketList.some(item => item && item.id === p.id)
    : false;

  const popupContent = `
    <b>${p.name || 'Place'}</b><br>
    ${p.type || ''}<br>
    ${p.description || ''}<br>
    <button class="detail-btn" data-id="${p.id ?? ''}" 
      style="margin-top:8px; padding:4px 8px; cursor:pointer;">
      Дэлгэрэнгүй үзэх
    </button>
    <button class="add-bucket-btn" data-id="${p.id ?? ''}"
      style="margin-top:8px; padding:4px 8px; cursor:pointer; background:${
        inBucket ? '#9ca3af' : '#3b82f6'
      }; color:white; border:none; border-radius:4px;">
      ${inBucket ? 'Жагсаалтад байна ✓' : '+ Жагсаалт'}
    </button>
  `;

  layer.bindPopup(popupContent);

  layer.on('popupopen', e => {
    const container = e.popup.getElement();
    if (!container) return;

    const detailBtn = container.querySelector('.detail-btn');
    const addBtn = container.querySelector('.add-bucket-btn');

    if (detailBtn) {
      detailBtn.addEventListener('click', () => showDetail(p.id));
    }
    if (addBtn) {
      addBtn.addEventListener('click', () => addToBucketQuick(p.id));
    }
  });
}

// ✅ Feature бүрийн popup үүсгэх функц холбох
placesLayer.options.onEachFeature = bindPopupHandlers;

// -----------------------------
// Дэлгэрэнгүй мэдээлэл харуулах
// -----------------------------
export function showDetail(placeId) {
  if (!placeId) return;
  const feature = allPlaces.find(f => f?.properties?.id === placeId);
  if (!feature || !feature.properties || !feature.geometry) return;

  const p = feature.properties;
  const coords = feature.geometry.coordinates || [0, 0];

  document.getElementById('detailName').textContent = p.name || 'Нэргүй';
  document.getElementById('detailType').textContent = p.type || '-';
  document.getElementById('detailDesc').textContent =
    p.type === 'bus_stop'
      ? 'Автобусны буудал'
      : p.description || 'Тайлбар байхгүй';

  document.getElementById('detailCoords').textContent = `${coords[1]?.toFixed(5)}, ${coords[0]?.toFixed(5)}`;

  const imgContainer = document.getElementById('detailImageContainer');
  imgContainer.innerHTML = '';
  if (p.image_url) {
    const img = document.createElement('img');
    img.src = p.image_url;
    img.alt = p.name;
    imgContainer.appendChild(img);
  }

  const addBtn = document.getElementById('addToBucketBtn');
  if (bucketList.some(item => item && item.id === placeId)) {
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  } else {
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }
  addBtn.dataset.placeId = String(placeId);

  document.getElementById('detailPanel').classList.add('open');
}

// -----------------------------
// Очих жагсаалтанд нэмэх
// -----------------------------
export function addToBucket(placeId) {
  if (!placeId) return;
  const feature = allPlaces.find(f => f?.properties?.id === placeId);
  if (!feature || !feature.properties || !feature.geometry) return;

  const p = feature.properties;
  const coords = feature.geometry.coordinates;
  if (!coords || coords.length !== 2) return;

  if (bucketList.some(item => item && item.id === placeId)) return;

  bucketList.push({
    id: placeId,
    name: p.name || 'Нэргүй',
    type: p.type || '',
    coords,
  });

  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();

  const addBtn = document.getElementById('addToBucketBtn');
  if (addBtn && addBtn.dataset.placeId === String(placeId)) {
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  }
}

export function addToBucketQuick(placeId) {
  addToBucket(placeId);
}

// -----------------------------
// Очих жагсаалтаас устгах
// -----------------------------
export function removeFromBucket(placeId) {
  const idx = bucketList.findIndex(item => item && item.id === placeId);
  if (idx === -1) return;
  bucketList.splice(idx, 1);
  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();

  const addBtn = document.getElementById('addToBucketBtn');
  if (addBtn && addBtn.dataset.placeId === String(placeId)) {
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }
}

// -----------------------------
// Detail Panel-ийн товчлуурууд
// -----------------------------
export function setupDetailPanel() {
  const closeBtn = document.getElementById('closePanelBtn');
  if (closeBtn)
    closeBtn.addEventListener('click', () =>
      document.getElementById('detailPanel').classList.remove('open')
    );

  const addBtn = document.getElementById('addToBucketBtn');
  if (addBtn)
    addBtn.addEventListener('click', e => {
      const pid = Number(e.currentTarget.dataset.placeId);
      if (pid) addToBucket(pid);
    });
}

// -----------------------------
// Global exposure (хуучин HTML compatibility)
// -----------------------------
window.showDetail = showDetail;
window.addToBucketQuick = addToBucketQuick;
window.removeFromBucket = removeFromBucket;
