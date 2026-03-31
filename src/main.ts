import { Notice, Plugin } from "obsidian";
import { IntentRouter } from "./router";
import { SmartCaptureSettingTab, DEFAULT_SETTINGS } from "./settings";
import { updateFinanceSummary } from "./services/finance-summary";
import { McpService, type McpTool } from "./services/mcp";
import { SttTranscriber } from "./services/transcription";
import { appendToVaultFile, prependToVaultFile } from "./services/vault-writer";
import { AccountingSkill } from "./skills/accounting";
import { MemoSkill } from "./skills/memo";
import { ReminderSkill } from "./skills/reminder";
import { SubscriptionSkill } from "./skills/subscription";
import { TodoSkill } from "./skills/todo";
import type { Skill } from "./skills/base";
import type { McpEndpoint, ParsedIntent, SkillType, SmartCaptureSettings } from "./types";
import { CaptureModal } from "./ui/capture-modal";
import { McpToolModal } from "./ui/mcp-tool-modal";

export default class SmartCapturePlugin extends Plugin {
  settings: SmartCaptureSettings = DEFAULT_SETTINGS;
  private skills = new Map<SkillType, Skill>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerSkills();

    this.addSettingTab(new SmartCaptureSettingTab(this.app, this));

    this.addRibbonIcon("bot", "Smart Capture", () => {
      new CaptureModal(this).open();
    });

    this.addCommand({
      id: "open-smart-capture-modal",
      name: "Open Smart Capture",
      callback: () => {
        new CaptureModal(this).open();
      }
    });

    this.addCommand({
      id: "open-mcp-tool-runner",
      name: "Open MCP Tool Runner",
      callback: () => {
        new McpToolModal(this).open();
      }
    });

    this.addCommand({
      id: "ping-enabled-mcp-endpoints",
      name: "Ping MCP endpoints",
      callback: async () => {
        const mcp = this.createMcpService();
        const endpoints = mcp.getEnabledEndpoints();
        if (endpoints.length === 0) {
          new Notice("No enabled MCP endpoints found.");
          return;
        }

        for (const endpoint of endpoints) {
          const ok = await mcp.pingEndpoint(endpoint);
          new Notice(`${endpoint.name}: ${ok ? "reachable" : "unreachable"}`);
        }
      }
    });

    this.addCommand({
      id: "refresh-current-month-finance-summary",
      name: "Refresh current month finance summary",
      callback: async () => {
        const month = this.currentMonthString(new Date());
        const path = `${this.settings.financeFolder}/${month}.md`;
        await updateFinanceSummary(this.app.vault, path);
        new Notice(`Updated finance summary: ${path}`);
      }
    });
  }

  async captureInput(rawInput: string): Promise<string> {
    const router = new IntentRouter(this.settings);
    const intent = await router.route(rawInput);
    const skill = this.skills.get(intent.skill);

    if (!skill) {
      return `No skill registered for ${intent.skill}`;
    }

    const result = skill.execute(intent, {
      settings: this.settings,
      now: new Date()
    });

    if (result.action === "append") {
      await appendToVaultFile(this.app.vault, result.path, result.content);
    } else {
      await prependToVaultFile(this.app.vault, result.path, result.content);
    }

    if (intent.skill === "accounting") {
      await updateFinanceSummary(this.app.vault, result.path);
    }

    if (intent.skill === "reminder") {
      await this.syncReminderToMcp(intent);
    }

    return result.summary;
  }

  async transcribeAudio(blob: Blob): Promise<string> {
    const transcriber = new SttTranscriber(this.settings.stt);
    return transcriber.transcribeAudio(blob);
  }

  async autoFillLlmModel(): Promise<string> {
    const models = await this.discoverModels(
      this.settings.llm.baseUrl,
      this.settings.llm.apiKey,
      this.settings.llm.timeoutMs
    );
    const model = pickPreferredModel(models, [
      "gpt-4o-mini",
      "gpt-4.1-mini",
      "gpt-4o",
      "gpt-4.1",
      "claude-3-5-sonnet",
      "claude-3-7-sonnet"
    ]);
    this.settings.llm.model = model;
    await this.saveSettings();
    return model;
  }

  async autoFillSttModel(): Promise<string> {
    const models = await this.discoverModels(
      this.settings.stt.baseUrl,
      this.settings.stt.apiKey,
      this.settings.stt.timeoutMs
    );
    const model = pickPreferredModel(models, ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]);
    this.settings.stt.model = model;
    await this.saveSettings();
    return model;
  }

  getEnabledMcpEndpoints(): McpEndpoint[] {
    return this.settings.mcpEndpoints.filter((e) => e.enabled && e.urlOrCommand.trim().length > 0);
  }

  async listMcpTools(endpoint: McpEndpoint): Promise<McpTool[]> {
    const mcp = this.createMcpService();
    return mcp.listTools(endpoint);
  }

  async callMcpTool(endpoint: McpEndpoint, toolName: string, args: Record<string, unknown>): Promise<string> {
    const mcp = this.createMcpService();
    return mcp.callTool(endpoint, toolName, args);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      llm: {
        ...DEFAULT_SETTINGS.llm,
        ...(data?.llm ?? {})
      },
      stt: {
        ...DEFAULT_SETTINGS.stt,
        ...(data?.stt ?? {})
      },
      skills: {
        ...DEFAULT_SETTINGS.skills,
        ...(data?.skills ?? {})
      },
      mcpEndpoints: Array.isArray(data?.mcpEndpoints) ? data.mcpEndpoints : DEFAULT_SETTINGS.mcpEndpoints,
      reminderMcp: {
        ...DEFAULT_SETTINGS.reminderMcp,
        ...(data?.reminderMcp ?? {})
      }
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private registerSkills(): void {
    const entries: Skill[] = [
      new AccountingSkill(),
      new SubscriptionSkill(),
      new TodoSkill(),
      new ReminderSkill(),
      new MemoSkill()
    ];

    for (const skill of entries) {
      this.skills.set(skill.id, skill);
    }
  }

  private createMcpService(): McpService {
    return new McpService(this.settings.mcpEndpoints);
  }

  private async syncReminderToMcp(intent: ParsedIntent): Promise<void> {
    if (!this.settings.reminderMcp.enabled) return;
    const toolName = this.settings.reminderMcp.toolName.trim();
    if (!toolName) return;

    const endpoint = this.resolveReminderEndpoint();
    if (!endpoint) {
      new Notice("Reminder MCP sync skipped: no matching enabled endpoint.");
      return;
    }

    try {
      const result = await this.callMcpTool(endpoint, toolName, {
        title: intent.title ?? intent.text,
        text: intent.text,
        dueDate: intent.dueDate ?? null,
        source: "obsidian-smart-capture"
      });
      if (result.trim().length > 0) {
        new Notice(`Reminder synced via MCP: ${endpoint.name}`);
      }
    } catch (error) {
      new Notice(`Reminder MCP sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolveReminderEndpoint(): McpEndpoint | null {
    const enabled = this.getEnabledMcpEndpoints();
    if (enabled.length === 0) return null;

    const preferredName = this.settings.reminderMcp.endpointName.trim().toLowerCase();
    if (!preferredName) return enabled[0];

    return enabled.find((endpoint) => endpoint.name.trim().toLowerCase() === preferredName) ?? null;
  }

  private async discoverModels(baseUrl: string, apiKey: string, timeoutMs: number): Promise<string[]> {
    const trimmedBaseUrl = baseUrl.trim().replace(/\/$/, "");
    if (!trimmedBaseUrl) {
      throw new Error("Base URL is required.");
    }
    if (!apiKey.trim()) {
      throw new Error("API key is required.");
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), Math.max(timeoutMs, 5000));

    try {
      const response = await fetch(`${trimmedBaseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Model discovery failed: ${response.status}`);
      }

      const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
      const ids = (payload.data ?? [])
        .map((item) => (typeof item.id === "string" ? item.id.trim() : ""))
        .filter((item) => item.length > 0);

      if (ids.length === 0) {
        throw new Error("No models found from this endpoint.");
      }

      return ids;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private currentMonthString(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  onunload(): void {
    const mcp = this.createMcpService();
    mcp.dispose();
  }
}

function pickPreferredModel(models: string[], preferred: string[]): string {
  const loweredMap = new Map<string, string>();
  for (const model of models) {
    loweredMap.set(model.toLowerCase(), model);
  }

  for (const expected of preferred) {
    const hit = loweredMap.get(expected.toLowerCase());
    if (hit) return hit;
  }

  return models[0];
}
