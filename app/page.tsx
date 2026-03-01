"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { buildGatewayUrl } from "@/lib/gateway-url";
import { GatewayStatus } from "./gateway-status";

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
  session?: {
    lastActive: number | null;
    totalTokens: number;
    contextTokens: number;
    sessionCount: number;
    todayAvgResponseMs: number;
    messageCount: number;
    weeklyResponseMs: number[];
    weeklyTokens: number[];
  };
}

interface GroupChat {
  groupId: string;
  channel: string;
  agents: { id: string; emoji: string; name: string }[];
}

interface ConfigData {
  agents: Agent[];
  defaults: { model: string; fallbacks: string[] };
  providers?: { id: string; accessMode?: "auth" | "api_key" }[];
  gateway?: { port: number; token?: string; host?: string };
  groupChats?: GroupChat[];
}

interface DayStat {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messageCount: number;
  avgResponseMs: number;
}

interface AllStats {
  daily: DayStat[];
  weekly: DayStat[];
  monthly: DayStat[];
}

type TimeRange = "daily" | "weekly" | "monthly";

type TFunc = (key: string) => string;

let cachedHomeData: ConfigData | null = null;
let cachedHomeError: string | null = null;
let cachedHomeAllStats: AllStats | null = null;
let cachedHomeLastUpdated = "";
let cachedHomeRefreshInterval = 0;
let cachedHomeAgentStates: Record<string, string> = {};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatMs(ms: number): string {
  if (!ms) return "-";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

// 趋势折线图
function TrendChart({ data, lines, height = 180, t }: { data: DayStat[]; lines: { key: keyof DayStat; color: string; label: string }[]; height?: number; t: TFunc }) {
  if (data.length === 0) return <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">{t("common.noData")}</div>;

  const pad = { top: 16, right: 16, bottom: 50, left: 56 };
  const width = Math.max(500, data.length * 56 + pad.left + pad.right);
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  let maxVal = 0;
  for (const d of data) for (const l of lines) { const v = d[l.key] as number; if (v > maxVal) maxVal = v; }
  if (maxVal === 0) maxVal = 1;

  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i));

  function toX(i: number) { return pad.left + (i / (data.length - 1 || 1)) * chartW; }
  function toY(v: number) { return pad.top + chartH - (v / maxVal) * chartH; }

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="text-[var(--text-muted)]">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={pad.left} y1={toY(tick)} x2={width - pad.right} y2={toY(tick)} stroke="currentColor" opacity={0.12} />
            <text x={pad.left - 8} y={toY(tick) + 4} textAnchor="end" fontSize={10} fill="currentColor">{formatTokens(tick)}</text>
          </g>
        ))}
        {lines.map((l) => {
          const points = data.map((d, i) => `${toX(i)},${toY(d[l.key] as number)}`).join(" ");
          return <polyline key={l.key} points={points} fill="none" stroke={l.color} strokeWidth={2} opacity={0.85} />;
        })}
        {lines.map((l) => data.map((d, i) => (
          <circle key={`${l.key}-${i}`} cx={toX(i)} cy={toY(d[l.key] as number)} r={3} fill={l.color} opacity={0.9}>
            <title>{`${d.date} ${l.label}: ${formatTokens(d[l.key] as number)}`}</title>
          </circle>
        )))}
        {data.map((d, i) => (
          <text key={i} x={toX(i)} y={height - pad.bottom + 16} textAnchor="middle" fontSize={9} fill="currentColor"
            transform={`rotate(-30, ${toX(i)}, ${height - pad.bottom + 16})`}>{d.date.slice(5)}</text>
        ))}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="currentColor" opacity={0.25} />
        <line x1={pad.left} y1={pad.top + chartH} x2={width - pad.right} y2={pad.top + chartH} stroke="currentColor" opacity={0.25} />
      </svg>
    </div>
  );
}

// 响应时间趋势图
function ResponseTrendChart({ data, height = 180, t }: { data: DayStat[]; height?: number; t: TFunc }) {
  const filtered = data.filter(d => d.avgResponseMs > 0);
  if (filtered.length === 0) return <div className="flex items-center justify-center h-32 text-[var(--text-muted)] text-sm">{t("home.noResponseData")}</div>;

  const pad = { top: 16, right: 16, bottom: 50, left: 56 };
  const width = Math.max(500, filtered.length * 56 + pad.left + pad.right);
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...filtered.map(d => d.avgResponseMs));

  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((maxVal / 4) * i));
  function toX(i: number) { return pad.left + (i / (filtered.length - 1 || 1)) * chartW; }
  function toY(v: number) { return pad.top + chartH - (v / maxVal) * chartH; }

  const points = filtered.map((d, i) => `${toX(i)},${toY(d.avgResponseMs)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="text-[var(--text-muted)]">
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={pad.left} y1={toY(tick)} x2={width - pad.right} y2={toY(tick)} stroke="currentColor" opacity={0.12} />
            <text x={pad.left - 8} y={toY(tick) + 4} textAnchor="end" fontSize={10} fill="currentColor">{formatMs(tick)}</text>
          </g>
        ))}
        <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth={2} opacity={0.85} />
        {filtered.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.avgResponseMs)} r={3} fill="#f59e0b" opacity={0.9}>
            <title>{`${d.date}: ${formatMs(d.avgResponseMs)}`}</title>
          </circle>
        ))}
        {filtered.map((d, i) => (
          <text key={`l-${i}`} x={toX(i)} y={height - pad.bottom + 16} textAnchor="middle" fontSize={9} fill="currentColor"
            transform={`rotate(-30, ${toX(i)}, ${height - pad.bottom + 16})`}>{d.date.slice(5)}</text>
        ))}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="currentColor" opacity={0.25} />
        <line x1={pad.left} y1={pad.top + chartH} x2={width - pad.right} y2={pad.top + chartH} stroke="currentColor" opacity={0.25} />
      </svg>
    </div>
  );
}

// 平台测试结果类型
interface PlatformTestResult {
  ok: boolean;
  reply?: string;
  detail?: string;
  error?: string;
  elapsed: number;
}

// 平台标签颜色
function PlatformBadge({ platform, agentId, gatewayPort, gatewayToken, gatewayHost, t, testResult }: { platform: Platform; agentId: string; gatewayPort: number; gatewayToken?: string; gatewayHost?: string; t: TFunc; testResult?: PlatformTestResult | null }) {
  const pName = platform.name;
  const badgeWidthClass = "w-[8.25rem]";
  const remoteLogoSrc = pName === "feishu"
    ? "https://cdn.simpleicons.org/lark/2E5BFF"
    : pName === "telegram"
    ? "https://cdn.simpleicons.org/telegram/26A5E4"
    : pName === "whatsapp"
    ? "https://cdn.simpleicons.org/whatsapp/25D366"
    : "https://cdn.simpleicons.org/discord/5865F2";
  const logoFallbackSrc = pName === "feishu"
    ? "/assets/platform-logos/feishu-favicon.png?v=1"
    : pName === "telegram"
    ? "/assets/platform-logos/telegram.svg"
    : pName === "whatsapp"
    ? "/assets/platform-logos/whatsapp.svg"
    : "/assets/platform-logos/discord.svg";
  const logoSizeClass = pName === "feishu" ? "w-[1.09375rem] h-[1.09375rem]" : "w-3.5 h-3.5";

  let sessionKey: string;
  if (pName === "feishu" && platform.botOpenId) {
    sessionKey = `agent:${agentId}:feishu:direct:${platform.botOpenId}`;
  } else if (pName === "discord" && platform.botUserId) {
    sessionKey = `agent:${agentId}:discord:direct:${platform.botUserId}`;
  } else if (pName === "telegram" && platform.botUserId) {
    sessionKey = `agent:${agentId}:telegram:direct:${platform.botUserId}`;
  } else if (pName === "whatsapp" && platform.botUserId) {
    sessionKey = `agent:${agentId}:whatsapp:direct:${platform.botUserId}`;
  } else {
    sessionKey = `agent:${agentId}:main`;
  }
  let sessionUrl = buildGatewayUrl(gatewayPort, "/chat", { session: sessionKey }, gatewayHost);
  if (gatewayToken) sessionUrl = buildGatewayUrl(gatewayPort, "/chat", { session: sessionKey, token: gatewayToken }, gatewayHost);

  const badgeStyle = pName === "feishu"
    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/40 hover:border-blue-400"
    : pName === "telegram"
    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/40 hover:border-sky-400"
    : pName === "whatsapp"
    ? "bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/40 hover:border-green-400"
    : "bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/40 hover:border-purple-400";

  const labelRaw = pName === "feishu" ? t("platform.feishu")
    : pName === "telegram" ? t("platform.telegram")
    : pName === "whatsapp" ? t("platform.whatsapp")
    : t("platform.discord");
  const label = labelRaw.replace(/^[^\p{L}\p{N}]+/u, "").trim();

  return (
    <div className="inline-flex items-center gap-1.5 max-w-full">
      <a
        href={sessionUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={t("agent.openChat")}
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all hover:scale-105 hover:shadow-md min-w-0 ${badgeWidthClass} ${badgeStyle}`}
      >
        <img
          src={remoteLogoSrc}
          alt={`${label} logo`}
          className={`${logoSizeClass} shrink-0`}
          onError={(e) => {
            if (e.currentTarget.dataset.fallbackApplied === "1") return;
            e.currentTarget.dataset.fallbackApplied = "1";
            e.currentTarget.src = logoFallbackSrc;
          }}
        />
        <span className="shrink-0">{label}</span>
        {pName === "feishu" && platform.accountId && (
          <span className="opacity-60 truncate max-w-[4.5rem]">({platform.accountId})</span>
        )}
        <span className="opacity-50 text-[10px]">↗</span>
      </a>
      {testResult === undefined ? (
        <span className="inline-flex w-5 justify-end text-xs text-[var(--text-muted)]">--</span>
      ) : testResult === null ? (
        <span className="inline-flex w-5 justify-end text-xs text-[var(--text-muted)] animate-pulse">⏳</span>
      ) : testResult.ok ? (
        <span className="inline-flex w-5 justify-end text-green-400 text-sm cursor-help" title={`${testResult.elapsed}ms${testResult.detail ? ' · ' + testResult.detail : testResult.reply ? ' · ' + testResult.reply : ''}`}>✅</span>
      ) : (
        <span className="inline-flex w-5 justify-end text-red-400 text-sm cursor-help" title={testResult.error || ''}>❌</span>
      )}
    </div>
  );
}

// 模型标签
function ModelBadge({ model, accessMode }: { model: string; accessMode?: "auth" | "api_key" }) {
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
      🧠 {modelName}{accessMode ? ` (${accessMode})` : ""}
    </span>
  );
}

// 迷你曲线图 (sparkline)
function MiniSparkline({ data, width = 120, height = 24, color: fixedColor }: { data: number[]; width?: number; height?: number; color?: string }) {
  const hasData = data.some(v => v > 0);
  if (!hasData) return null;

  // 判断趋势：最后一天 vs 前一天（跳过0值找最近两个有效值）
  const validValues = data.filter(v => v > 0);
  let trending: "up" | "down" | "flat" = "flat";
  if (validValues.length >= 2) {
    const last = validValues[validValues.length - 1];
    const prev = validValues[validValues.length - 2];
    trending = last > prev ? "up" : last < prev ? "down" : "flat";
  }
  const color = fixedColor || (trending === "up" ? "#f87171" : trending === "down" ? "#4ade80" : "#f59e0b");

  const max = Math.max(...data);
  const min = Math.min(...data.filter(v => v > 0), max);
  const range = max - min || 1;
  const pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = v === 0 ? height - pad : (height - pad) - ((v - min) / range) * (height - pad * 2 - 2);
    return { x, y, v };
  });
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `${pts[0].x},${height} ${line} ${pts[pts.length - 1].x},${height}`;
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={width} height={height} className="inline-block align-middle" aria-label={data.map(v => v ? formatMs(v) : '-').join(' → ')}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${id})`} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.filter(p => p.v > 0).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} opacity={0.9} />
        ))}
      </svg>
    </span>
  );
}

// Agent 状态标签
function AgentStatusBadge({ state, t }: { state?: string; t: TFunc }) {
  const config: Record<string, { dot: string; text: string; color: string; pulse?: boolean }> = {
    working: { dot: "bg-green-400", text: t("agent.status.working"), color: "text-green-400", pulse: true },
    online: { dot: "bg-green-400", text: t("agent.status.online"), color: "text-green-400" },
    idle: { dot: "bg-yellow-400", text: t("agent.status.idle"), color: "text-yellow-400" },
    offline: { dot: "bg-red-400", text: t("agent.status.offline"), color: "text-red-400" },
  };
  const c = config[state || "offline"] || config.offline;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${c.color}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${c.dot} ${c.pulse ? "animate-pulse" : ""}`} />
      {c.text}
    </span>
  );
}

// Agent 卡片
function AgentCard({ agent, gatewayPort, gatewayToken, gatewayHost, t, testResult, platformTestResults, sessionTestResult, agentState, dmSessionResults, providerAccessModeMap }: { agent: Agent; gatewayPort: number; gatewayToken?: string; gatewayHost?: string; t: TFunc; testResult?: { ok: boolean; text?: string; error?: string; elapsed: number } | null; platformTestResults?: Record<string, PlatformTestResult | null>; sessionTestResult?: { ok: boolean; reply?: string; error?: string; elapsed: number } | null; agentState?: string; dmSessionResults?: Record<string, PlatformTestResult | null>; providerAccessModeMap?: Record<string, "auth" | "api_key"> }) {
  const sessionKey = `agent:${agent.id}:main`;
  let sessionUrl = buildGatewayUrl(gatewayPort, "/chat", { session: sessionKey }, gatewayHost);
  if (gatewayToken) sessionUrl = buildGatewayUrl(gatewayPort, "/chat", { session: sessionKey, token: gatewayToken }, gatewayHost);
  const modelProvider = agent.model.includes("/") ? agent.model.split("/", 1)[0] : "default";
  const modelAccessMode = providerAccessModeMap?.[modelProvider];

  function formatTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("common.justNow");
    if (mins < 60) return `${mins} ${t("common.minutesAgo")}`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ${t("common.hoursAgo")}`;
    const days = Math.floor(hours / 24);
    return `${days} ${t("common.daysAgo")}`;
  }

  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-2.5 hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xl">{agent.emoji}</span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">{agent.name}</h3>
        </div>
        <AgentStatusBadge state={agentState} t={t} />
      </div>

      <div className="space-y-1">
        <div>
          <span className="text-xs text-[var(--text-muted)] block">Agent ID</span>
          <div className="flex items-center gap-2">
            <a href={sessionUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all hover:scale-105 hover:shadow-md bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/40">
              {agent.id}
              <span className="opacity-50 text-[10px]">↗</span>
            </a>
            {sessionTestResult === undefined ? (
              <span className="text-xs text-[var(--text-muted)]">--</span>
            ) : sessionTestResult === null ? (
              <span className="text-xs text-[var(--text-muted)] animate-pulse">⏳</span>
            ) : sessionTestResult.ok ? (
              <span className="text-green-400 text-sm cursor-help" title={`${sessionTestResult.elapsed}ms${sessionTestResult.reply ? ' · ' + sessionTestResult.reply : ''}`}>✅</span>
            ) : (
              <span className="text-red-400 text-sm cursor-help" title={sessionTestResult.error || ''}>❌</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-xs text-[var(--text-muted)] block">{t("agent.model")}</span>
          <div className="flex items-center gap-2">
            <ModelBadge model={agent.model} accessMode={modelAccessMode} />
            {testResult === undefined ? (
              <span className="text-xs text-[var(--text-muted)]">--</span>
            ) : testResult === null ? (
              <span className="text-xs text-[var(--text-muted)] animate-pulse">⏳</span>
            ) : testResult.ok ? (
              <span className="text-green-400 text-sm" title={`${testResult.elapsed}ms${testResult.text ? ' · ' + testResult.text : ''}`}>✅</span>
            ) : (
              <span className="text-red-400 text-sm cursor-help" title={testResult.error || ''}>❌</span>
            )}
          </div>
        </div>

        <div>
          <span className="text-xs text-[var(--text-muted)] block">{t("agent.platform")}</span>
          <div className="flex flex-col gap-1">
            {agent.platforms.map((p, i) => {
              const pKey = `${agent.id}:${p.name}`;
              const pResult = platformTestResults ? platformTestResults[pKey] : undefined;
              const dmKey = `${agent.id}:${p.name}`;
              const dmResult = dmSessionResults ? dmSessionResults[dmKey] : undefined;
              return (
                <div key={i} className="grid grid-cols-2 items-center gap-2">
                  <PlatformBadge platform={p} agentId={agent.id} gatewayPort={gatewayPort} gatewayToken={gatewayToken} gatewayHost={gatewayHost} t={t} testResult={pResult} />
                  <div className="flex justify-end">
                    {dmResult === undefined ? (
                      <span className="text-sm text-[var(--text-muted)]">DM Session: --</span>
                    ) : dmResult === null ? (
                      <span className="text-sm text-[var(--text-muted)] animate-pulse">DM Session: ⏳</span>
                    ) : dmResult.ok ? (
                      <span className="text-green-400 text-sm cursor-help" title={`DM Session ${dmResult.elapsed}ms${dmResult.detail ? ' · ' + dmResult.detail : ''}`}>DM Session: ✅</span>
                    ) : (
                      <span className="text-red-400 text-sm cursor-help" title={dmResult.error || ''}>DM Session: ❌</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {agent.session && (
          <div className="pt-1 mt-1 border-t border-[var(--border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">{t("agent.sessionCount")}</span>
              <div className="flex items-center gap-2">
                <a
                  href={`/sessions?agent=${agent.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[var(--accent)] hover:underline cursor-pointer"
                >
                  {agent.session.sessionCount} →
                </a>
                <a
                  href={`/stats?agent=${agent.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[var(--accent)] hover:underline cursor-pointer text-[10px]"
                >
                  📊 {t("agent.stats")}
                </a>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[var(--text-muted)]">{t("agent.messageCount")}</span>
              <span className="text-[var(--text)]">{agent.session.messageCount}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[var(--text-muted)]">{t("agent.tokenUsage")}</span>
              {agent.session.weeklyTokens && <MiniSparkline data={agent.session.weeklyTokens} color="#4ade80" />}
              <span className="text-[var(--text)] cursor-help" title={t("agent.totalTokenTip")}>{formatTokens(agent.session.totalTokens)}</span>
            </div>
            {agent.session.lastActive && (
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-[var(--text-muted)]">{t("agent.lastActive")}</span>
                <span className="text-[var(--text)]">{formatTimeAgo(agent.session.lastActive)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-[var(--text-muted)]">{t("agent.todayAvgResponse")}</span>
              {agent.session.weeklyResponseMs && <MiniSparkline data={agent.session.weeklyResponseMs} />}
              {(() => {
                const val = agent.session.todayAvgResponseMs;
                const weekly = agent.session.weeklyResponseMs || [];
                const validVals = weekly.filter(v => v > 0);
                let arrow = "";
                if (validVals.length >= 2) {
                  const last = validVals[validVals.length - 1];
                  const prev = validVals[validVals.length - 2];
                  arrow = last > prev ? "↗" : last < prev ? "↘" : "";
                }
                const colorClass = !val ? "text-[var(--text-muted)]"
                  : val > 50000 ? "text-red-400"
                  : val > 30000 ? "text-yellow-400"
                  : "text-green-400";
                return (
                  <span title={t("agent.todayAvgResponseTip")} className={`font-mono cursor-help ${colorClass}`}>
                    {val ? formatMs(val) : "--"}{arrow && <span className="ml-0.5">{arrow}</span>}
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        {/* test result moved inline next to model badge */}
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const [data, setData] = useState<ConfigData | null>(cachedHomeData);
  const [error, setError] = useState<string | null>(cachedHomeError);
  const [refreshInterval, setRefreshInterval] = useState(cachedHomeRefreshInterval);
  const [lastUpdated, setLastUpdated] = useState<string>(cachedHomeLastUpdated);
  const [loading, setLoading] = useState(false);
  const [allStats, setAllStats] = useState<AllStats | null>(cachedHomeAllStats);
  const [statsRange, setStatsRange] = useState<TimeRange>("daily");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; text?: string; error?: string; elapsed: number }> | null>(null);
  const [testing, setTesting] = useState(false);
  const [platformTestResults, setPlatformTestResults] = useState<Record<string, PlatformTestResult | null> | null>(null);
  const [testingPlatforms, setTestingPlatforms] = useState(false);
  const [sessionTestResults, setSessionTestResults] = useState<Record<string, { ok: boolean; reply?: string; error?: string; elapsed: number } | null> | null>(null);
  const [testingSessions, setTestingSessions] = useState(false);
  const [dmSessionResults, setDmSessionResults] = useState<Record<string, PlatformTestResult | null> | null>(null);
  const [testingDmSessions, setTestingDmSessions] = useState(false);
  const [agentStates, setAgentStates] = useState<Record<string, string>>(cachedHomeAgentStates);

  const RANGE_LABELS: Record<TimeRange, string> = { daily: t("range.daily"), weekly: t("range.weekly"), monthly: t("range.monthly") };

  const REFRESH_OPTIONS = [
    { label: t("refresh.manual"), value: 0 },
    { label: t("refresh.10s"), value: 10 },
    { label: t("refresh.30s"), value: 30 },
    { label: t("refresh.1m"), value: 60 },
    { label: t("refresh.5m"), value: 300 },
    { label: t("refresh.10m"), value: 600 },
  ];

  const parseApiPayload = useCallback(async (resp: Response) => {
    const raw = await resp.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {}
    const errorText = parsed?.error || raw || `HTTP ${resp.status}`;
    return { ok: resp.ok, status: resp.status, data: parsed, errorText };
  }, []);

  const callTestApi = useCallback(async (url: string) => {
    const requestWithMethod = async (method: "POST" | "GET") => {
      const resp = await fetch(url, { method, cache: "no-store" });
      return parseApiPayload(resp);
    };

    const first = await requestWithMethod("POST");
    if (first.ok) return first.data;

    const methodIssue = first.status === 405 || /method not allowed/i.test(first.errorText || "");
    if (!methodIssue) throw new Error(first.errorText);

    const fallback = await requestWithMethod("GET");
    if (fallback.ok) return fallback.data;
    throw new Error(fallback.errorText || first.errorText);
  }, [parseApiPayload]);

  const fetchData = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/stats-all").then((r) => r.json()),
    ])
      .then(([configData, statsData]) => {
        if (configData.error) {
          setError(configData.error);
          cachedHomeError = configData.error;
        } else {
          setData(configData);
          setError(null);
          cachedHomeData = configData;
          cachedHomeError = null;
        }
        if (!statsData.error) {
          setAllStats(statsData);
          cachedHomeAllStats = statsData;
        }
        const updated = new Date().toLocaleTimeString("zh-CN");
        setLastUpdated(updated);
        cachedHomeLastUpdated = updated;
      })
      .catch((e) => {
        setError(e.message);
        cachedHomeError = e.message;
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  // 首次加载 - 从 localStorage 恢复测试状态
  useEffect(() => {
    fetchData(!!cachedHomeData);
    const savedTestResults = localStorage.getItem('agentTestResults');
    if (savedTestResults) {
      try {
        setTestResults(JSON.parse(savedTestResults));
      } catch (e) {
        console.error('Failed to parse testResults from localStorage', e);
      }
    }
    const savedPlatformTestResults = localStorage.getItem('platformTestResults');
    if (savedPlatformTestResults) {
      try {
        setPlatformTestResults(JSON.parse(savedPlatformTestResults));
      } catch (e) {
        console.error('Failed to parse platformTestResults from localStorage', e);
      }
    }
    const savedSessionTestResults = localStorage.getItem('sessionTestResults');
    if (savedSessionTestResults) {
      try {
        setSessionTestResults(JSON.parse(savedSessionTestResults));
      } catch (e) {
        console.error('Failed to parse sessionTestResults from localStorage', e);
      }
    }
    const savedDmSessionResults = localStorage.getItem('dmSessionResults');
    if (savedDmSessionResults) {
      try {
        setDmSessionResults(JSON.parse(savedDmSessionResults));
      } catch (e) {
        console.error('Failed to parse dmSessionResults from localStorage', e);
      }
    }
  }, [fetchData]);

  useEffect(() => {
    cachedHomeRefreshInterval = refreshInterval;
  }, [refreshInterval]);

  // 保存测试结果到 localStorage
  useEffect(() => {
    if (testResults) {
      localStorage.setItem('agentTestResults', JSON.stringify(testResults));
    }
  }, [testResults]);

  useEffect(() => {
    if (platformTestResults) {
      localStorage.setItem('platformTestResults', JSON.stringify(platformTestResults));
    }
  }, [platformTestResults]);

  useEffect(() => {
    if (sessionTestResults) {
      localStorage.setItem('sessionTestResults', JSON.stringify(sessionTestResults));
    }
  }, [sessionTestResults]);

  useEffect(() => {
    if (dmSessionResults) {
      localStorage.setItem('dmSessionResults', JSON.stringify(dmSessionResults));
    }
  }, [dmSessionResults]);

  const testAllAgents = useCallback(() => {
    setTesting(true);
    // Set all agents to null (testing indicator) so UI shows ⏳
    const pending: Record<string, any> = {};
    if (data) for (const a of data.agents) pending[a.id] = null;
    setTestResults(pending);
    callTestApi("/api/test-agents")
      .then((resp) => {
        if (resp.results) {
          const map: Record<string, { ok: boolean; text?: string; error?: string; elapsed: number }> = {};
          for (const r of resp.results) map[r.agentId] = r;
          setTestResults(map);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        const failed: Record<string, { ok: boolean; error: string; elapsed: number }> = {};
        if (data) for (const a of data.agents) failed[a.id] = { ok: false, error: msg, elapsed: 0 };
        setTestResults(failed);
      })
      .finally(() => setTesting(false));
  }, [data, callTestApi]);

  const testAllPlatforms = useCallback(() => {
    setTestingPlatforms(true);
    // Set all agent:platform combos to null (⏳)
    const pending: Record<string, any> = {};
    if (data) {
      for (const a of data.agents) {
        for (const p of a.platforms) {
          pending[`${a.id}:${p.name}`] = null;
        }
      }
    }
    setPlatformTestResults(pending);
    callTestApi("/api/test-platforms")
      .then((resp) => {
        if (resp.results) {
          const map: Record<string, PlatformTestResult> = {};
          for (const r of resp.results) map[`${r.agentId}:${r.platform}`] = r;
          setPlatformTestResults(map);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        const failed: Record<string, PlatformTestResult> = {};
        if (data) {
          for (const a of data.agents) {
            for (const p of a.platforms) {
              failed[`${a.id}:${p.name}`] = {
                ok: false,
                error: msg,
                elapsed: 0,
              };
            }
          }
        }
        setPlatformTestResults(failed);
      })
      .finally(() => setTestingPlatforms(false));
  }, [data, callTestApi]);

  const testAllSessions = useCallback(() => {
    setTestingSessions(true);
    const pending: Record<string, any> = {};
    if (data) for (const a of data.agents) pending[a.id] = null;
    setSessionTestResults(pending);
    callTestApi("/api/test-sessions")
      .then((resp) => {
        if (resp.results) {
          const map: Record<string, { ok: boolean; reply?: string; error?: string; elapsed: number }> = {};
          for (const r of resp.results) map[r.agentId] = r;
          setSessionTestResults(map);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        const failed: Record<string, { ok: boolean; error: string; elapsed: number }> = {};
        if (data) for (const a of data.agents) failed[a.id] = { ok: false, error: msg, elapsed: 0 };
        setSessionTestResults(failed);
      })
      .finally(() => setTestingSessions(false));
  }, [data, callTestApi]);

  const testAllDmSessions = useCallback(() => {
    setTestingDmSessions(true);
    const pending: Record<string, any> = {};
    if (data) {
      for (const a of data.agents) {
        for (const p of a.platforms) {
          pending[`${a.id}:${p.name}`] = null;
        }
      }
    }
    setDmSessionResults(pending);
    callTestApi("/api/test-dm-sessions")
      .then((resp) => {
        if (resp.results) {
          const map: Record<string, PlatformTestResult> = {};
          for (const r of resp.results) map[`${r.agentId}:${r.platform}`] = r;
          setDmSessionResults(map);
        }
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Request failed";
        const failed: Record<string, PlatformTestResult> = {};
        if (data) {
          for (const a of data.agents) {
            for (const p of a.platforms) {
              failed[`${a.id}:${p.name}`] = {
                ok: false,
                error: msg,
                elapsed: 0,
              };
            }
          }
        }
        setDmSessionResults(failed);
      })
      .finally(() => setTestingDmSessions(false));
  }, [data, callTestApi]);

  // 定时刷新
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) {
      timerRef.current = setInterval(fetchData, refreshInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, fetchData]);

  // Agent 状态轮询 (30秒)
  useEffect(() => {
    const fetchStatus = () => {
      fetch("/api/agent-status")
        .then(r => r.json())
        .then(d => {
          if (d.statuses) {
            const map: Record<string, string> = {};
            for (const s of d.statuses) map[s.agentId] = s.state;
            setAgentStates(map);
            cachedHomeAgentStates = map;
          }
        })
        .catch(() => {});
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("common.loadError")}: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">{t("common.loading")}</p>
      </div>
    );
  }

  const providerAccessModeMap: Record<string, "auth" | "api_key"> = {};
  for (const p of data.providers || []) {
    if (!p?.id || !p.accessMode) continue;
    providerAccessModeMap[p.id] = p.accessMode;
  }
  return (
    <div className="p-3 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            🤖 {t("home.pageTitle")}
          </h1>
          <p className="text-[var(--text-muted)] text-xs mt-0.5">
            {t("models.totalPrefix")} {data.agents.length} {t("home.agentCount")} · {t("home.defaultModel")}: {data.defaults.model}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={testAllAgents}
            disabled={testing}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-sm font-medium hover:opacity-90 transition disabled:opacity-50 cursor-pointer"
          >
            {testing ? t("home.testingAll") : t("home.testAll")}
          </button>
          <button
            onClick={testAllPlatforms}
            disabled={testingPlatforms}
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:border-[var(--accent)] transition disabled:opacity-50 cursor-pointer"
          >
            {testingPlatforms ? t("home.testingPlatforms") : t("home.testPlatforms")}
          </button>
          <button
            onClick={testAllSessions}
            disabled={testingSessions}
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:border-[var(--accent)] transition disabled:opacity-50 cursor-pointer"
          >
            {testingSessions ? t("home.testingSessions") : t("home.testSessions")}
          </button>
          <button
            onClick={testAllDmSessions}
            disabled={testingDmSessions}
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:border-[var(--accent)] transition disabled:opacity-50 cursor-pointer"
          >
            {testingDmSessions ? t("home.testingDmSessions") : t("home.testDmSessions")}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <GatewayStatus />
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--text)] cursor-pointer hover:border-[var(--accent)] transition"
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.value === 0 ? `🔄 ${opt.label}` : `⏱️ ${opt.label}`}
              </option>
            ))}
          </select>
          {refreshInterval === 0 && (
            <button
              onClick={() => fetchData(false)}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm hover:border-[var(--accent)] transition disabled:opacity-50"
            >
              {loading ? "⏳" : "🔄"}
            </button>
          )}
          {lastUpdated && (
            <span className="text-xs text-[var(--text-muted)]">
              {t("home.updatedAt")} {lastUpdated}
            </span>
          )}
        </div>
      </div>

      {/* 卡片墙 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} gatewayPort={data.gateway?.port || 18789} gatewayToken={data.gateway?.token} gatewayHost={data.gateway?.host} t={t} testResult={testResults?.[agent.id]} platformTestResults={platformTestResults || undefined} sessionTestResult={sessionTestResults?.[agent.id]} agentState={agentStates[agent.id]} dmSessionResults={dmSessionResults || undefined} providerAccessModeMap={providerAccessModeMap} />
        ))}
      </div>

      {/* 汇总统计趋势 */}
      {allStats && (
        <div className="mt-8 p-5 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--text)]">{t("home.globalTrend")}</h2>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
              {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
                <button key={r} onClick={() => setStatsRange(r)}
                  className={`px-3 py-1 text-xs transition ${statsRange === r ? "bg-[var(--accent)] text-[var(--bg)] font-medium" : "bg-[var(--bg)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                >{RANGE_LABELS[r]}</button>
              ))}
            </div>
          </div>
          {(() => {
            const currentData = allStats[statsRange];
            const totalInput = currentData.reduce((s, d) => s + d.inputTokens, 0);
            const totalOutput = currentData.reduce((s, d) => s + d.outputTokens, 0);
            const totalMsgs = currentData.reduce((s, d) => s + d.messageCount, 0);
            return (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[10px] text-[var(--text-muted)]">{t("home.totalInputToken")}</div>
                    <div className="text-lg font-bold text-blue-400">{formatTokens(totalInput)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[10px] text-[var(--text-muted)]">{t("home.totalOutputToken")}</div>
                    <div className="text-lg font-bold text-emerald-400">{formatTokens(totalOutput)}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                    <div className="text-[10px] text-[var(--text-muted)]">{t("home.totalMessages")}</div>
                    <div className="text-lg font-bold text-purple-400">{totalMsgs}</div>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[var(--text-muted)]">{t("home.tokenTrend")}</span>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Input</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Output</span>
                    </div>
                  </div>
                  <TrendChart data={currentData} lines={[
                    { key: "inputTokens", color: "#3b82f6", label: "Input" },
                    { key: "outputTokens", color: "#10b981", label: "Output" },
                  ]} t={t} />
                </div>
                {statsRange === "daily" && (
                  <div>
                    <span className="text-xs text-[var(--text-muted)]">{t("home.avgResponseTrend")}</span>
                    <ResponseTrendChart data={currentData} t={t} />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* 群聊管理 */}
      {data.groupChats && data.groupChats.length > 0 && (
        <div className="mt-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-3">
            {t("home.groupTopology")}
          </h2>
          <div className="space-y-3">
            {data.groupChats.map((group, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                <span className="text-lg">{group.channel === "feishu" ? "📱" : "🎮"}</span>
                <div className="flex-1">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {group.channel === "feishu" ? t("home.feishuGroup") : t("home.discordChannel")} · {group.groupId.split(":")[1]}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.agents.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--card)] border border-[var(--border)]">
                        {a.emoji} {a.name}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-[var(--text-muted)]">{group.agents.length} {t("home.bots")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback 信息 */}
      {data.defaults.fallbacks.length > 0 && (
        <div className="mt-8 p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-2">
            {t("home.fallbackModels")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.defaults.fallbacks.map((f, i) => (
              <ModelBadge key={i} model={f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
