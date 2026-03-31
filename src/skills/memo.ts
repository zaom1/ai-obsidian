import type { ParsedIntent, SkillResult } from "../types";
import type { Skill, SkillContext } from "./base";

export class MemoSkill implements Skill {
  id: ParsedIntent["skill"] = "memo";

  execute(intent: ParsedIntent, context: SkillContext): SkillResult {
    const date = formatDate(context.now);
    const path = `${context.settings.memoFolder}/${date}.md`;

    return {
      path,
      action: "append",
      content: `\n## ${formatTime(context.now)}\n${intent.text}\n`,
      summary: `memo appended to ${path}`
    };
  }
}

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
