const API = process.env.REACT_APP_API_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API}/api${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const login = (username, password) =>
  request('POST', '/auth/login', { username, password });

export const getEvents = (params) => {
  const q = new URLSearchParams(params || {}).toString();
  return request('GET', `/events?${q}`);
};

export const getEvent = (id) => request('GET', `/events/${id}`);

export const lockEvent = (id) => request('PUT', `/events/${id}/lock`);
export const unlockEvent = (id) => request('PUT', `/events/${id}/unlock`);

export const purgeEvents = (before) =>
  request('POST', '/events/purge', { before });

export const getFaces = () => request('GET', '/faces');

export const enrollFace = (label, embedding, imageBase64) =>
  request('POST', '/faces/enroll', { label, embedding, imageBase64 });

export const deleteFace = (id) => request('DELETE', `/faces/${id}`);

export const getConfig = () => request('GET', '/config');

export const updateConfig = (cfg) => request('PUT', '/config', cfg);

export const getStorageUsage = () => request('GET', '/storage/usage');

export const sendCommand = (type) =>
  request('POST', '/camera/command', { type });
