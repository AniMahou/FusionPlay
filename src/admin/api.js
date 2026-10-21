// Thin JSON client for /api/admin. A 401 sends the user back to the login screen.
export class ApiError extends Error {}

async function call(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.endsWith('/login')) { location.hash = '#/login'; throw new ApiError('Your session ended. Sign in again.'); }
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`);
  return data;
}

export const api = {
  get: (url) => call('GET', url),
  post: (url, body = {}) => call('POST', url, body),
  put: (url, body) => call('PUT', url, body),
  patch: (url, body) => call('PATCH', url, body),
  del: (url) => call('DELETE', url),
};

/** Read a File into a data URL and upload it; resolves to the stored file URL. */
export async function upload(file) {
  if (file.size > 8 * 1024 * 1024) throw new ApiError('Files must be under 8 MB.');
  const dataUrl = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file); });
  return (await api.post('/api/admin/upload', { dataUrl })).url;
}
