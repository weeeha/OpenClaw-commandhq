import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(process.env.HOME || "", ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json");

interface ProbeResult {
  provider?: string;
  model?: string;
  mode?: "api_key" | "oauth" | string;
  status?: "ok" | "error" | "unknown" | string;
  error?: string;
  latencyMs?: number;
}

function parseModelRef(modelStr: string) {
  const [providerId, ...rest] = modelStr.split("/");
  return { providerId, modelId: rest.join("/") };
}

function parseJsonFromMixedOutput(output: string): any {
  for (let i = 0; i < output.length; i++) {
    if (output[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let j = i; j < output.length; j++) {
      const ch = output[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = output.slice(i, j + 1).trim();
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") return parsed;
          } catch {}
          break;
        }
      }
    }
  }
  throw new Error("Failed to parse JSON output from openclaw models status --probe --json");
}

export async function POST() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);

    const defaults = config.agents?.defaults || {};
    const defaultModel = typeof defaults.model === "string"
      ? defaults.model
      : defaults.model?.primary || "unknown";

    let agentList = config.agents?.list || [];
    if (agentList.length === 0) {
      try {
        const agentsDir = path.join(OPENCLAW_HOME, "agents");
        const dirs = fs.readdirSync(agentsDir, { withFileTypes: true });
        agentList = dirs
          .filter((d: any) => d.isDirectory() && !d.name.startsWith("."))
          .map((d: any) => ({ id: d.name }));
      } catch {}
      if (agentList.length === 0) agentList = [{ id: "main" }];
    }

    const { stdout, stderr } = await execFileAsync(
      "openclaw",
      ["models", "status", "--probe", "--json"],
      {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "0" },
      }
    );
    const parsed = parseJsonFromMixedOutput(`${stdout}\n${stderr || ""}`);
    const probes: ProbeResult[] = parsed?.auth?.probes?.results || [];

    const results = agentList.map((agent: any) => {
      const modelStr = agent.model || defaultModel;
      const { providerId, modelId } = parseModelRef(modelStr);
      const fullModel = `${providerId}/${modelId}`;

      const exact =
        probes.find((p) => p.provider === providerId && p.model === fullModel) ||
        probes.find((p) => p.provider === providerId && typeof p.model === "string" && p.model.endsWith(`/${modelId}`));
      const matched = exact || probes.find((p) => p.provider === providerId);

      if (!matched) {
        return {
          agentId: agent.id,
          model: modelStr,
          ok: false,
          error: `No probe result for provider ${providerId}`,
          elapsed: 0,
        };
      }

      const ok = matched.status === "ok";
      return {
        agentId: agent.id,
        model: modelStr,
        ok,
        text: ok ? "OK (openclaw models status --probe)" : undefined,
        error: ok ? undefined : (matched.error || `Probe status: ${matched.status || "unknown"}`),
        elapsed: matched.latencyMs || 0,
      };
    });

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
