import { placesLayer, loadPlaces } from './data.js';
import { map } from './map.js';
import { allPlaces, bucketList, userLocation } from './state.js';
import { updateBucketUI } from './ui.js';
import { showDirectRouteToPlace } from './routing.js';

function bindPopupHandlers(feature, layer) {
  const p = feature.properties || {};
  const inBucket = bucketList.some(item => item.id === p.id);
  const popupContent = `
    <b>${p.name || 'Place'}</b><br>
    ${p.type || ''}<br>
    ${p.description || ''}<br>
    <div style="display:flex; gap:4px; margin-top:8px; flex-wrap:wrap;">
      <button class="detail-btn" data-id="${
        p.id
      }" style="padding:4px 8px; cursor:pointer;">Дэлгэрэнгүй үзэх</button>
      <button class="add-bucket-btn" data-id="${
        p.id
      }" style="padding:4px 8px; cursor:pointer; background:${
    inBucket ? '#9ca3af' : '#3b82f6'
  }; color:white; border:none; border-radius:4px;">
        ${inBucket ? 'Жагсаалтад байна ✓' : '+ Жагсаалт'}
      </button>
      <button class="direction-btn" data-id="${
        p.id
      }" style="padding:4px 8px; cursor:pointer; background:#10b981; color:white; border:none; border-radius:4px;">
        🧭 Чиглэл
      </button>
    </div>
  `;
  layer.bindPopup(popupContent);
  layer.on('popupopen', e => {
    const container = e.popup.getElement();
    container
      .querySelector('.detail-btn')
      .addEventListener('click', () => showDetail(p.id));
    const addBtn = container.querySelector('.add-bucket-btn');
    addBtn.addEventListener('click', () => addToBucketQuick(p.id));
    const dirBtn = container.querySelector('.direction-btn');
    dirBtn.addEventListener('click', () => getDirectionToPlace(p.id, feature.geometry.coordinates));
  });
}

// Reconfigure placesLayer to use onEachFeature
placesLayer.options.onEachFeature = bindPopupHandlers;

export function showDetail(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates; // [lon, lat]

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

  const imgContainer = document.getElementById('detailImageContainer');
  imgContainer.innerHTML = '';

  // Check if gallery exists and has images
  const gallery = p.gallery || [];
  if (gallery.length > 0) {
    // Create gallery carousel
    const carousel = document.createElement('div');
    carousel.className = 'image-gallery';
    carousel.innerHTML = `
      <div class="gallery-main">
        <button class="gallery-nav prev" id="galleryPrev">‹</button>
        <img id="galleryMainImage" src="${gallery[0].url}" alt="${p.name}">
        <button class="gallery-nav next" id="galleryNext">›</button>
      </div>
      <div class="gallery-counter">${1}/${gallery.length}</div>
      <div class="gallery-thumbnails" id="galleryThumbs"></div>
    `;
    imgContainer.appendChild(carousel);

    // Add thumbnails
    const thumbsContainer = document.getElementById('galleryThumbs');
    gallery.forEach((img, idx) => {
      const thumb = document.createElement('img');
      thumb.src = img.url;
      thumb.className = 'gallery-thumb' + (idx === 0 ? ' active' : '');
      thumb.onclick = () => showGalleryImage(idx, gallery);
      thumbsContainer.appendChild(thumb);
    });

    // Navigation handlers
    let currentIndex = 0;
    document.getElementById('galleryPrev').onclick = () => {
      currentIndex = (currentIndex - 1 + gallery.length) % gallery.length;
      showGalleryImage(currentIndex, gallery);
    };
    document.getElementById('galleryNext').onclick = () => {
      currentIndex = (currentIndex + 1) % gallery.length;
      showGalleryImage(currentIndex, gallery);
    };
  } else if (p.image_url) {
    // Fallback to single image
    const img = document.createElement('img');
    img.src = p.image_url;
    img.alt = p.name;
    imgContainer.appendChild(img);
  }

  // Show contact info and social media links
  const contactInfo = document.getElementById('detailContactInfo');
  contactInfo.innerHTML = '';

  const links = [];
  if (p.phone) {
    links.push(
      `<p><i class="fa-solid fa-phone text-blue-500"></i> <a href="tel:${p.phone}" style="color:#3b82f6;">${p.phone}</a></p>`
    );
  }
  if (p.website_url) {
    links.push(
      `<p><i class="fa-solid fa-globe text-blue-500"></i> <a href="${p.website_url}" target="_blank" rel="noopener" style="color:#3b82f6;">Вэбсайт</a></p>`
    );
  }
  if (p.facebook_url) {
    links.push(
      `<p><i class="fa-brands fa-facebook text-blue-500"></i> <a href="${p.facebook_url}" target="_blank" rel="noopener" style="color:#3b82f6;">Facebook</a></p>`
    );
  }
  if (p.instagram_url) {
    links.push(
      `<p><i class="fa-brands fa-instagram text-blue-500"></i> <a href="${p.instagram_url}" target="_blank" rel="noopener" style="color:#3b82f6;">Instagram</a></p>`
    );
  }

  if (links.length > 0) {
    contactInfo.innerHTML = links.join('');
  }

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
  addBtn.dataset.placeId = String(placeId);

  document.getElementById('detailPanel').classList.add('open');
}

export function addToBucket(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates;
  if (bucketList.some(item => item.id === placeId)) return;
  bucketList.push({
    id: placeId,
    name: p.name || 'Нэргүй',
    type: p.type,
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

function getDirectionToPlace(placeId, coords) {
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }
  // Close popup
  map.closePopup();
  // Call routing function
  showDirectRouteToPlace(coords);
}

export function removeFromBucket(placeId) {
  const idx = bucketList.findIndex(item => item.id === placeId);
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

// Wire detail panel buttons once
export function setupDetailPanel() {
  document.getElementById('closePanelBtn').addEventListener('click', () => {
    document.getElementById('detailPanel').classList.remove('open');
  });
  document.getElementById('addToBucketBtn').addEventListener('click', e => {
    const pid = Number(e.currentTarget.dataset.placeId);
    if (pid) addToBucket(pid);
  });
}

// Expose for popup inline handlers if any legacy HTML remains
window.showDetail = showDetail;
window.addToBucketQuick = addToBucketQuick;
window.removeFromBucket = removeFromBucket;

// Gallery helper function
function showGalleryImage(index, gallery) {
  const mainImg = document.getElementById('galleryMainImage');
  const counter = document.querySelector('.gallery-counter');
  const thumbs = document.querySelectorAll('.gallery-thumb');

  if (mainImg && gallery[index]) {
    mainImg.src = gallery[index].url;
  }
  if (counter) {
    counter.textContent = `${index + 1}/${gallery.length}`;
  }
  thumbs.forEach((thumb, idx) => {
    thumb.classList.toggle('active', idx === index);
  });
}
