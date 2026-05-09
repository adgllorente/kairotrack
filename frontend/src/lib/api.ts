async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (res.status === 401) {
    if (!path.startsWith('/api/auth/')) {
      window.location.href = '/login';
    }
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // ignore JSON parse errors; keep the default message
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export type Project = {
  id: number;
  name: string;
  color: string;
  archived_at: number | null;
  created_at: number;
};
export type Task = {
  id: number;
  project_id: number;
  name: string;
  archived_at: number | null;
  created_at: number;
};
export type Track = {
  id: number;
  project_id: number;
  task_id: number | null;
  note: string;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
};
export type ApiKey = {
  id: number;
  label: string;
  prefix: string;
  last_used_at: number | null;
  created_at: number;
  revoked_at: number | null;
};
export type ApiKeyCreated = ApiKey & { key: string };
