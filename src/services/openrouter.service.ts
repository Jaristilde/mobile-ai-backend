import { Response } from "express";
import OpenAI from "openai";
import { AppError } from "../middleware/error.middleware";
import { BaseService } from "./base.service";
import { ChatMessage } from "./gemini-chat.service";

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is not set");
}

const MODEL = "gpt-4.1-mini";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "500");

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://shipmobilefast.com", // Optional. Site URL for rankings on openrouter.ai.
    "X-Title": "Ship Mobile Fast AI", // Optional. Site title for rankings on openrouter.ai.
  },
});

if (isNaN(MAX_TOKENS)) {
  throw new Error("Invalid MAX_TOKENS value");
}

export class OpenRouterService extends BaseService {
  // SINGLE QUERY WITHOUT CONVERSATION MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
  static async generateResponse(
    prompt: string,
    skipCache: boolean = false
  ): Promise<string> {
    const cacheKey = `openrouter:${prompt}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) {
      return cachedResponse;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: MAX_TOKENS,
        provider: {
          allow_fallbacks: true, // Default: true. Set to false to disable fallbacks.
          order: ["OpenAI", "Anthropic"], // Optional: Specify provider order
        },
        models: ["openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview-03-25"], // Optional: Specify model fallbacks
      } as any); // Cast to any to allow OpenRouter-specific properties

      const responseContent = completion.choices[0]?.message?.content || "";

      // Cache the response
      await this.setCachedResponse(cacheKey, responseContent);

      return responseContent;
    } catch (error) {
      // Log the specific error for better debugging
      console.error("Error generating OpenRouter response:", error);
      throw new AppError("Error generating OpenRouter response", 500);
    }
  }

  // MULTI-TURN CONVERSATION WITH MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
  static async generateChatResponse(
    messages: ChatMessage[],
    skipCache: boolean = false
  ): Promise<string> {
    // Format message history in OpenAI format
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create a cache key from all messages
    const cacheKey = `openrouter-chat:${JSON.stringify(formattedMessages)}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) {
      return cachedResponse;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: formattedMessages,
        max_tokens: MAX_TOKENS,
        provider: {
          allow_fallbacks: true, // Default: true. Set to false to disable fallbacks.
          order: ["OpenAI", "Anthropic"], // Optional: Specify provider order
        },
        models: ["openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview-03-25"], // Optional: Specify model fallbacks
      } as any); // Cast to any to allow OpenRouter-specific properties

      const responseContent = completion.choices[0]?.message?.content || "";

      // Cache the response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, responseContent);
      }

      return responseContent;
    } catch (error) {
      console.error("Error generating OpenRouter chat response:", error);
      throw new AppError("Error generating OpenRouter chat response", 500);
    }
  }

  // SINGLE QUERY WITHOUT CONVERSATION MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
  static async generateStreamResponse(
    prompt: string,
    res: Response, // Use specific type
    skipCache: boolean = false
  ): Promise<void> {
    const cacheKey = `openrouter:${prompt}`;

    try {
      // Check cache first
      const cachedResponse = await this.getCachedResponse(cacheKey);
      if (cachedResponse && !skipCache) {
        // Also respect skipCache here
        // Send cached response respecting SSE format
        // Set headers for SSE before writing
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      // Set headers for SSE - moved up for cache path as well
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // @ts-expect-error
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        stream: true,
        max_tokens: MAX_TOKENS,
        provider: {
          allow_fallbacks: true, // Default: true. Set to false to disable fallbacks.
          order: ["OpenAI", "Anthropic"], // Optional: Specify provider order
        },
        models: ["openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview-03-25"], // Optional: Specify model fallbacks
      });
      let fullResponse = "";

      for await (const chunk of completion) {
        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          // Ensure message format is correct JSON string within data field
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          fullResponse += content;
        }
      }

      // Cache the complete response only if it's not empty and caching is not skipped
      if (fullResponse && !skipCache) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Error generating streaming OpenRouter response:", error);
      // Ensure errors are communicated back if headers not sent
      // If headers are already sent, we can't send a standard error response
      // Best effort: log and end the stream if possible, or just log.
      if (!res.headersSent) {
        // If possible, send an error status before closing
        // Setting headers here might conflict if they were partially set before error
        try {
          // Avoid setting headers again if Content-Type might already be set
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json");
          }
          res
            .status(500)
            .json({ error: "Error generating OpenRouter response" });
        } catch (e) {
          console.error("Could not send error status:", e);
          // If sending error fails, ensure the connection is closed
          if (!res.writableEnded) {
            res.end();
          }
        }
      } else if (!res.writableEnded) {
        // If headers sent, we can't change status code. Just end the stream.
        console.error(
          "Headers already sent, cannot send error status code. Ending stream."
        );
        res.end();
      }
    }
  }

  // MULTI-TURN CONVERSATION WITH MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
  static async generateChatStreamResponse(
    messages: ChatMessage[],
    res: Response,
    skipCache: boolean = false
  ): Promise<void> {
    // Format message history in OpenAI format
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create a cache key from all messages
    const cacheKey = `openrouter-chat-stream:${JSON.stringify(
      formattedMessages
    )}`;

    try {
      // Check cache first
      const cachedResponse = await this.getCachedResponse(cacheKey);
      if (cachedResponse && !skipCache) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // @ts-expect-error
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: formattedMessages,
        stream: true,
        max_tokens: MAX_TOKENS,
        provider: {
          allow_fallbacks: true, // Default: true. Set to false to disable fallbacks.
          order: ["OpenAI", "Anthropic"], // Optional: Specify provider order
        },
        models: ["openai/gpt-4.1-mini", "google/gemini-2.5-pro-preview-03-25"], // Optional: Specify model fallbacks
      });

      let fullResponse = "";

      for await (const chunk of completion) {
        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          fullResponse += content;
        }
      }

      // Cache the complete response
      if (fullResponse && !skipCache) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error(
        "Error generating streaming OpenRouter chat response:",
        error
      );
      if (!res.headersSent) {
        try {
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json");
          }
          res
            .status(500)
            .json({ error: "Error generating OpenRouter chat response" });
        } catch (e) {
          console.error("Could not send error status:", e);
          if (!res.writableEnded) {
            res.end();
          }
        }
      } else if (!res.writableEnded) {
        try {
          res.write(
            `data: ${JSON.stringify({
              error: "Error generating OpenRouter chat response",
            })}\n\n`
          );
          res.write("data: [DONE]\n\n");
        } catch (writeError) {
          console.error("Error writing error to SSE stream:", writeError);
        } finally {
          res.end();
        }
      }
    }
  }
}
