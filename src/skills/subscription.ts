import {
  extractAmount,
  extractCycle,
  extractVendor,
  inferNextDateFromCycle,
  normalizeCurrency,
  normalizeCycle,
  normalizeDate
} from "../services/nlp";
import type { ParsedIntent, SkillResult } from "../types";
import type { Skill, SkillContext } from "./base";

export class SubscriptionSkill implements Skill {
  id: ParsedIntent["skill"] = "subscription";

  execute(intent: ParsedIntent, context: SkillContext): SkillResult {
    const path = context.settings.subscriptionFile;
    const vendor = intent.vendor ?? intent.title ?? extractVendor(intent.text) ?? "unknown-service";
    const amount = intent.amount ?? extractAmount(intent.text) ?? 0;
    const currency = normalizeCurrency(intent.currency) ?? "CNY";
    const cycle = normalizeCycle(intent.cycle ?? extractCycle(intent.text)) ?? "monthly";
    const dueDate = normalizeDate(intent.dueDate) ?? inferNextDateFromCycle(cycle, context.now);
    const startDate = formatDate(context.now);

    const line = `- [ ] ${vendor} | ${amount.toFixed(2)} ${currency} | ${cycle} | next: ${dueDate} | start: ${startDate} | note: ${intent.text}\n`;

    return {
      path,
      action: "append",
      content: line,
      summary: `subscription entry saved to ${path}`
    };
  }
}

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
