import type { Job } from "../../shared/types";

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await response
    .json()
    .catch(() => ({
      error: "The local server returned an unreadable response.",
    }));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data as T;
}
export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export function uploadVideo(
  file: File,
  progress: (value: number) => void,
  signal?: AbortSignal,
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/projects");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || "Upload failed."));
      } catch {
        reject(new Error("The local server could not read this upload."));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Could not reach the local server. Check that Cutroom is running.",
        ),
      );
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    const body = new FormData();
    body.append("video", file);
    xhr.send(body);
  });
}
