import { requestUrl } from "obsidian";
import type { LlmSettings, ParsedIntent, SkillType } from "../types";

interface ChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export interface LlmParseError {
  message: string;
  status?: number;
}

export class LlmParser {
  private lastError: LlmParseError | null = null;

  constructor(private readonly settings: LlmSettings) {}

  getLastError(): LlmParseError | null {
    return this.lastError;
  }

  isReady(): boolean {
    return (
      this.settings.enabled &&
      this.settings.useLlmForParsing &&
      this.settings.baseUrl.length > 0 &&
      this.settings.apiKey.length > 0 &&
      this.settings.model.length > 0
    );
  }

  async parse(text: string): Promise<ParsedIntent | null> {
    if (!this.isReady()) return null;

    const prompt = this.buildPrompt(text);
    const url = `${this.settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

    try {
      const response = await requestUrl({
        url,
        method: "POST",
        throw: false,
        contentType: "application/json",
        headers: {
          Authorization: `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify({
          model: this.settings.model,
          temperature: this.settings.temperature,
          messages: [
            {
              role: "system",
              content:
                "You normalize user notes into JSON for a personal organizer plugin. Return JSON only, no markdown."
            },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (response.status < 200 || response.status >= 300) {
        this.lastError = { message: `LLM request failed with status ${response.status}`, status: response.status };
        return null;
      }

      const body = response.json as ChatResponse;
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        this.lastError = { message: "LLM returned empty response" };
        return null;
      }

      try {
        const parsed = JSON.parse(content) as Partial<ParsedIntent>;
        if (!parsed.skill || !this.isSupportedSkill(parsed.skill)) {
          this.lastError = { message: `Unsupported skill: ${parsed.skill}` };
          return null;
        }
        if (!parsed.text) parsed.text = text;
        this.lastError = null;
        return parsed as ParsedIntent;
      } catch {
        this.lastError = { message: "Failed to parse LLM response as JSON" };
        return null;
      }
    } catch (error) {
      this.lastError = { message: error instanceof Error ? error.message : String(error) };
      return null;
    }
  }

  private buildPrompt(text: string): string {
    return [
      "Classify and normalize this input into one skill: accounting, subscription, todo, reminder, or memo.",
      "Always return JSON with fields:",
      "skill, text, amount?, currency?, transactionType?, paymentMethod?, title?, dueDate?(YYYY-MM-DD), cycle?, vendor?, tags?",
      "currency must be uppercase ISO code when possible (CNY, USD, EUR, GBP, JPY, HKD).",
      "cycle must be one of daily, weekly, monthly, quarterly, yearly when relevant.",
      "Input:",
      text
    ].join("\n");
  }

  private isSupportedSkill(skill: string): skill is SkillType {
    return ["accounting", "subscription", "todo", "reminder", "memo"].includes(skill);
  }
}
