import { Platform, requestUrl } from "obsidian";
import type { McpEndpoint } from "../types";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface SseSession {
  postUrl: string;
  controller?: AbortController;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export class McpService {
  private id = 1;
  private readonly sseSessions = new Map<string, SseSession>();
  private readonly initialized = new Set<string>();

  constructor(private readonly endpoints: McpEndpoint[]) {}

  getEnabledEndpoints(): McpEndpoint[] {
    return this.endpoints.filter((e) => e.enabled && e.urlOrCommand.trim().length > 0);
  }

  async pingEndpoint(endpoint: McpEndpoint): Promise<boolean> {
    try {
      if (endpoint.transport === "stdio") {
        if (!Platform.isDesktopApp) return false;
        await this.listTools(endpoint);
        return true;
      }

      const response = await requestUrl({
        url: endpoint.urlOrCommand,
        method: "GET",
        throw: false
      });
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  }

  async listTools(endpoint: McpEndpoint): Promise<McpTool[]> {
    if (endpoint.transport === "stdio") {
      const result = await runStdioMcpCommand(endpoint.urlOrCommand, "tools/list", {});
      return toTools(result);
    }

    await this.ensureInitialized(endpoint);
    const response = await this.sendRpc(endpoint, "tools/list", {});
    return toTools(response?.result);
  }

  async callTool(endpoint: McpEndpoint, toolName: string, args: Record<string, unknown>): Promise<string> {
    if (endpoint.transport === "stdio") {
      const result = await runStdioMcpCommand(endpoint.urlOrCommand, "tools/call", {
        name: toolName,
        arguments: args
      });
      return stringifyToolResult(result);
    }

    await this.ensureInitialized(endpoint);
    const response = await this.sendRpc(endpoint, "tools/call", {
      name: toolName,
      arguments: args
    });
    return stringifyToolResult(response?.result);
  }

  private async ensureInitialized(endpoint: McpEndpoint): Promise<void> {
    const key = endpointKey(endpoint);
    if (this.initialized.has(key)) return;

    try {
      await this.sendRpc(endpoint, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "intent-inbox", version: "0.1.0" }
      });

      await this.sendRpc(endpoint, "notifications/initialized", {}, false);
    } finally {
      this.initialized.add(key);
    }
  }

  private async sendRpc(
    endpoint: McpEndpoint,
    method: string,
    params: Record<string, unknown>,
    expectResponse = true
  ): Promise<JsonRpcResponse | null> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params
    };
    if (expectResponse) {
      request.id = this.id++;
    }

    if (endpoint.transport === "http") {
      return postJsonObsidian(endpoint.urlOrCommand, request, expectResponse);
    }

    const session = await this.getOrCreateSseSession(endpoint);
    return postJsonObsidian(session.postUrl, request, expectResponse);
  }

  private async getOrCreateSseSession(endpoint: McpEndpoint): Promise<SseSession> {
    const key = endpointKey(endpoint);
    const existing = this.sseSessions.get(key);
    if (existing) return existing;

    const session = await createSseSession(endpoint.urlOrCommand);
    this.sseSessions.set(key, session);
    return session;
  }

  dispose(): void {
    for (const session of this.sseSessions.values()) {
      session.controller?.abort();
    }
    this.sseSessions.clear();
    this.initialized.clear();
  }
}

function endpointKey(endpoint: McpEndpoint): string {
  return `${endpoint.transport}:${endpoint.name}:${endpoint.urlOrCommand}`;
}

async function postJsonObsidian(url: string, body: JsonRpcRequest, expectResponse: boolean): Promise<JsonRpcResponse | null> {
  if (!expectResponse) {
    await requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
      throw: false
    });
    return null;
  }

  const response = await requestUrl({
    url,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify(body),
    throw: false
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MCP request failed: ${response.status}`);
  }

  return response.json as JsonRpcResponse;
}

async function createSseSession(sseUrl: string): Promise<SseSession> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(sseUrl, {
      method: "GET",
      headers: { Accept: "text/event-stream" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`SSE handshake failed: ${response.status}`);
    }
    if (!response.body) {
      return { postUrl: sseUrl, controller };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const match = buffer.match(/event:\s*endpoint\s*\ndata:\s*([^\n\r]+)/i);
      if (match) {
        const endpointPath = match[1].trim();
        const postUrl = endpointPath.startsWith("http") ? endpointPath : new URL(endpointPath, sseUrl).toString();
        return { postUrl, controller };
      }

      if (buffer.length > 16000) {
        break;
      }
    }

    return { postUrl: sseUrl, controller };
  } finally {
    window.clearTimeout(timer);
  }
}

function toTools(result: unknown): McpTool[] {
  if (!result || typeof result !== "object") return [];
  const tools = (result as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((item): item is McpTool => typeof item === "object" && item !== null && "name" in item)
    .map((item) => ({
      name: String(item.name),
      description: typeof item.description === "string" ? item.description : undefined,
      inputSchema: (item as { inputSchema?: unknown }).inputSchema
    }));
}

function stringifyToolResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return JSON.stringify(result);
  }

  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return JSON.stringify(result, null, 2);
  }

  const chunks = content.map((item) => {
    if (!item || typeof item !== "object") return JSON.stringify(item);
    if (typeof (item as { text?: unknown }).text === "string") {
      return (item as { text: string }).text;
    }
    return JSON.stringify(item);
  });
  return chunks.join("\n");
}

async function runStdioMcpCommand(
  command: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  if (!Platform.isDesktopApp) {
    throw new Error("stdio MCP is only available on desktop.");
  }

  const { spawn } = await import("node:child_process");
  const child = spawn(command, {
    shell: true,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const parser = new StdioMessageParser();
  const pending = new Map<number, { resolve: (value: JsonRpcResponse) => void; reject: (reason: unknown) => void }>();
  let nextId = 1;

  child.stdout.on("data", (chunk: Buffer) => {
    const messages = parser.push(chunk);
    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      const id = (message as { id?: unknown }).id;
      if (typeof id !== "number") continue;
      const slot = pending.get(id);
      if (!slot) continue;
      pending.delete(id);
      slot.resolve(message as JsonRpcResponse);
    }
  });

  child.stderr.on("data", () => {
    // no-op: server logs are ignored here
  });

  child.on("exit", (code) => {
    for (const slot of pending.values()) {
      slot.reject(new Error(`MCP stdio process exited: ${code ?? "unknown"}`));
    }
    pending.clear();
  });

  const sendRequest = async (rpcMethod: string, rpcParams: Record<string, unknown>): Promise<JsonRpcResponse> => {
    const id = nextId++;
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method: rpcMethod,
      params: rpcParams
    };
    writeStdioMessage(child.stdin, req);

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`MCP stdio timeout for method: ${rpcMethod}`));
        }
      }, 15000);
    });
  };

  const sendNotification = (rpcMethod: string, rpcParams: Record<string, unknown>): void => {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: rpcMethod,
      params: rpcParams
    };
    writeStdioMessage(child.stdin, req);
  };

  try {
    await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "intent-inbox", version: "0.1.0" }
    });
    sendNotification("notifications/initialized", {});

    const response = await sendRequest(method, params);
    if (response.error) {
      throw new Error(`MCP error ${response.error.code}: ${response.error.message}`);
    }
    return response.result;
  } finally {
    child.kill();
  }
}

class StdioMessageParser {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    while (true) {
      const headerEnd = this.findHeaderEnd(this.buffer);
      if (headerEnd < 0) break;

      const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
      const contentLength = this.extractContentLength(headerText);
      if (contentLength < 0) break;

      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) break;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength).toString("utf8");
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        messages.push(JSON.parse(body));
      } catch {
        // ignore malformed body
      }
    }

    return messages;
  }

  private findHeaderEnd(buffer: Buffer): number {
    for (let i = 0; i < buffer.length - 3; i++) {
      if (
        buffer[i] === 13 &&
        buffer[i + 1] === 10 &&
        buffer[i + 2] === 13 &&
        buffer[i + 3] === 10
      ) {
        return i;
      }
    }
    return -1;
  }

  private extractContentLength(headerText: string): number {
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) return -1;
    return Number.parseInt(match[1], 10);
  }
}

function writeStdioMessage(stream: NodeJS.WritableStream, payload: JsonRpcRequest): void {
  const content = JSON.stringify(payload);
  const bytes = Buffer.byteLength(content, "utf8");
  const message = `Content-Length: ${bytes}\r\n\r\n${content}`;
  stream.write(message);
}
