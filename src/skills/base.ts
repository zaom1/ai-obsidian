import type { ParsedIntent, SkillResult, SmartCaptureSettings } from "../types";

export interface SkillContext {
  settings: SmartCaptureSettings;
  now: Date;
}

export interface Skill {
  id: ParsedIntent["skill"];
  execute(intent: ParsedIntent, context: SkillContext): SkillResult;
}
