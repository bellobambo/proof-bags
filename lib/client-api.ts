import type { ApiResponse } from "@/types/platform";

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload.data;
}
