"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

function resolveGatewayUrl(url?: string): string | undefined {
  if (!url || typeof window === "undefined") return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "localhost") parsed.hostname = window.location.hostname;
    return parsed.toString();
  } catch { return url; }
}

interface HealthResult {
  ok: boolean;
  error?: string;
  data?: any;
  webUrl?: string;
}

export function GatewayStatus() {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [showError, setShowError] = useState(false);

  const check = useCallback(() => {
    fetch("/api/gateway-health")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ ok: false, error: t("gateway.fetchError") }));
  }, [t]);

  useEffect(() => {
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, [check]);

  return (
    <div className="relative inline-flex items-center gap-2">
      <a
        href={health?.ok && health.webUrl ? resolveGatewayUrl(health.webUrl) : undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30 transition-colors cursor-pointer"
      >
        🌐 Gateway
        <span className="opacity-50 text-[10px]">↗</span>
      </a>
      {!health ? (
        <span className="text-xs text-[var(--text-muted)]">--</span>
      ) : health.ok ? (
        <span className="text-green-400 text-sm cursor-help" title={t("gateway.healthy")}>✅</span>
      ) : (
        <span
          className="text-red-400 text-sm cursor-pointer"
          title={health.error || t("gateway.unhealthy")}
          onClick={() => setShowError((v) => !v)}
        >❌</span>
      )}
      {showError && health && !health.ok && health.error && (
        <div className="absolute top-full left-0 mt-1 z-50 px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs max-w-64 whitespace-pre-wrap shadow-lg">
          {health.error}
        </div>
      )}
    </div>
  );
}
