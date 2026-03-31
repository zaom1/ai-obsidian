export type SkillType = "accounting" | "subscription" | "todo" | "reminder" | "memo";

export type McpTransport = "http" | "sse" | "stdio";

export interface LlmSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  useLlmForParsing: boolean;
}

export interface SttSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
  temperature: number;
  prompt: string;
  timeoutMs: number;
}

export interface McpEndpoint {
  name: string;
  transport: McpTransport;
  urlOrCommand: string;
  enabled: boolean;
}

export interface SkillToggles {
  accounting: boolean;
  subscription: boolean;
  todo: boolean;
  reminder: boolean;
  memo: boolean;
}

export interface ReminderMcpSettings {
  enabled: boolean;
  endpointName: string;
  toolName: string;
}

export interface SmartCaptureSettings {
  llm: LlmSettings;
  stt: SttSettings;
  skills: SkillToggles;
  financeFolder: string;
  subscriptionFile: string;
  taskFile: string;
  reminderFile: string;
  memoFolder: string;
  mcpEndpoints: McpEndpoint[];
  reminderMcp: ReminderMcpSettings;
}

export interface ParsedIntent {
  skill: SkillType;
  text: string;
  amount?: number;
  currency?: string;
  transactionType?: "expense" | "income";
  paymentMethod?: string;
  title?: string;
  dueDate?: string;
  cycle?: string;
  vendor?: string;
  tags?: string[];
}

export interface SkillResult {
  path: string;
  content: string;
  action: "append" | "prepend";
  summary: string;
}
