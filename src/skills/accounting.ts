import { extractAmount, inferTransactionType, normalizeCurrency } from "../services/nlp";
import type { ParsedIntent, SkillResult } from "../types";
import type { Skill, SkillContext } from "./base";

export class AccountingSkill implements Skill {
  id: ParsedIntent["skill"] = "accounting";

  execute(intent: ParsedIntent, context: SkillContext): SkillResult {
    const month = formatMonth(context.now);
    const path = `${context.settings.financeFolder}/${month}.md`;
    const amount = intent.amount ?? extractAmount(intent.text) ?? 0;
    const currency = normalizeCurrency(intent.currency) ?? "CNY";
    const method = intent.paymentMethod ?? "unspecified";
    const type = inferTransactionType(intent);
    const title = intent.title ?? intent.text;

    const line = `- ${formatDateTime(context.now)} | ${type} | ${title} | ${amount.toFixed(2)} ${currency} | ${method}\n`;

    return {
      path,
      action: "append",
      content: line,
      summary: `${type} entry saved to ${path}`
    };
  }
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
