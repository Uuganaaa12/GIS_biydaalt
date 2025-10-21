import { map } from './map.js';
import { loadCategories, loadPlaces } from './data.js';
import { setupInteractions } from './interactions.js';
import { updateBucketUI } from './ui.js';
import { setupDetailPanel } from './places.js';

(async function init() {
  updateBucketUI();
  await loadCategories();
  setupInteractions();
  setupDetailPanel();
  try {
    map.locate({
      setView: true,
      maxZoom: 15,
      timeout: 30000,
      maximumAge: 10000,
      enableHighAccuracy: true,
    });
  } catch (e) {
    console.warn('Auto locate skipped:', e);
  }
  await loadPlaces();
})();
