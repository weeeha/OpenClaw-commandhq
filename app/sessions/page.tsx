"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";

interface Session {
  key: string;
  type: string;
  target: string;
  sessionId: string | null;
  updatedAt: number;
  totalTokens: number;
  contextTokens: number;
  systemSent: boolean;
}

interface GatewayInfo {
  port: number;
  token?: string;
}

const TYPE_EMOJI_COLOR: Record<string, { emoji: string; color: string }> = {
  main: { emoji: "🏠", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  "feishu-dm": { emoji: "📱", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "feishu-group": { emoji: "👥", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  "discord-dm": { emoji: "🎮", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  "discord-channel": { emoji: "📢", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  cron: { emoji: "⏰", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  unknown: { emoji: "❓", color: "bg-gray-500/20 text-gray-300 border-gray-500/30" },
};

function formatTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("zh-CN");
}

export default function SessionsPage() {
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agent") || "";
  const [sessions, setSessions] = useState<Session[]>([]);
  const [gateway, setGateway] = useState<GatewayInfo>({ port: 18789 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  function formatTimeAgo(ts: number): string {
    if (!ts) return "-";
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("common.justNow");
    if (mins < 60) return `${mins} ${t("common.minutesAgo")}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ${t("common.hoursAgo")}`;
    const days = Math.floor(hours / 24);
    return `${days} ${t("common.daysAgo")}`;
  }

  function getTypeLabel(type: string): { label: string; emoji: string; color: string } {
    const info = TYPE_EMOJI_COLOR[type] || TYPE_EMOJI_COLOR.unknown;
    const labelKey = `sessions.type.${type}` as const;
    const label = t(TYPE_EMOJI_COLOR[type] ? labelKey : "sessions.type.unknown");
    return { ...info, label };
  }

  useEffect(() => {
    if (!agentId) return;
    Promise.all([
      fetch(`/api/sessions/${agentId}`).then((r) => r.json()),
      fetch("/api/config").then((r) => r.json()),
    ])
      .then(([sessData, configData]) => {
        if (sessData.error) setError(sessData.error);
        else setSessions(sessData.sessions || []);
        if (configData.gateway) setGateway(configData.gateway);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (!agentId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("sessions.missingAgent")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("common.loadError")}: {error}</p>
      </div>
    );
  }

  const totalTokens = sessions.reduce((sum, s) => sum + s.totalTokens, 0);

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📋 {agentId} {t("sessions.title")}</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {sessions.length} {t("sessions.sessionCount")} · {t("sessions.totalToken")}: {(totalTokens / 1000).toFixed(1)}k
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition"
          >
            {t("common.backHome")}
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {sessions.map((s) => {
          const typeInfo = getTypeLabel(s.type);
          let chatUrl = `http://localhost:${gateway.port}/chat?session=${encodeURIComponent(s.key)}`;
          if (gateway.token) chatUrl += `&token=${encodeURIComponent(gateway.token)}`;
          return (
            <div
              key={s.key}
              onClick={() => window.open(chatUrl, "_blank")}
              title={t("agent.openChat")}
              className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] transition cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${typeInfo.color}`}
                  >
                    {typeInfo.emoji} {typeInfo.label}
                  </span>
                  {s.target && (
                    <code className="text-xs text-[var(--text-muted)] bg-[var(--bg)] px-2 py-0.5 rounded">
                      {s.target}
                    </code>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">{formatTimeAgo(s.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span className="font-mono text-[10px] opacity-60">{s.key}</span>
                <div className="flex gap-4">
                  <span>Token: {(s.totalTokens / 1000).toFixed(1)}k</span>
                  <span>{formatTime(s.updatedAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
