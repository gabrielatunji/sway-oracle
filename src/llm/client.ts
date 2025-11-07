import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function askModel(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>, schema: unknown): Promise<any> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages,
    max_tokens: 800
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned empty response");
  }

  const parsed = JSON.parse(content);
  if (schema && typeof schema === "object") {
    // Optional runtime validation hook for future use
  }
  return parsed;
}
