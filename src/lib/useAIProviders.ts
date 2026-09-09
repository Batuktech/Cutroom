import { useCallback, useEffect, useState } from "react";
import type { ProviderStatus } from "../../shared/ai-providers";
import { api } from "./api";

export function useAIProviders(enabled = true) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setStatuses(await api<ProviderStatus[]>("/ai/providers")); setError(""); }
    catch (e) { setStatuses([]); setError((e as Error).message); }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void api<ProviderStatus[]>("/ai/providers", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setStatuses(data); setError(""); }
    }).catch(e => {
      if (!controller.signal.aborted) { setStatuses([]); setError((e as Error).message); }
    });
    return () => controller.abort();
  }, [enabled]);
  return { statuses, refresh, error };
}
