// Shared application state and helpers

export let allPlaces = [];

const BUCKET_KEY = 'ubBucketList';
export let bucketList = JSON.parse(localStorage.getItem(BUCKET_KEY) || '[]');

export function setAllPlaces(features) {
  allPlaces = features || [];
}

export function addToBucketState(item) {
  if (bucketList.some(b => b.id === item.id)) return false;
  bucketList.push(item);
  localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketList));
  return true;
}

export function removeFromBucketState(id) {
  const before = bucketList.length;
  bucketList = bucketList.filter(b => b.id !== id);
  localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketList));
  return bucketList.length !== before;
}

// User location
export let userLocation = null;
export let userLocationMarker = null;
export function setUserLocation(latlng, marker) {
  userLocation = latlng;
  userLocationMarker = marker || userLocationMarker;
}

// Last direct destination (for quick re-route on mode toggle)
export let lastDirectDestination = null; // [lon, lat]
export function setLastDirectDestination(coords) {
  if (Array.isArray(coords) && coords.length === 2) {
    lastDirectDestination = coords;
  }
}

// Track which route is currently active: 'none' | 'direct' | 'bucket'
export let currentRouteType = 'none';
export function setCurrentRouteType(type) {
  if (type === 'direct' || type === 'bucket' || type === 'none') {
    currentRouteType = type;
  }
}
