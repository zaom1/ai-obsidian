import { Modal, Notice, Setting } from "obsidian";
import type SmartCapturePlugin from "../main";

export class McpToolModal extends Modal {
  private endpointIndex = 0;
  private toolName = "";
  private argsJson = "{}";
  private outputEl: HTMLElement | null = null;

  constructor(private readonly plugin: SmartCapturePlugin) {
    super(plugin.app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "MCP Tool Runner" });

    const endpoints = this.plugin.getEnabledMcpEndpoints();
    if (endpoints.length === 0) {
      contentEl.createEl("p", { text: "No enabled MCP endpoints found in settings." });
      return;
    }

    new Setting(contentEl).setName("Endpoint").addDropdown((drop) => {
      endpoints.forEach((endpoint, idx) => {
        drop.addOption(String(idx), `${endpoint.name} (${endpoint.transport})`);
      });
      drop.setValue("0");
      drop.onChange((value) => {
        this.endpointIndex = Number.parseInt(value, 10) || 0;
      });
    });

    new Setting(contentEl)
      .setName("Tool name")
      .setDesc("Use List Tools first to see available names")
      .addText((text) => {
        text.setValue(this.toolName).onChange((value) => {
          this.toolName = value.trim();
        });
      });

    new Setting(contentEl).setName("Tool args JSON").addTextArea((text) => {
      text.inputEl.rows = 8;
      text.inputEl.style.width = "100%";
      text.setValue(this.argsJson).onChange((value) => {
        this.argsJson = value;
      });
    });

    const actionWrap = contentEl.createDiv();

    const listButton = actionWrap.createEl("button", { text: "List Tools" });
    listButton.addEventListener("click", async () => {
      const endpoint = endpoints[this.endpointIndex];
      try {
        const tools = await this.plugin.listMcpTools(endpoint);
        if (tools.length === 0) {
          this.showOutput("No tools returned by endpoint.");
          return;
        }

        const text = tools
          .map((tool) => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`)
          .join("\n");
        this.showOutput(text);
      } catch (error) {
        this.showOutput(error instanceof Error ? error.message : String(error));
      }
    });

    const callButton = actionWrap.createEl("button", { text: "Call Tool" });
    callButton.addEventListener("click", async () => {
      if (!this.toolName) {
        new Notice("Please enter tool name.");
        return;
      }

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(this.argsJson) as Record<string, unknown>;
      } catch {
        new Notice("Args must be valid JSON.");
        return;
      }

      const endpoint = endpoints[this.endpointIndex];
      try {
        const result = await this.plugin.callMcpTool(endpoint, this.toolName, args);
        this.showOutput(result);
      } catch (error) {
        this.showOutput(error instanceof Error ? error.message : String(error));
      }
    });

    this.outputEl = contentEl.createEl("pre", { cls: "sch-result" });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private showOutput(text: string): void {
    if (!this.outputEl) return;
    this.outputEl.textContent = text;
  }
}
