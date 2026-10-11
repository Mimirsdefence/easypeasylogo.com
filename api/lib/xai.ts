/**
 * xAI Grok chat-completions helper. Same model/params as the n8n workflow:
 * grok-4.3, temperature 0.7, top_p 0.9.
 */

const XAI_URL = "https://api.x.ai/v1/chat/completions";

export type GrokContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string | GrokContentPart[];
}

export interface GrokOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export class GrokError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function callGrok(
  messages: GrokMessage[],
  opts: GrokOptions = {},
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new GrokError(500, "XAI_API_KEY is not configured");

  const body = {
    model: "grok-4.3",
    messages,
    temperature: opts.temperature ?? 0.7,
    top_p: opts.topP ?? 0.9,
    max_tokens: opts.maxTokens ?? 1024,
  };

  let res: Response;
  try {
    res = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new GrokError(502, `Failed to reach xAI: ${err.message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GrokError(res.status, `xAI error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new GrokError(502, "xAI returned an empty response");
  }
  return content.trim();
}
