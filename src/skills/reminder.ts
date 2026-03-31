import type { ParsedIntent, SkillResult } from "../types";
import type { Skill, SkillContext } from "./base";

export class ReminderSkill implements Skill {
  id: ParsedIntent["skill"] = "reminder";

  execute(intent: ParsedIntent, context: SkillContext): SkillResult {
    const path = context.settings.reminderFile;
    const when = intent.dueDate ?? "unspecified";
    const title = intent.title ?? intent.text;

    return {
      path,
      action: "prepend",
      content: `- [ ] ${title} @ ${when}\n`,
      summary: `reminder captured in ${path}`
    };
  }
}
