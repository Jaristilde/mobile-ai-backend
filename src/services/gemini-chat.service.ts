import {
  GoogleGenAI,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/genai';
import { Response } from 'express';
import { AppError } from '../middleware/error.middleware';
import { BaseService } from './base.service';

// --- Environment Variable Checks ---
if (!process.env.GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY is not set');
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL_NAME = 'gemini-2.0-flash-lite';
const GEMINI_MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '1000', 10);

if (isNaN(GEMINI_MAX_TOKENS)) {
  throw new Error('Invalid MAX_TOKENS value');
}

// --- Client Initialization ---
const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
const geminiModel = genAI.models;

// Define message type for consistency
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// --- Safety Settings (Optional but Recommended) ---
// Adjust these as needed for your application's safety requirements
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

export class GeminiChatService extends BaseService {
  /**
   * Generates a non-streaming response from the Gemini model.
   */
  static async generateResponse(
    prompt: string,
    skipCache: boolean = false
  ): Promise<string> {
    // SINGLE QUERY WITHOUT CONVERSATION MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
    const cacheKey = `gemini:${GEMINI_MODEL_NAME}:${prompt}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) {
      return cachedResponse;
    }

    try {
      const result = await geminiModel.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: GEMINI_MAX_TOKENS,
          safetySettings: safetySettings,
        },
      });

      // Get the response text
      const responseText = result.text;
      if (!responseText) {
        throw new AppError('Empty response received from Gemini API', 400);
      }

      // Check for safety blocks
      if (result.promptFeedback?.blockReason) {
        const blockReason = result.promptFeedback.blockReason;
        const safetyRatings = JSON.stringify(
          result.promptFeedback?.safetyRatings || []
        );
        console.warn(
          `Gemini response blocked. Reason: ${
            blockReason || 'N/A'
          }, Ratings: ${safetyRatings}`
        );
        // Decide how to handle blocked content, maybe throw a specific error or return a default message
        throw new AppError(
          `Content generation blocked by safety filters (Reason: ${
            blockReason || 'Unknown'
          })`,
          400
        );
      }

      // Cache the response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, responseText);
      }

      return responseText;
    } catch (error: unknown) {
      console.error('Error generating Gemini response:', error);
      if (error instanceof AppError) {
        throw error; // Re-throw known AppErrors (like safety blocks)
      }
      // Handle specific Google API errors if needed, otherwise throw generic
      throw new AppError(
        `Error generating Gemini response: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  // MULTI-TURN CONVERSATION WITH MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
  static async generateChatResponse(
    messages: ChatMessage[],
    skipCache: boolean = false
  ): Promise<string> {
    // Format message history in the format Gemini expects
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    }));

    // Create a cache key from all messages
    const cacheKey = `gemini-chat:${GEMINI_MODEL_NAME}:${JSON.stringify(
      formattedMessages
    )}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) {
      return cachedResponse;
    }

    try {
      const result = await geminiModel.generateContent({
        model: GEMINI_MODEL_NAME,
        contents: formattedMessages,
        config: {
          maxOutputTokens: GEMINI_MAX_TOKENS,
          safetySettings: safetySettings,
        },
      });

      // Get the response text
      const responseText = result.text;
      if (!responseText) {
        throw new AppError('Empty response received from Gemini API', 400);
      }

      // Check for safety blocks
      if (result.promptFeedback?.blockReason) {
        const blockReason = result.promptFeedback.blockReason;
        throw new AppError(
          `Content generation blocked by safety filters (Reason: ${
            blockReason || 'Unknown'
          })`,
          400
        );
      }

      // Cache the response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, responseText);
      }

      return responseText;
    } catch (error: unknown) {
      console.error('Error generating Gemini chat response:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        `Error generating Gemini chat response: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Generates a streaming response from the Gemini model using SSE.
   */
  static async generateStreamResponse(
    prompt: string,
    res: Response,
    skipCache: boolean = false
  ): Promise<void> {
    // SINGLE QUERY WITHOUT CONVERSATION MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
    const cacheKey = `gemini:${GEMINI_MODEL_NAME}:${prompt}`;

    try {
      // Try cache first (only if not skipping)
      if (!skipCache) {
        const cachedResponse = await this.getCachedResponse(cacheKey);
        if (cachedResponse) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          // Send the entire cached response as a single data event
          res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // Ensure headers are sent immediately

      const streamResult = await geminiModel.generateContentStream({
        model: GEMINI_MODEL_NAME,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          maxOutputTokens: GEMINI_MAX_TOKENS,
          safetySettings: safetySettings,
        },
      });

      let fullResponse = '';
      let streamBlocked = false;
      let blockReason: string | undefined = undefined;

      for await (const chunk of streamResult) {
        // Check for safety blocks *during* the stream
        if (chunk.promptFeedback?.blockReason) {
          streamBlocked = true;
          blockReason = chunk.promptFeedback.blockReason;
          console.warn(`Gemini stream blocked. Reason: ${blockReason}`);
          // Send an error event over SSE
          res.write(
            `data: ${JSON.stringify({
              error: `Content generation blocked by safety filters (Reason: ${blockReason})`,
            })}\n\n`
          );
          break; // Stop processing the stream
        }

        const chunkText = chunk.text;
        if (chunkText) {
          // Send content chunk
          res.write(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
          fullResponse += chunkText;
        }
      }

      // Final response handling
      if (!streamBlocked && !skipCache && fullResponse) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal only if the stream wasn't blocked prematurely
      if (!streamBlocked) {
        res.write('data: [DONE]\n\n');
      }
      res.end();
    } catch (error: unknown) {
      console.error('Error generating Gemini stream response:', error);
      // Try to send an error message over SSE if headers are sent, otherwise handle normally
      if (!res.headersSent) {
        // If headers not sent, throw a standard error the middleware can catch
        throw new AppError(
          `Error generating Gemini stream: ${error instanceof Error ? error.message : String(error)}`,
          500
        );
      } else if (!res.writableEnded) {
        // Headers sent, stream might be open. Send error event and close.
        try {
          res.write(
            `data: ${JSON.stringify({
              error: `Server error during streaming: ${
                error instanceof Error ? error.message : String(error)
              }`,
            })}\n\n`
          );
          res.write('data: [DONE]\n\n'); // Signal completion even on error if stream is open
        } catch (writeError) {
          console.error('Error writing error to SSE stream:', writeError);
        } finally {
          res.end();
        }
      }
      // Don't re-throw if we handled the error via SSE
    }
  }

  /**
   * Generates a streaming response with conversation history
   */
  static async generateChatStreamResponse(
    messages: ChatMessage[],
    res: Response,
    skipCache: boolean = false
  ): Promise<void> {
    // MULTI-TURN CONVERSATION WITH MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
    // Format message history in the format Gemini expects
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }],
    }));

    // Create a cache key from all messages
    const cacheKey = `gemini-chat-stream:${GEMINI_MODEL_NAME}:${JSON.stringify(
      formattedMessages
    )}`;

    try {
      // Try cache first (only if not skipping)
      if (!skipCache) {
        const cachedResponse = await this.getCachedResponse(cacheKey);
        if (cachedResponse) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          // Send the entire cached response as a single data event
          res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // Ensure headers are sent immediately

      const streamResult = await geminiModel.generateContentStream({
        model: GEMINI_MODEL_NAME,
        contents: formattedMessages,
        config: {
          maxOutputTokens: GEMINI_MAX_TOKENS,
          safetySettings: safetySettings,
        },
      });

      let fullResponse = '';
      let streamBlocked = false;
      let blockReason: string | undefined = undefined;

      for await (const chunk of streamResult) {
        // Check for safety blocks *during* the stream
        if (chunk.promptFeedback?.blockReason) {
          streamBlocked = true;
          blockReason = chunk.promptFeedback.blockReason;
          console.warn(`Gemini stream blocked. Reason: ${blockReason}`);
          // Send an error event over SSE
          res.write(
            `data: ${JSON.stringify({
              error: `Content generation blocked by safety filters (Reason: ${blockReason})`,
            })}\n\n`
          );
          break; // Stop processing the stream
        }

        const chunkText = chunk.text;
        if (chunkText) {
          // Send content chunk
          res.write(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
          fullResponse += chunkText;
        }
      }

      // Final response handling
      if (!streamBlocked && !skipCache && fullResponse) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal only if the stream wasn't blocked prematurely
      if (!streamBlocked) {
        res.write('data: [DONE]\n\n');
      }
      res.end();
    } catch (error: unknown) {
      console.error('Error generating Gemini chat stream response:', error);
      // Try to send an error message over SSE if headers are sent, otherwise handle normally
      if (!res.headersSent) {
        // If headers not sent, throw a standard error the middleware can catch
        throw new AppError(
          `Error generating Gemini chat stream: ${error instanceof Error ? error.message : String(error)}`,
          500
        );
      } else if (!res.writableEnded) {
        // Headers sent, stream might be open. Send error event and close.
        try {
          res.write(
            `data: ${JSON.stringify({
              error: `Server error during streaming: ${
                error instanceof Error ? error.message : String(error)
              }`,
            })}\n\n`
          );
          res.write('data: [DONE]\n\n'); // Signal completion even on error if stream is open
        } catch (writeError) {
          console.error('Error writing error to SSE stream:', writeError);
        } finally {
          res.end();
        }
      }
      // Don't re-throw if we handled the error via SSE
    }
  }
}
