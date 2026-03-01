"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, LanguageSwitcher } from "@/lib/i18n";
import { ThemeSwitcher } from "@/lib/theme";

const BUGS_ENABLED_KEY = "pixel-office-bugs-enabled";
const BUGS_COUNT_KEY = "pixel-office-bugs-count";
const BUGS_MAX = 400;

const NAV_ITEMS = [
  {
    group: "nav.overview",
    items: [
      { href: "/", icon: "🤖", labelKey: "nav.agents" },
      { href: "/models", icon: "🧠", labelKey: "nav.models" },
    ],
  },
  {
    group: "nav.monitor",
    items: [
      { href: "/sessions", icon: "💬", labelKey: "nav.sessions" },
      { href: "/stats", icon: "📊", labelKey: "nav.stats" },
      { href: "/alerts", icon: "🔔", labelKey: "nav.alerts" },
      { href: "/pixel-office", icon: "🎮", labelKey: "nav.pixelOffice" },
    ],
  },
  {
    group: "nav.config",
    items: [
      { href: "/skills", icon: "🧩", labelKey: "nav.skills" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [experimentOpen, setExperimentOpen] = useState(false);
  const [bugsEnabled, setBugsEnabled] = useState(false);
  const [bugsCount, setBugsCount] = useState(5);
  const [logoCarry, setLogoCarry] = useState<{ active: boolean; dx: number; dy: number; angle: number; hidden: boolean }>({
    active: false,
    dx: 0,
    dy: 0,
    angle: 0,
    hidden: false,
  });

  useEffect(() => {
    const onStart = () => setLogoCarry((s) => ({ ...s, active: true, hidden: false }));
    const onStop = () => setLogoCarry({ active: false, dx: 0, dy: 0, angle: 0, hidden: false });
    const onProgress = (e: Event) => {
      const ce = e as CustomEvent<{ active: boolean; dx: number; dy: number; angle: number; hidden: boolean }>;
      const d = ce.detail;
      if (!d) return;
      setLogoCarry({ active: !!d.active, dx: d.dx || 0, dy: d.dy || 0, angle: d.angle || 0, hidden: !!d.hidden });
    };
    window.addEventListener("openclaw-logo-drag-start", onStart as EventListener);
    window.addEventListener("openclaw-logo-drag-stop", onStop as EventListener);
    window.addEventListener("openclaw-logo-carry-progress", onProgress as EventListener);
    return () => {
      window.removeEventListener("openclaw-logo-drag-start", onStart as EventListener);
      window.removeEventListener("openclaw-logo-drag-stop", onStop as EventListener);
      window.removeEventListener("openclaw-logo-carry-progress", onProgress as EventListener);
    };
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const enabled = localStorage.getItem(BUGS_ENABLED_KEY) === "true";
      const raw = Number(localStorage.getItem(BUGS_COUNT_KEY) || "5");
      const count = Math.max(0, Math.min(BUGS_MAX, Number.isFinite(raw) ? raw : 5));
      setBugsEnabled(enabled);
      setBugsCount(count);
    };
    syncFromStorage();
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("openclaw-bugs-config-change", syncFromStorage as EventListener);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("openclaw-bugs-config-change", syncFromStorage as EventListener);
    };
  }, []);

  const toggleBugs = () => {
    const next = !bugsEnabled;
    setBugsEnabled(next);
    localStorage.setItem(BUGS_ENABLED_KEY, String(next));
    window.dispatchEvent(new CustomEvent("openclaw-bugs-config-change"));
  };

  const onBugCountChange = (nextCount: number) => {
    const clamped = Math.max(0, Math.min(BUGS_MAX, nextCount));
    setBugsCount(clamped);
    localStorage.setItem(BUGS_COUNT_KEY, String(clamped));
    window.dispatchEvent(new CustomEvent("openclaw-bugs-config-change"));
  };

  return (
    <>
      <aside
        className="sidebar"
        style={{ width: collapsed ? 64 : 224 }}
      >
        {/* Header: Logo + Toggle */}
        <div className="border-b border-[var(--border)]" style={{ padding: collapsed ? "16px 0" : "16px 20px" }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Link href="/">
                <span
                  className="relative inline-block transition-opacity duration-300"
                  style={{
                    fontSize: "4.219rem",
                    lineHeight: 1,
                    transform: `translate(${logoCarry.dx}px, ${logoCarry.dy}px) rotate(${logoCarry.angle}rad)`,
                    opacity: logoCarry.hidden ? 0 : 1,
                  }}
                >
                  🦞
                </span>
              </Link>
              <button
                onClick={() => setCollapsed(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                title="展开侧边栏"
              >
                »
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <span
                    className="relative inline-block transition-opacity duration-300"
                    style={{
                      fontSize: "4.219rem",
                      lineHeight: 1,
                      transform: `translate(${logoCarry.dx}px, ${logoCarry.dy}px) rotate(${logoCarry.angle}rad)`,
                      opacity: logoCarry.hidden ? 0 : 1,
                    }}
                  >
                    🦞
                  </span>
                  <div>
                    <div className="text-sm font-bold text-[var(--text)] tracking-wide">OPENCLAW</div>
                    <div className="text-[10px] text-[var(--text-muted)] tracking-wider">BOT DASHBOARD</div>
                  </div>
                </Link>
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-lg"
                  title="收起侧边栏"
                >
                  «
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 pl-8">
                <LanguageSwitcher />
                <ThemeSwitcher />
              </div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav className="sidebar-nav" style={{ padding: collapsed ? "16px 8px" : "16px 12px" }}>
          <div className="space-y-5">
            {NAV_ITEMS.map((group) => (
              <div key={group.group}>
                {!collapsed && (
                  <div className="px-2 mb-2 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-between">
                    {t(group.group)}
                    <span className="text-[var(--text-muted)] opacity-40">—</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? t(item.labelKey) : undefined}
                        className={`flex items-center rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                            : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)]"
                        }`}
                        style={{
                          padding: collapsed ? "8px 0" : "8px 12px",
                          justifyContent: collapsed ? "center" : "flex-start",
                          gap: collapsed ? 0 : 10,
                        }}
                      >
                        <span className="text-base">{item.icon}</span>
                        {!collapsed && t(item.labelKey)}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {!collapsed && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]/65 p-1">
                <button
                  onClick={() => setExperimentOpen((v) => !v)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                    experimentOpen
                      ? "bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/35"
                      : "bg-[var(--bg)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--accent)]/8"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">🧪</span>
                    <span className="text-sm font-semibold tracking-wide">实验功能</span>
                  </span>
                  <span
                    className={`inline-flex items-center justify-center text-base leading-none transition-transform ${
                      experimentOpen ? "text-[var(--accent)] rotate-180" : "text-[var(--text-muted)]"
                    }`}
                  >
                    ⌄
                  </span>
                </button>
                {experimentOpen && (
                  <div className="mt-2 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
                    <button
                      onClick={toggleBugs}
                      className={`w-full px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        bugsEnabled
                          ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]"
                          : "bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {bugsEnabled ? "🐛 Bugs On" : "🐛 Bugs Off"}
                    </button>
                    <label className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-lg border bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)]">
                      <span>Count {bugsCount}</span>
                      <input
                        type="range"
                        min={0}
                        max={BUGS_MAX}
                        step={1}
                        value={bugsCount}
                        onChange={(e) => onBugCountChange(Number(e.target.value))}
                        className="w-24 accent-[var(--accent)]"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
            {collapsed && (
              <button
                onClick={() => setCollapsed(false)}
                title="实验功能"
                className="w-full flex items-center justify-center rounded-lg px-2 py-2 text-base border border-[var(--border)] bg-[var(--card)]/65 text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                🧪
              </button>
            )}
          </div>
        </nav>
      </aside>

      {/* Spacer */}
      <div style={{ width: collapsed ? 64 : 224, flexShrink: 0, transition: "width 0.2s" }} />
    </>
  );
}
