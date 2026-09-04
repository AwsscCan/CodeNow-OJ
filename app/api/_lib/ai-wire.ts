import type { AiWireApi } from "../../server/ai/ai-settings-repository";

export type WireMessage = { role: "user" | "assistant" | "system"; content: string };

export function buildWireHeaders(apiKey: string, wireApi: AiWireApi): Record<string, string> {
  if (wireApi === "anthropic") {
    return {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
    };
  }
  return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
}

export function buildWireBody(options: {
  wireApi: AiWireApi;
  model: string;
  messages: WireMessage[];
  maxTokens: number;
  temperature?: number;
}) {
  if (options.wireApi === "responses") {
    return {
      model: options.model,
      max_output_tokens: options.maxTokens,
      input: options.messages.map((message) => ({ role: message.role, content: message.content })),
    };
  }
  if (options.wireApi === "anthropic") {
    const system = options.messages.find((message) => message.role === "system")?.content;
    const messages = options.messages
      .filter((message): message is WireMessage & { role: "user" | "assistant" } => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    return {
      model: options.model,
      max_tokens: options.maxTokens,
      ...(system ? { system } : {}),
      messages,
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    };
  }
  return {
    model: options.model,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    max_tokens: options.maxTokens,
    messages: options.messages,
  };
}

type WireResponse = {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  content?: Array<{ type?: string; text?: string }>;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

export function extractWireText(data: WireResponse): string {
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data.content?.length) return data.content.filter((part) => part.type === "text" || !part.type).map((part) => part.text ?? "").join("");
  if (data.output_text) return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";
}

export function extractWireReasoning(data: WireResponse): string | undefined {
  return data.choices?.[0]?.message?.reasoning_content;
}
