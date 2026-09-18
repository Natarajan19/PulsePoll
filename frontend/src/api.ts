export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/$/, "");
export const WS_URL = (import.meta.env.VITE_WS_URL || "ws://localhost:8080").replace(/\/$/, "");

export type PollOption = { id: string; text: string };
export type Poll = {
  id: string;
  shareCode: string;
  question: string;
  type: "single" | "multiple" | "quiz";
  options: PollOption[];
  status: string;
  createdAt: string;
};

export type ResultCount = { optionId: string; count: number };

export function voterId() {
  let id = localStorage.getItem("pulsepoll_voter_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("pulsepoll_voter_id", id);
  }
  return id;
}

export function authToken() {
  return localStorage.getItem("pulsepoll_token") || "";
}

export function saveAuth(token: string) {
  localStorage.setItem("pulsepoll_token", token);
}

export function clearAuth() {
  localStorage.removeItem("pulsepoll_token");
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data as T;
}
