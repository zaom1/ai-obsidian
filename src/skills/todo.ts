import type { ParsedIntent, SkillResult } from "../types";
import type { Skill, SkillContext } from "./base";

export class TodoSkill implements Skill {
  id: ParsedIntent["skill"] = "todo";

  execute(intent: ParsedIntent, context: SkillContext): SkillResult {
    const path = context.settings.taskFile;
    const title = intent.title ?? intent.text;
    const duePart = intent.dueDate ? ` 📅 ${intent.dueDate}` : "";
    const tagsPart = intent.tags && intent.tags.length > 0 ? ` ${intent.tags.map((t) => `#${t}`).join(" ")}` : "";

    return {
      path,
      action: "prepend",
      content: `- [ ] ${title}${duePart}${tagsPart}\n`,
      summary: `task captured in ${path}`
    };
  }
}
