export function getApiUrl() {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

export function getWsUrl() {
  const env = process.env.NEXT_PUBLIC_WS_URL;
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3001";
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("cubino_token", token);
    else localStorage.removeItem("cubino_token");
  }
}

export function getAccessToken() {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("cubino_token");
  }
  return accessToken;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const hasBody = options.body !== undefined && options.body !== null && options.body !== "";
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (hasBody) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  const res = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  if (res.status === 401 && path !== "/api/v1/auth/refresh") {
    const refreshed = await fetch(`${getApiUrl()}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      const data = await refreshed.json();
      setAccessToken(data.accessToken);
      return api(path, options);
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? err.message ?? "Request failed");
  }
  return res.json();
}
