import { NextResponse } from "next/server";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

interface PlatformTestResult {
  agentId: string;
  platform: string;
  accountId?: string;
  ok: boolean;
  detail?: string;
  error?: string;
  elapsed: number;
}

// Find the most recent feishu DM user open_id for a given agent
// Each feishu app has its own open_id namespace, so we must use per-agent open_ids
function getFeishuDmUser(agentId: string): string | null {
  try {
    const sessionsPath = path.join(OPENCLAW_HOME, `agents/${agentId}/sessions/sessions.json`);
    const raw = fs.readFileSync(sessionsPath, "utf-8");
    const sessions = JSON.parse(raw);
    let bestId: string | null = null;
    let bestTime = 0;
    for (const [key, val] of Object.entries(sessions)) {
      const m = key.match(/^agent:[^:]+:feishu:direct:(ou_[a-f0-9]+)$/);
      if (m) {
        const updatedAt = (val as any).updatedAt || 0;
        if (updatedAt > bestTime) {
          bestTime = updatedAt;
          bestId = m[1];
        }
      }
    }
    return bestId;
  } catch {
    return null;
  }
}

// Feishu: get token → verify bot info → send a real DM
async function testFeishu(
  agentId: string,
  accountId: string,
  appId: string,
  appSecret: string,
  domain: string,
  testUserId: string | null
): Promise<PlatformTestResult> {
  const baseUrl = domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
  const startTime = Date.now();

  try {
    // Step 1: get tenant_access_token
    const tokenResp = await fetch(
      `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const tokenData = await tokenResp.json();
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Token failed: ${tokenData.msg || JSON.stringify(tokenData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const token = tokenData.tenant_access_token;

    // Step 2: verify bot info
    const botResp = await fetch(`${baseUrl}/open-apis/bot/v3/info/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });

    const botData = await botResp.json();
    if (botData.code !== 0 || !botData.bot) {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Bot API error: ${botData.msg || JSON.stringify(botData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const botName = botData.bot.bot_name || accountId;

    // Step 3: send a real DM to test user
    if (!testUserId) {
      return {
        agentId, platform: "feishu", accountId, ok: true,
        detail: `${botName} (bot reachable, no DM session found)`,
        elapsed: Date.now() - startTime,
      };
    }

    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const msgResp = await fetch(
      `${baseUrl}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id: testUserId,
          msg_type: "text",
          content: JSON.stringify({ text: `[Platform Test] ${botName} 联通测试 ✅ (${now})` }),
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const msgData = await msgResp.json();
    const elapsed = Date.now() - startTime;

    if (msgData.code === 0) {
      return {
        agentId, platform: "feishu", accountId, ok: true,
        detail: `${botName} → DM sent (${elapsed}ms)`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "feishu", accountId, ok: false,
        error: `Send DM failed: ${msgData.msg || JSON.stringify(msgData)}`,
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "feishu", accountId, ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

// Discord: call /users/@me then send a DM to test user
async function testDiscord(
  agentId: string,
  botToken: string,
  testUserId: string | null
): Promise<PlatformTestResult> {
  const startTime = Date.now();

  try {
    const meResp = await fetch("https://discord.com/api/v10/users/@me", {
      method: "GET",
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(15000),
    });

    const meData = await meResp.json();
    if (!meResp.ok || !meData.id) {
      return {
        agentId, platform: "discord", ok: false,
        error: `Discord API error: ${meData.message || JSON.stringify(meData)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const botName = `${meData.username}#${meData.discriminator || "0"}`;

    if (!testUserId) {
      return {
        agentId, platform: "discord", ok: true,
        detail: `${botName} (bot reachable, no test user for DM)`,
        elapsed: Date.now() - startTime,
      };
    }

    // Create DM channel
    const dmChanResp = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: testUserId }),
      signal: AbortSignal.timeout(15000),
    });

    const dmChan = await dmChanResp.json();
    if (!dmChanResp.ok || !dmChan.id) {
      return {
        agentId, platform: "discord", ok: false,
        error: `Create DM channel failed: ${dmChan.message || JSON.stringify(dmChan)}`,
        elapsed: Date.now() - startTime,
      };
    }

    const now = new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" });
    const msgResp = await fetch(
      `https://discord.com/api/v10/channels/${dmChan.id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `[Platform Test] ${botName} connectivity test ✅ (${now})`,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    const msgData = await msgResp.json();
    const elapsed = Date.now() - startTime;

    if (msgResp.ok && msgData.id) {
      return {
        agentId, platform: "discord", ok: true,
        detail: `${botName} → DM sent (${elapsed}ms)`,
        elapsed,
      };
    } else {
      return {
        agentId, platform: "discord", ok: false,
        error: `Send DM failed: ${msgData.message || JSON.stringify(msgData)}`,
        elapsed,
      };
    }
  } catch (err: any) {
    return {
      agentId, platform: "discord", ok: false,
      error: err.message,
      elapsed: Date.now() - startTime,
    };
  }
}

// Agent session test: use openclaw CLI to send a health check via feishu DM session
function testAgentSession(agentId: string, sessionKey?: string, platform?: string, replyAccount?: string, replyTo?: string): AgentTestResult {
  const startTime = Date.now();
  try {
    const args = [`openclaw`, `agent`, `--agent`, agentId, `--message`, `Health check: reply with OK`, `--json`, `--timeout`, `30`];
    if (sessionKey) args.push(`--session-id`, sessionKey);
    if (platform) {
      args.push(`--deliver`, `--channel`, platform);
      if (replyAccount) args.push(`--reply-account`, replyAccount);
      if (replyTo) args.push(`--reply-to`, replyTo);
    }
    const result = execSync(args.join(" "),
      { timeout: 40000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );

    const elapsed = Date.now() - startTime;
    const lines = result.split("\n");
    const jsonStartIdx = lines.findIndex(l => l.trimStart().startsWith("{"));
    if (jsonStartIdx === -1) {
      return { agentId, ok: false, error: "No JSON in CLI output", elapsed };
    }
    const jsonStr = lines.slice(jsonStartIdx).join("\n");
    const data = JSON.parse(jsonStr);
    const payloads = data?.result?.payloads || [];
    const reply = payloads[0]?.text || "";
    const durationMs = data?.result?.meta?.durationMs || elapsed;
    const ok = data.status === "ok";

    return {
      agentId, ok,
      reply: reply ? reply.slice(0, 200) : (ok ? "(no reply text)" : ""),
      error: ok ? undefined : "Agent returned error status",
      elapsed: durationMs,
    };
  } catch (execErr: any) {
    const elapsed = Date.now() - startTime;
    const isTimeout = execErr.killed || execErr.signal === "SIGTERM";
    return {
      agentId, ok: false,
      error: isTimeout
        ? "Timeout: agent not responding (30s)"
        : (execErr.stderr || execErr.message || "Unknown error").slice(0, 300),
      elapsed,
    };
  }
}

export async function POST() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    const bindings = config.bindings || [];
    const channels = config.channels || {};
    const feishuConfig = channels.feishu || {};
    const feishuAccounts = feishuConfig.accounts || {};
    const feishuDomain = feishuConfig.domain || "feishu";
    const discordConfig = channels.discord || {};
    const discordAllowFrom: string[] = discordConfig.dm?.allowFrom || [];
    const discordTestUser = discordAllowFrom[0] || null;

    let agentList = config.agents?.list || [];
    if (agentList.length === 0) {
      try {
        const agentsDir = path.join(OPENCLAW_HOME, "agents");
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        agentList = dirs
          .filter((d: any) => d.isDirectory() && !d.name.startsWith("."))
          .map((d: any) => ({ id: d.name }));
      } catch {}
      if (agentList.length === 0) {
        agentList = [{ id: "main" }];
      }
    }

    // Phase 1: Platform API tests (parallel)
    const platformTests: Promise<PlatformTestResult>[] = [];
    const agentIds: string[] = [];
    const testedFeishuAccounts = new Set<string>();

    for (const agent of agentList) {
      const id = agent.id;
      agentIds.push(id);

      // Feishu
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      const accountId = feishuBinding?.match?.accountId || id;
      const account = feishuAccounts[accountId];

      if (account && account.appId && account.appSecret && !testedFeishuAccounts.has(accountId)) {
        testedFeishuAccounts.add(accountId);
        const testUserId = getFeishuDmUser(id);
        platformTests.push(testFeishu(id, accountId, account.appId, account.appSecret, feishuDomain, testUserId));
      } else if (!feishuBinding && !account) {
        if (id === "main" && feishuConfig.enabled && feishuConfig.appId && feishuConfig.appSecret && !testedFeishuAccounts.has("main")) {
          testedFeishuAccounts.add("main");
          const testUserId = getFeishuDmUser("main");
          platformTests.push(testFeishu(id, "main", feishuConfig.appId, feishuConfig.appSecret, feishuDomain, testUserId));
        }
      }

      // Discord: only test once
      if (id === "main" && discordConfig.enabled && discordConfig.token) {
        platformTests.push(testDiscord(id, discordConfig.token, discordTestUser));
      }
    }

    const platformResults = await Promise.all(platformTests);

    // Phase 2: Agent session tests via feishu DM session (sequential)
    const agentResults: PlatformTestResult[] = [];
    for (const id of agentIds) {
      // Build feishu DM session key and delivery params
      const dmUser = getFeishuDmUser(id);
      const sessionKey = dmUser ? `agent:${id}:feishu:direct:${dmUser}` : undefined;
      // Find the feishu account id for this agent
      const feishuBinding = bindings.find(
        (b: any) => b.agentId === id && b.match?.channel === "feishu"
      );
      const accountId = feishuBinding?.match?.accountId || id;
      const hasFeishu = !!(feishuAccounts[accountId] || (id === "main" && feishuConfig.enabled));
      const r = testAgentSession(
        id,
        sessionKey,
        hasFeishu && dmUser ? "feishu" : undefined,
        hasFeishu && dmUser ? accountId : undefined,
        dmUser || undefined
      );
      agentResults.push({
        agentId: r.agentId,
        platform: "agent",
        ok: r.ok,
        detail: r.reply,
        error: r.error,
        elapsed: r.elapsed,
      });
    }

    // Flatten all results: platform tests + agent tests
    const results = [...platformResults, ...agentResults];

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
