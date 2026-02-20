"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";

interface Model {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
}

interface Provider {
  id: string;
  api: string;
  models: Model[];
  usedBy: { id: string; emoji: string; name: string }[];
}

interface ModelStat {
  modelId: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  messageCount: number;
  avgResponseMs: number;
}

interface ConfigData {
  providers: Provider[];
  defaults: { model: string; fallbacks: string[] };
}

interface TestResult {
  ok: boolean;
  text?: string;
  error?: string;
  elapsed: number;
  model?: string;
}

// 格式化数字
function formatNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

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

export default function ModelsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<ConfigData | null>(null);
  const [modelStats, setModelStats] = useState<Record<string, ModelStat>>({});
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const testModel = async (providerId: string, modelId: string) => {
    const key = `${providerId}/${modelId}`;
    setTesting((prev) => ({ ...prev, [key]: true }));
    setTestResults((prev) => { const n = { ...prev }; delete n[key]; return n; });
    try {
      const resp = await fetch("/api/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, modelId }),
      });
      const result = await resp.json();
      setTestResults((prev) => ({ ...prev, [key]: result }));
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [key]: { ok: false, error: err.message, elapsed: 0 } }));
    } finally {
      setTesting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const testAllModels = async () => {
    if (!data) return;
    const pairs: { provider: string; modelId: string }[] = [];
    for (const p of data.providers) {
      if (p.models.length > 0) {
        for (const m of p.models) pairs.push({ provider: p.id, modelId: m.id });
      } else {
        const knownModels = Object.values(modelStats).filter(s => s.provider === p.id);
        for (const s of knownModels) pairs.push({ provider: s.provider, modelId: s.modelId });
      }
    }
    for (const pair of pairs) {
      testModel(pair.provider, pair.modelId);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/config").then((r) => r.json()),
      fetch("/api/stats-models").then((r) => r.json()),
    ])
      .then(([configData, statsData]) => {
        if (configData.error) setError(configData.error);
        else setData(configData);
        if (!statsData.error && statsData.models) {
          const map: Record<string, ModelStat> = {};
          for (const m of statsData.models) {
            map[`${m.provider}/${m.modelId}`] = m;
          }
          setModelStats(map);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
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

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {t("models.title")}
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            {t("models.totalPrefix")} {data.providers.length} {t("models.providerCount")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={testAllModels}
            disabled={Object.values(testing).some(Boolean)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              Object.values(testing).some(Boolean)
                ? "bg-gray-500/20 text-gray-400 cursor-wait"
                : "bg-[var(--accent)] text-[var(--bg)] hover:opacity-90 cursor-pointer"
            }`}
          >
            {Object.values(testing).some(Boolean) ? t("models.testingAll") : t("models.testAll")}
          </button>
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-medium hover:border-[var(--accent)] transition"
          >
            {t("common.backOverview")}
          </Link>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="space-y-6">
        {data.providers.map((provider) => (
          <div
            key={provider.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{provider.id}</h2>
                <span className="text-xs text-[var(--text-muted)]">
                  API: {provider.api}
                </span>
              </div>
              {provider.usedBy.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[var(--text-muted)] mr-1">{t("agent.inUse")}</span>
                  {provider.usedBy.map((a) => (
                    <span key={a.id} title={a.id} className="px-2 py-0.5 rounded-full bg-[var(--bg)] text-xs font-medium">
                      {a.emoji} {a.name || a.id}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {provider.models.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-muted)] text-xs border-b border-[var(--border)]">
                      <th className="text-left py-2 pr-4">{t("models.colModelId")}</th>
                      <th className="text-left py-2 pr-4">{t("models.colName")}</th>
                      <th className="text-left py-2 pr-4">{t("models.colContext")}</th>
                      <th className="text-left py-2 pr-4">{t("models.colMaxOutput")}</th>
                      <th className="text-left py-2 pr-4">{t("models.colInputType")}</th>
                      <th className="text-left py-2 pr-4">{t("models.colReasoning")}</th>
                      <th className="text-right py-2 pr-4">{t("models.colInputToken")}</th>
                      <th className="text-right py-2 pr-4">{t("models.colOutputToken")}</th>
                      <th className="text-right py-2 pr-4">{t("models.colAvgResponse")}</th>
                      <th className="text-center py-2">{t("models.colTest")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provider.models.map((m) => {
                      const stat = modelStats[`${provider.id}/${m.id}`];
                      const testKey = `${provider.id}/${m.id}`;
                      const isTesting = testing[testKey];
                      const result = testResults[testKey];
                      return (
                      <tr key={m.id} className="border-b border-[var(--border)]/50">
                        <td className="py-2 pr-4 font-mono text-[var(--accent)]">{m.id}</td>
                        <td className="py-2 pr-4">{m.name}</td>
                        <td className="py-2 pr-4">{formatNum(m.contextWindow)}</td>
                        <td className="py-2 pr-4">{formatNum(m.maxTokens)}</td>
                        <td className="py-2 pr-4">
                          <div className="flex gap-1">
                            {(m.input || []).map((inputType) => (
                              <span
                                key={inputType}
                                className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-xs"
                              >
                                {inputType === "text" ? "📝" : "🖼️"} {inputType}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 pr-4">{m.reasoning ? "✅" : "❌"}</td>
                        <td className="py-2 pr-4 text-right text-blue-400 font-mono text-xs">{stat ? formatTokens(stat.inputTokens) : "-"}</td>
                        <td className="py-2 pr-4 text-right text-emerald-400 font-mono text-xs">{stat ? formatTokens(stat.outputTokens) : "-"}</td>
                        <td className="py-2 pr-4 text-right text-amber-400 font-mono text-xs">{stat ? formatMs(stat.avgResponseMs) : "-"}</td>
                        <td className="py-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => testModel(provider.id, m.id)}
                              disabled={isTesting}
                              className={`px-2 py-1 rounded text-xs font-medium transition ${
                                isTesting
                                  ? "bg-gray-500/20 text-gray-400 cursor-wait"
                                  : "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/40 cursor-pointer"
                              }`}
                            >
                              {isTesting ? t("common.testing") : t("common.test")}
                            </button>
                            {result && (
                              <span className={`text-[10px] max-w-[140px] truncate ${result.ok ? "text-green-400" : "text-red-400"}`} title={result.ok ? result.text : result.error}>
                                {result.ok ? `✅ ${formatMs(result.elapsed)}` : `❌ ${result.error?.slice(0, 30)}`}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <p className="text-[var(--text-muted)] text-sm">
                  {t("models.noExplicitModels")}
                </p>
                {(() => {
                  const providerStats = Object.values(modelStats).filter(s => s.provider === provider.id);
                  if (providerStats.length === 0) return null;
                  const totalInput = providerStats.reduce((s, m) => s + m.inputTokens, 0);
                  const totalOutput = providerStats.reduce((s, m) => s + m.outputTokens, 0);
                  const allRt = providerStats.filter(m => m.avgResponseMs > 0);
                  const avgRt = allRt.length > 0 ? Math.round(allRt.reduce((s, m) => s + m.avgResponseMs, 0) / allRt.length) : 0;
                  return (
                    <div className="flex flex-wrap gap-3 mt-3 text-xs">
                      {providerStats.map(s => {
                        const testKey = `${s.provider}/${s.modelId}`;
                        const isTesting = testing[testKey];
                        const result = testResults[testKey];
                        return (
                        <div key={s.modelId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                          <span className="font-mono text-[var(--accent)]">{s.modelId}</span>
                          <span className="text-blue-400">Input: {formatTokens(s.inputTokens)}</span>
                          <span className="text-emerald-400">Output: {formatTokens(s.outputTokens)}</span>
                          <span className="text-amber-400">{formatMs(s.avgResponseMs)}</span>
                          <button
                            onClick={() => testModel(s.provider, s.modelId)}
                            disabled={isTesting}
                            className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                              isTesting
                                ? "bg-gray-500/20 text-gray-400 cursor-wait"
                                : "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/40 cursor-pointer"
                            }`}
                          >
                            {isTesting ? "⏳" : t("common.test")}
                          </button>
                          {result && (
                            <span className={`text-[10px] ${result.ok ? "text-green-400" : "text-red-400"}`} title={result.ok ? result.text : result.error}>
                              {result.ok ? `✅ ${formatMs(result.elapsed)}` : `❌ ${result.error?.slice(0, 30)}`}
                            </span>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
