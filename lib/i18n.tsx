"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type Locale = "zh" | "en";

const translations: Record<Locale, Record<string, string>> = {
  zh: {
    // layout
    "site.title": "OpenClaw Bot Dashboard",
    "site.desc": "查看所有 OpenClaw 机器人配置",

    // common
    "common.loading": "加载中...",
    "common.loadError": "加载失败",
    "common.backHome": "← 返回首页",
    "common.backOverview": "← 返回总览",
    "common.noData": "暂无数据",
    "common.test": "🧪 测试",
    "common.testing": "⏳ 测试中...",
    "common.justNow": "刚刚",
    "common.minutesAgo": "分钟前",
    "common.hoursAgo": "小时前",
    "common.daysAgo": "天前",
    "common.manualRefresh": "手动刷新",
    "common.seconds": "秒",
    "common.minute": "分钟",
    "common.minutes": "分钟",

    // home page
    "home.title": "🐾 OpenClaw Bot Dashboard",
    "home.agentCount": "个机器人",
    "home.defaultModel": "默认模型",
    "home.viewModels": "查看模型列表 →",
    "home.skillMgmt": "🧩 技能管理",
    "home.updatedAt": "更新于",
    "home.refreshManual": "🔄 手动刷新",
    "home.globalTrend": "📊 全局统计趋势",
    "home.totalInputToken": "总 Input Token",
    "home.totalOutputToken": "总 Output Token",
    "home.totalMessages": "总消息数",
    "home.tokenTrend": "🔢 Token 消耗趋势",
    "home.avgResponseTrend": "⏱️ 平均响应时间趋势",
    "home.groupTopology": "💬 群聊拓扑",
    "home.fallbackModels": "🔄 Fallback 模型",
    "home.feishuGroup": "飞书群",
    "home.discordChannel": "Discord 频道",
    "home.bots": "个机器人",
    "home.noResponseData": "暂无响应时间数据",

    // agent card
    "agent.model": "模型",
    "agent.platform": "平台",
    "agent.feishuAppId": "飞书 App ID",
    "agent.sessionCount": "会话数",
    "agent.tokenUsage": "Token 用量",
    "agent.stats": "统计",
    "agent.lastActive": "最近活跃",
    "agent.inUse": "使用中:",
    "agent.openChat": "点击打开聊天页面",

    // platform
    "platform.feishu": "📱 飞书",
    "platform.discord": "🎮 Discord",

    // time range
    "range.daily": "按天",
    "range.weekly": "按周",
    "range.monthly": "按月",

    // refresh options
    "refresh.manual": "手动刷新",
    "refresh.10s": "10 秒",
    "refresh.30s": "30 秒",
    "refresh.1m": "1 分钟",
    "refresh.5m": "5 分钟",
    "refresh.10m": "10 分钟",

    // models page
    "models.title": "OpenClaw接入模型列表",
    "models.providerCount": "个 Provider",
    "models.totalPrefix": "共",
    "models.testAll": "🧪 测试全部模型",
    "models.testingAll": "⏳ 测试中...",
    "models.colModelId": "模型 ID",
    "models.colName": "名称",
    "models.colContext": "上下文窗口",
    "models.colMaxOutput": "最大输出",
    "models.colInputType": "输入类型",
    "models.colReasoning": "推理",
    "models.colInputToken": "Input Token",
    "models.colOutputToken": "Output Token",
    "models.colAvgResponse": "平均响应",
    "models.colTest": "测试",
    "models.noExplicitModels": "无显式模型定义（通过 provider 名称推断）",

    // stats page
    "stats.title": "消息统计",
    "stats.subtitle": "Token 消耗与响应时间分析",
    "stats.totalInputToken": "总 Input Token",
    "stats.totalOutputToken": "总 Output Token",
    "stats.totalMessages": "总消息数",
    "stats.dataPeriod": "数据周期",
    "stats.tokenConsumption": "🔢 Token 消耗",
    "stats.avgResponseTime": "⏱️ 平均响应时间",
    "stats.sessionList": "📋 会话列表",
    "stats.home": "← 首页",
    "stats.missingAgent": "缺少 agent 参数",
    "stats.noResponseData": "暂无响应时间数据",

    // sessions page
    "sessions.title": "的会话列表",
    "sessions.sessionCount": "个会话",
    "sessions.totalToken": "总 Token",
    "sessions.missingAgent": "缺少 agent 参数",
    "sessions.type.main": "主会话",
    "sessions.type.feishu-dm": "飞书私聊",
    "sessions.type.feishu-group": "飞书群聊",
    "sessions.type.discord-dm": "Discord 私聊",
    "sessions.type.discord-channel": "Discord 频道",
    "sessions.type.cron": "定时任务",
    "sessions.type.unknown": "未知",

    // skills page
    "skills.title": "🧩 技能管理",
    "skills.count": "个技能",
    "skills.builtin": "内置",
    "skills.extension": "扩展",
    "skills.custom": "自定义",
    "skills.all": "全部",
    "skills.search": "搜索技能...",
    "skills.showing": "显示",
    "skills.unit": "个",
    "skills.noDesc": "无描述",
    "skills.source.builtin": "内置",
    "skills.source.custom": "自定义",
  },
  en: {
    // layout
    "site.title": "OpenClaw Bot Dashboard",
    "site.desc": "View all OpenClaw bot configurations",

    // common
    "common.loading": "Loading...",
    "common.loadError": "Failed to load",
    "common.backHome": "← Back to Home",
    "common.backOverview": "← Back to Overview",
    "common.noData": "No data",
    "common.test": "🧪 Test",
    "common.testing": "⏳ Testing...",
    "common.justNow": "just now",
    "common.minutesAgo": "min ago",
    "common.hoursAgo": "hours ago",
    "common.daysAgo": "days ago",
    "common.manualRefresh": "Manual Refresh",
    "common.seconds": "seconds",
    "common.minute": "minute",
    "common.minutes": "minutes",

    // home page
    "home.title": "🐾 OpenClaw Bot Dashboard",
    "home.agentCount": "bots",
    "home.defaultModel": "Default model",
    "home.viewModels": "View Models →",
    "home.skillMgmt": "🧩 Skills",
    "home.updatedAt": "Updated at",
    "home.refreshManual": "🔄 Manual Refresh",
    "home.globalTrend": "📊 Global Statistics",
    "home.totalInputToken": "Total Input Token",
    "home.totalOutputToken": "Total Output Token",
    "home.totalMessages": "Total Messages",
    "home.tokenTrend": "🔢 Token Usage Trend",
    "home.avgResponseTrend": "⏱️ Avg Response Time Trend",
    "home.groupTopology": "💬 Group Chat Topology",
    "home.fallbackModels": "🔄 Fallback Models",
    "home.feishuGroup": "Feishu Group",
    "home.discordChannel": "Discord Channel",
    "home.bots": "bots",
    "home.noResponseData": "No response time data",

    // agent card
    "agent.model": "Model",
    "agent.platform": "Platform",
    "agent.feishuAppId": "Feishu App ID",
    "agent.sessionCount": "Sessions",
    "agent.tokenUsage": "Token Usage",
    "agent.stats": "Stats",
    "agent.lastActive": "Last Active",
    "agent.inUse": "Used by:",
    "agent.openChat": "Click to open chat",

    // platform
    "platform.feishu": "📱 Feishu",
    "platform.discord": "🎮 Discord",

    // time range
    "range.daily": "Daily",
    "range.weekly": "Weekly",
    "range.monthly": "Monthly",

    // refresh options
    "refresh.manual": "Manual Refresh",
    "refresh.10s": "10s",
    "refresh.30s": "30s",
    "refresh.1m": "1 min",
    "refresh.5m": "5 min",
    "refresh.10m": "10 min",

    // models page
    "models.title": "OpenClaw Model List",
    "models.providerCount": "Providers",
    "models.totalPrefix": "",
    "models.testAll": "🧪 Test All Models",
    "models.testingAll": "⏳ Testing...",
    "models.colModelId": "Model ID",
    "models.colName": "Name",
    "models.colContext": "Context Window",
    "models.colMaxOutput": "Max Output",
    "models.colInputType": "Input Type",
    "models.colReasoning": "Reasoning",
    "models.colInputToken": "Input Token",
    "models.colOutputToken": "Output Token",
    "models.colAvgResponse": "Avg Response",
    "models.colTest": "Test",
    "models.noExplicitModels": "No explicit model definitions (inferred from provider name)",

    // stats page
    "stats.title": "Message Statistics",
    "stats.subtitle": "Token usage and response time analysis",
    "stats.totalInputToken": "Total Input Token",
    "stats.totalOutputToken": "Total Output Token",
    "stats.totalMessages": "Total Messages",
    "stats.dataPeriod": "Data Period",
    "stats.tokenConsumption": "🔢 Token Usage",
    "stats.avgResponseTime": "⏱️ Avg Response Time",
    "stats.sessionList": "📋 Sessions",
    "stats.home": "← Home",
    "stats.missingAgent": "Missing agent parameter",
    "stats.noResponseData": "No response time data",

    // sessions page
    "sessions.title": "Sessions",
    "sessions.sessionCount": "sessions",
    "sessions.totalToken": "Total Token",
    "sessions.missingAgent": "Missing agent parameter",
    "sessions.type.main": "Main",
    "sessions.type.feishu-dm": "Feishu DM",
    "sessions.type.feishu-group": "Feishu Group",
    "sessions.type.discord-dm": "Discord DM",
    "sessions.type.discord-channel": "Discord Channel",
    "sessions.type.cron": "Cron Job",
    "sessions.type.unknown": "Unknown",

    // skills page
    "skills.title": "🧩 Skill Management",
    "skills.count": "skills",
    "skills.builtin": "Built-in",
    "skills.extension": "Extension",
    "skills.custom": "Custom",
    "skills.all": "All",
    "skills.search": "Search skills...",
    "skills.showing": "Showing",
    "skills.unit": "",
    "skills.noDesc": "No description",
    "skills.source.builtin": "Built-in",
    "skills.source.custom": "Custom",
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "zh",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("locale") as Locale) || "zh";
    }
    return "zh";
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("locale", l);
    }
  }, []);

  const t = useCallback(
    (key: string) => translations[locale]?.[key] ?? translations.zh[key] ?? key,
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      className="px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs font-medium hover:border-[var(--accent)] transition cursor-pointer"
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      {locale === "zh" ? "EN" : "中文"}
    </button>
  );
}
