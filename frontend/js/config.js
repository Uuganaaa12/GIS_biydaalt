// Central configuration values
export const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5001'
    : 'http://localhost:5001';
