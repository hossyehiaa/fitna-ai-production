"use client";

// =====================================================================
// Client-side API helper.
// Sends the custom CSRF header required by verifyOrigin() on every
// state-changing request (see src/lib/security/csrf.ts).
// =====================================================================

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

async function request<T>(
  url: string,
  init: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(rest.headers || {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    credentials: "same-origin",
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = data as { error?: string; code?: string } | null;
    throw new ApiClientError(
      err?.error || "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
      res.status,
      err?.code
    );
  }
  return data as T;
}

export const api = {
  post: <T>(url: string, json?: unknown) => request<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) => request<T>(url, { method: "PATCH", json }),
  delete: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "DELETE", json: json as never }),
  get: <T>(url: string) => request<T>(url, { method: "GET" }),

  /** Multipart upload (audio) — no Content-Type override. */
  postForm: async <T>(url: string, form: FormData): Promise<T> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body: form,
      credentials: "same-origin",
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = data as { error?: string; code?: string } | null;
      throw new ApiClientError(
        err?.error || "حدث خطأ غير متوقع.",
        res.status,
        err?.code
      );
    }
    return data as T;
  },

  /** Binary fetch (TTS audio) returning a Blob. */
  postForBlob: async (url: string, json: unknown): Promise<Blob> => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(json),
      credentials: "same-origin",
    });
    if (!res.ok) {
      let msg = "تعذر توليد الصوت.";
      try {
        const err = (await res.json()) as { error?: string };
        if (err.error) msg = err.error;
      } catch {
        /* ignore */
      }
      throw new ApiClientError(msg, res.status);
    }
    return res.blob();
  },
};
