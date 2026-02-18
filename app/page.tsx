"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface Platform {
  name: string;
  accountId?: string;
  appId?: string;
  botOpenId?: string;
  botUserId?: string;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  platforms: Platform[];
}

interface ConfigData {
  agents: Agent[];
  defaults: { model: string; fallbacks: string[] };
  gateway?: { port: number; token?: string };
}

// 平台标签颜色（可点击跳转到对应平台的 session chat 页面）
function PlatformBadge({ platform, agentId, gatewayPort, gatewayToken }: { platform: Platform; agentId: string; gatewayPort: number; gatewayToken?: string }) {
  const isFeishu = platform.name === "feishu";

  let sessionKey: string;
  if (isFeishu && platform.botOpenId) {
    sessionKey = `agent:${agentId}:feishu:direct:${platform.botOpenId}`;
  } else if (!isFeishu && platform.botUserId) {
    sessionKey = `agent:${agentId}:discord:direct:${platform.botUserId}`;
  } else {
    sessionKey = `agent:${agentId}:main`;
  }
  let sessionUrl = `http://localhost:${gatewayPort}/chat?session=${encodeURIComponent(sessionKey)}`;
  if (gatewayToken) sessionUrl += `&token=${encodeURIComponent(gatewayToken)}`;

  return (
    <a
      href={sessionUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition ${
        isFeishu
          ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
          : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
      }`}
    >
      {isFeishu ? "📱 飞书" : "🎮 Discord"}
      {platform.accountId && (
        <span className="opacity-60">({platform.accountId})</span>
      )}
    </a>
  );
}

// 模型标签
function ModelBadge({ model }: { model: string }) {
  const [provider, modelName] = model.includes("/")
    ? model.split("/", 2)
    : ["default", model];

  const colors: Record<string, string> = {
    "yunyi-claude": "bg-green-500/20 text-green-300 border-green-500/30",
    minimax: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    volcengine: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    bailian: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colors[provider] || "bg-gray-500/20 text-gray-300 border-gray-500/30"
      }`}
    >
      🧠 {modelName}
    </span>
  );
}

// Agent 卡片（点击跳转到 agent 的 main session chat 页面）
function AgentCard({ agent, gatewayPort, gatewayToken }: { agent: Agent; gatewayPort: number; gatewayToken?: string }) {
  const sessionKey = `agent:${agent.id}:main`;
  let sessionUrl = `http://localhost:${gatewayPort}/chat?session=${encodeURIComponent(sessionKey)}`;
  if (gatewayToken) sessionUrl += `&token=${encodeURIComponent(gatewayToken)}`;

  return (
    <a
      href={sessionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 hover:border-[var(--accent)] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{agent.emoji}</span>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">{agent.name}</h3>
          {agent.name !== agent.id && (
            <span className="text-xs text-[var(--text-muted)]">agentId: {agent.id}</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <span className="text-xs text-[var(--text-muted)] block mb-1">模型</span>
          <ModelBadge model={agent.model} />
        </div>

        <div>
          <span className="text-xs text-[var(--text-muted)] block mb-1">平台</span>
          <div className="flex flex-wrap gap-1">
            {agent.platforms.map((p, i) => (
              <PlatformBadge key={i} platform={p} agentId={agent.id} gatewayPort={gatewayPort} gatewayToken={gatewayToken} />
            ))}
          </div>
        </div>

        {agent.platforms.some((p) => p.appId) && (
          <div>
            <span className="text-xs text-[var(--text-muted)] block mb-1">飞书 App ID</span>
            <code className="text-xs text-[var(--accent)] bg-[var(--bg)] px-2 py-0.5 rounded">
              {agent.platforms.find((p) => p.appId)?.appId}
            </code>
          </div>
        )}
      </div>
    </a>
  );
}

// 刷新选项
const REFRESH_OPTIONS = [
  { label: "手动刷新", value: 0 },
  { label: "10 秒", value: 10 },
  { label: "30 秒", value: 30 },
  { label: "1 分钟", value: 60 },
  { label: "5 分钟", value: 300 },
  { label: "10 分钟", value: 600 },
];

export default function Home() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
        setLastUpdated(new Date().toLocaleTimeString("zh-CN"));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 首次加载
  useEffect(() => { fetchData(); }, [fetchData]);

  // 定时刷新
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) {
      timerRef.current = setInterval(fetchData, refreshInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, fetchData]);

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">加载失败: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">加载中...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🐾 OpenClaw Bot Dashboard
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            共 {data.agents.length} 个机器人 · 默认模型: {data.defaults.model}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 刷新控件 */}
          <div className="flex items-center gap-2">
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--text)] cursor-pointer hover:border-[var(--accent)] transition"
            >
              {REFRESH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.value === 0 ? "🔄 手动刷新" : `⏱️ ${opt.label}`}
                </option>
              ))}
            </select>
            {refreshInterval === 0 && (
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition disabled:opacity-50"
              >
                {loading ? "⏳" : "🔄"}
              </button>
            )}
          </div>
          {lastUpdated && (
            <span className="text-xs text-[var(--text-muted)]">
              更新于 {lastUpdated}
            </span>
          )}
          <Link
            href="/models"
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 transition"
          >
            查看模型列表 →
          </Link>
        </div>
      </div>

      {/* 卡片墙 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} gatewayPort={data.gateway?.port || 18789} gatewayToken={data.gateway?.token} />
        ))}
      </div>

      {/* Fallback 信息 */}
      {data.defaults.fallbacks.length > 0 && (
        <div className="mt-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2">
            🔄 Fallback 模型
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.defaults.fallbacks.map((f, i) => (
              <ModelBadge key={i} model={f} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
