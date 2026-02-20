"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";

interface Skill {
  id: string;
  name: string;
  description: string;
  emoji: string;
  source: string;
  usedBy: string[];
}

interface AgentInfo {
  name: string;
  emoji: string;
}

export default function SkillsPage() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "builtin" | "extension" | "custom">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setSkills(data.skills);
          setAgents(data.agents);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const filtered = skills.filter((s) => {
    if (filter === "builtin" && s.source !== "builtin") return false;
    if (filter === "extension" && !s.source.startsWith("extension:")) return false;
    if (filter === "custom" && s.source !== "custom") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sourceLabel = (s: string) => {
    if (s === "builtin") return t("skills.source.builtin");
    if (s.startsWith("extension:")) return s.replace("extension:", `${t("skills.extension")}:`);
    return t("skills.source.custom");
  };

  const sourceBadgeClass = (s: string) => {
    if (s === "builtin") return "bg-blue-500/20 text-blue-400";
    if (s.startsWith("extension:")) return "bg-purple-500/20 text-purple-400";
    return "bg-green-500/20 text-green-400";
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">{t("common.loadError")}: {error}</p>
      </div>
    );
  }

  const builtinCount = skills.filter((s) => s.source === "builtin").length;
  const extCount = skills.filter((s) => s.source.startsWith("extension:")).length;
  const customCount = skills.filter((s) => s.source === "custom").length;

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("skills.title")}</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            共 {skills.length} {t("skills.count")}（{t("skills.builtin")} {builtinCount} / {t("skills.extension")} {extCount} / {t("skills.custom")} {customCount}）
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link
            href="/"
            className="px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm font-medium hover:border-[var(--accent)] transition"
          >
            {t("common.backOverview")}
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {(["all", "builtin", "extension", "custom"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                filter === f
                  ? "bg-[var(--accent)] text-[var(--bg)]"
                  : "bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {f === "all" ? t("skills.all") : f === "builtin" ? t("skills.builtin") : f === "extension" ? t("skills.extension") : t("skills.custom")}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder={t("skills.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:border-[var(--accent)] transition w-64"
        />
        <span className="text-xs text-[var(--text-muted)]">
          {t("skills.showing")} {filtered.length} {t("skills.unit")}
        </span>
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((skill) => (
          <div
            key={`${skill.source}-${skill.id}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--accent)]/50 transition"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{skill.emoji}</span>
                <span className="font-semibold text-sm">{skill.name}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceBadgeClass(skill.source)}`}>
                {sourceLabel(skill.source)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3 min-h-[2.5em]">
              {skill.description || t("skills.noDesc")}
            </p>
            {skill.usedBy.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {skill.usedBy.map((agentId) => {
                  const agent = agents[agentId];
                  return (
                    <span
                      key={agentId}
                      className="px-1.5 py-0.5 rounded bg-[var(--bg)] text-[10px] font-medium"
                    >
                      {agent?.emoji || "🤖"} {agent?.name || agentId}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
