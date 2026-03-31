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
  }
}
