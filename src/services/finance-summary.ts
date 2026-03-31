import { TFile, type Vault } from "obsidian";

const START = "<!-- SCH_FINANCE_SUMMARY_START -->";
const END = "<!-- SCH_FINANCE_SUMMARY_END -->";

interface Totals {
  expense: number;
  income: number;
  entries: number;
  currencies: Set<string>;
}

export async function updateFinanceSummary(vault: Vault, path: string): Promise<void> {
  const abstractFile = vault.getAbstractFileByPath(path);
  if (!(abstractFile instanceof TFile)) return;

  const content = await vault.read(abstractFile);
  const totals = parseTotals(content);
  const summary = buildSummaryBlock(totals);

  const nextContent = replaceOrInsertSummary(content, summary);
  if (nextContent !== content) {
    await vault.modify(abstractFile, nextContent);
  }
}

function parseTotals(content: string): Totals {
  const totals: Totals = {
    expense: 0,
    income: 0,
    entries: 0,
    currencies: new Set<string>()
  };

  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^\-\s+[^|]+\|\s*(expense|income)\s*\|[^|]*\|\s*([0-9]+(?:\.[0-9]{1,2})?)\s+([A-Z]{3})\s*\|/);
    if (!match) continue;

    const type = match[1];
    const amount = Number.parseFloat(match[2]);
    const currency = match[3];
    if (!Number.isFinite(amount)) continue;

    totals.entries += 1;
    totals.currencies.add(currency);
    if (type === "expense") {
      totals.expense += amount;
    } else {
      totals.income += amount;
    }
  }

  return totals;
}

function buildSummaryBlock(totals: Totals): string {
  const net = totals.income - totals.expense;
  const currencies = totals.currencies.size > 0 ? [...totals.currencies].join(", ") : "none";

  return [
    START,
    "## Monthly Summary (auto)",
    `- Entries: ${totals.entries}`,
    `- Expense: ${totals.expense.toFixed(2)}`,
    `- Income: ${totals.income.toFixed(2)}`,
    `- Net: ${net.toFixed(2)}`,
    `- Currencies: ${currencies}`,
    END,
    ""
  ].join("\n");
}

function replaceOrInsertSummary(content: string, summary: string): string {
  const startIndex = content.indexOf(START);
  const endIndex = content.indexOf(END);

  if (startIndex >= 0 && endIndex >= startIndex) {
    const afterEnd = content.indexOf("\n", endIndex);
    const tail = afterEnd >= 0 ? content.slice(afterEnd + 1) : "";
    const head = content.slice(0, startIndex);
    return `${head}${summary}${tail}`;
  }

  return `${summary}${content}`;
}
