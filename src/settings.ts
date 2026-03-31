import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type SmartCapturePlugin from "./main";
import type { McpEndpoint, SmartCaptureSettings } from "./types";

export const DEFAULT_SETTINGS: SmartCaptureSettings = {
  llm: {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.1,
    timeoutMs: 30000,
    useLlmForParsing: true
  },
  stt: {
    enabled: false,
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "whisper-1",
    language: "zh",
    temperature: 0,
    prompt: "",
    timeoutMs: 45000
  },
  skills: {
    accounting: true,
    subscription: true,
    todo: true,
    reminder: true,
    memo: true
  },
  financeFolder: "Finance",
  subscriptionFile: "Subscriptions/index.md",
  taskFile: "Tasks/inbox.md",
  reminderFile: "Reminders/inbox.md",
  memoFolder: "Memos",
  mcpEndpoints: [
    { name: "mobile-http", transport: "http", urlOrCommand: "", enabled: false },
    { name: "mobile-sse", transport: "sse", urlOrCommand: "", enabled: false },
    { name: "desktop-stdio", transport: "stdio", urlOrCommand: "", enabled: false }
  ],
  reminderMcp: {
    enabled: false,
    endpointName: "",
    toolName: "apple_reminders_create"
  }
};

export class SmartCaptureSettingTab extends PluginSettingTab {
  plugin: SmartCapturePlugin;

  constructor(app: App, plugin: SmartCapturePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Intent Inbox" });

    this.renderLlmSettings(containerEl);
    this.renderSttSettings(containerEl);
    this.renderStorageSettings(containerEl);
    this.renderSkillSettings(containerEl);
    this.renderMcpEndpoints(containerEl);
    this.renderReminderMcpSettings(containerEl);
  }

  private renderLlmSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "LLM Parsing" });

    new Setting(containerEl)
      .setName("Enable LLM")
      .setDesc("Use external LLM for intent parsing and normalization.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.llm.enabled).onChange(async (value) => {
          this.plugin.settings.llm.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    this.addTextSetting(containerEl, "LLM base URL", this.plugin.settings.llm.baseUrl, async (value) => {
      this.plugin.settings.llm.baseUrl = value;
      await this.plugin.saveSettings();
    });

    this.addApiKeySetting(containerEl, "LLM API key", this.plugin.settings.llm.apiKey, async (value) => {
      this.plugin.settings.llm.apiKey = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "LLM model", this.plugin.settings.llm.model, async (value) => {
      this.plugin.settings.llm.model = value;
      await this.plugin.saveSettings();
    });

    new Setting(containerEl)
      .setName("Auto detect LLM model")
      .setDesc("Fetch /models using current LLM base URL + API key, then fill model automatically.")
      .addButton((button) =>
        button.setButtonText("Fetch + Fill").onClick(async () => {
          button.setDisabled(true);
          try {
            const model = await this.plugin.autoFillLlmModel();
            new Notice(`LLM model set to: ${model}`);
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          } finally {
            button.setDisabled(false);
          }
        })
      );

    new Setting(containerEl)
      .setName("Use LLM for parsing")
      .setDesc("If disabled, parser falls back to local rule-based routing only.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.llm.useLlmForParsing).onChange(async (value) => {
          this.plugin.settings.llm.useLlmForParsing = value;
          await this.plugin.saveSettings();
        })
      );
  }

  private renderSttSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Voice Transcription (STT)" });

    new Setting(containerEl)
      .setName("Enable STT")
      .setDesc("Used by the Record button in Smart Capture modal.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.stt.enabled).onChange(async (value) => {
          this.plugin.settings.stt.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    this.addTextSetting(containerEl, "STT base URL", this.plugin.settings.stt.baseUrl, async (value) => {
      this.plugin.settings.stt.baseUrl = value;
      await this.plugin.saveSettings();
    });

    this.addApiKeySetting(containerEl, "STT API key", this.plugin.settings.stt.apiKey, async (value) => {
      this.plugin.settings.stt.apiKey = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "STT model", this.plugin.settings.stt.model, async (value) => {
      this.plugin.settings.stt.model = value;
      await this.plugin.saveSettings();
    });

    new Setting(containerEl)
      .setName("Auto detect STT model")
      .setDesc("Fetch /models using current STT base URL + API key, then fill model automatically.")
      .addButton((button) =>
        button.setButtonText("Fetch + Fill").onClick(async () => {
          button.setDisabled(true);
          try {
            const model = await this.plugin.autoFillSttModel();
            new Notice(`STT model set to: ${model}`);
            this.display();
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error));
          } finally {
            button.setDisabled(false);
          }
        })
      );

    this.addTextSetting(containerEl, "STT language", this.plugin.settings.stt.language, async (value) => {
      this.plugin.settings.stt.language = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "STT prompt", this.plugin.settings.stt.prompt, async (value) => {
      this.plugin.settings.stt.prompt = value;
      await this.plugin.saveSettings();
    });
  }

  private renderStorageSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Storage targets" });

    this.addTextSetting(containerEl, "Finance folder", this.plugin.settings.financeFolder, async (value) => {
      this.plugin.settings.financeFolder = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "Subscription file", this.plugin.settings.subscriptionFile, async (value) => {
      this.plugin.settings.subscriptionFile = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "Task file", this.plugin.settings.taskFile, async (value) => {
      this.plugin.settings.taskFile = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "Reminder file", this.plugin.settings.reminderFile, async (value) => {
      this.plugin.settings.reminderFile = value;
      await this.plugin.saveSettings();
    });

    this.addTextSetting(containerEl, "Memo folder", this.plugin.settings.memoFolder, async (value) => {
      this.plugin.settings.memoFolder = value;
      await this.plugin.saveSettings();
    });
  }

  private renderSkillSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Skills" });

    this.addSkillToggle(containerEl, "Accounting", "accounting");
    this.addSkillToggle(containerEl, "Subscription", "subscription");
    this.addSkillToggle(containerEl, "Todo", "todo");
    this.addSkillToggle(containerEl, "Reminder", "reminder");
    this.addSkillToggle(containerEl, "Memo", "memo");
  }

  private renderMcpEndpoints(containerEl: HTMLElement): void {
    const endpointsContainer = containerEl.createDiv({ cls: "sch-mcp-endpoints" });

    const renderEndpoint = (endpoint: McpEndpoint, idx: number) => {
      const row = endpointsContainer.createDiv({ cls: "sch-mcp-row" });
      new Setting(row)
        .setName(`Endpoint ${idx + 1}: ${endpoint.name}`)
        .setDesc(`${endpoint.transport.toUpperCase()} | ${endpoint.urlOrCommand || "(not configured)"}`)
        .addToggle((toggle) =>
          toggle.setValue(endpoint.enabled).onChange(async (value) => {
            endpoint.enabled = value;
            await this.plugin.saveSettings();
            row.empty();
            renderEndpoint(endpoint, idx);
          })
        )
        .addDropdown((drop) =>
          drop
            .addOption("http", "http")
            .addOption("sse", "sse")
            .addOption("stdio", "stdio")
            .setValue(endpoint.transport)
            .onChange(async (value) => {
              endpoint.transport = value as "http" | "sse" | "stdio";
              await this.plugin.saveSettings();
              row.empty();
              renderEndpoint(endpoint, idx);
            })
        )
        .addText((text) =>
          text.setPlaceholder("name").setValue(endpoint.name).onChange(async (value) => {
            endpoint.name = value.trim() || endpoint.name;
            await this.plugin.saveSettings();
          })
        )
        .addText((text) =>
          text.setPlaceholder("url or command").setValue(endpoint.urlOrCommand).onChange(async (value) => {
            endpoint.urlOrCommand = value.trim();
            await this.plugin.saveSettings();
          })
        );
    };

    for (let idx = 0; idx < this.plugin.settings.mcpEndpoints.length; idx++) {
      renderEndpoint(this.plugin.settings.mcpEndpoints[idx], idx);
    }
  }

  private renderReminderMcpSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Reminder MCP Automation" });

    new Setting(containerEl)
      .setName("Enable reminder auto sync")
      .setDesc("After writing reminder note, call MCP tool automatically.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.reminderMcp.enabled).onChange(async (value) => {
          this.plugin.settings.reminderMcp.enabled = value;
          await this.plugin.saveSettings();
        })
      );

    this.addTextSetting(
      containerEl,
      "Reminder MCP endpoint name",
      this.plugin.settings.reminderMcp.endpointName,
      async (value) => {
        this.plugin.settings.reminderMcp.endpointName = value;
        await this.plugin.saveSettings();
      }
    );

    this.addTextSetting(containerEl, "Reminder MCP tool name", this.plugin.settings.reminderMcp.toolName, async (value) => {
      this.plugin.settings.reminderMcp.toolName = value;
      await this.plugin.saveSettings();
    });
  }

  private addApiKeySetting(
    containerEl: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl).setName(name).addText((text) =>
      text
        .setValue(value)
        .onChange(async (nextValue) => {
          await onChange(nextValue.trim());
        })
        .inputEl.setAttribute("type", "password")
    );
  }

  private addTextSetting(
    containerEl: HTMLElement,
    name: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    new Setting(containerEl).setName(name).addText((text) =>
      text.setValue(value).onChange(async (nextValue) => {
        await onChange(nextValue.trim());
      })
    );
  }

  private addSkillToggle(
    containerEl: HTMLElement,
    name: string,
    key: keyof SmartCaptureSettings["skills"]
  ): void {
    new Setting(containerEl)
      .setName(name)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.skills[key]).onChange(async (value) => {
          this.plugin.settings.skills[key] = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
