import type { ParsedIntent, SkillType, SmartCaptureSettings } from "./types";
import { LlmParser } from "./services/llm";
import { inferSkillByRules, normalizeIntent } from "./services/nlp";

export class IntentRouter {
  private readonly llmParser: LlmParser;

  constructor(private readonly settings: SmartCaptureSettings) {
    this.llmParser = new LlmParser(settings.llm);
  }

  async route(rawInput: string, now = new Date()): Promise<ParsedIntent> {
    const input = rawInput.trim();
    if (input.length === 0) {
      return { skill: "memo", text: "" };
    }

    const llmIntent = await this.llmParser.parse(input);
    if (llmIntent && this.isEnabled(llmIntent.skill)) {
      return normalizeIntent(llmIntent, now);
    }

    const fallbackSkill = this.ruleBasedSkill(input);
    return normalizeIntent({
      skill: fallbackSkill,
      text: input
    }, now);
  }

  private ruleBasedSkill(input: string): SkillType {
    return inferSkillByRules(input, (skill) => this.isEnabled(skill));
  }

  private isEnabled(skill: SkillType): boolean {
    return this.settings.skills[skill];
  }
}
