/** Client-side fetch wrapper that understands the API's `{ ok, data, error }` envelope. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !envelope?.ok) {
    throw new ApiError(
      envelope?.error ?? `Request failed with status ${response.status}`,
      response.status,
    );
  }

  return envelope.data as T;
}
