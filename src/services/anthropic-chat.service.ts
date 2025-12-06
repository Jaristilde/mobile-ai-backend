import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../middleware/error.middleware';
import { BaseService } from './base.service';
import { ChatMessage } from '../services/gemini-chat.service';
import { Response } from 'express';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set');
}

const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || '500');
const MODEL = 'claude-3-haiku-20240307';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

if (isNaN(MAX_TOKENS)) {
  throw new Error('Invalid MAX_TOKENS value');
}

export class AnthropicChatService extends BaseService {
  //! SINGLE QUERY WITHOUT CONVERSATION MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
  static async generateResponse(
    prompt: string,
    skipCache: boolean = false
  ): Promise<string> {
    const cacheKey = `anthropic:${prompt}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      let fullResponse = '';
      for await (const messageChunk of message) {
        if (
          messageChunk.type === 'content_block_delta' &&
          messageChunk.delta.type === 'text_delta'
        ) {
          fullResponse += messageChunk.delta.text;
        }
      }

      // Cache the response
      await this.setCachedResponse(cacheKey, fullResponse);

      return fullResponse;
    } catch (error) {
      throw new AppError('Error generating Anthropic response', 500);
    }
  }

  //! MULTI-TURN CONVERSATION WITH MEMORY, RETURNS COMPLETE RESPONSE AT ONCE
  static async generateChatResponse(
    messages: ChatMessage[],
    skipCache: boolean = false
  ): Promise<string> {
    // Format message history in Anthropic format - Claude only accepts 'user' or 'assistant' roles
    const formattedMessages = messages.map((msg) => {
      // System messages need to be handled differently in Anthropic
      if (msg.role === 'system') {
        return { role: 'user' as const, content: msg.content };
      }
      // Convert to Anthropic's expected format
      return {
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.content,
      };
    });

    // Create a cache key from all messages
    const cacheKey = `anthropic-chat:${JSON.stringify(formattedMessages)}`;

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) {
      return cachedResponse;
    }

    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: formattedMessages,
        stream: true,
      });

      let fullResponse = '';
      for await (const messageChunk of message) {
        if (
          messageChunk.type === 'content_block_delta' &&
          messageChunk.delta.type === 'text_delta'
        ) {
          fullResponse += messageChunk.delta.text;
        }
      }

      // Cache the response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      return fullResponse;
    } catch (error) {
      console.error('Error generating Anthropic chat response:', error);
      throw new AppError('Error generating Anthropic chat response', 500);
    }
  }

  //! SINGLE QUERY WITHOUT CONVERSATION MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
  static async generateStreamResponse(
    prompt: string,
    res: Response,
    skipCache: boolean = false
  ): Promise<void> {
    const cacheKey = `anthropic:${prompt}`;

    try {
      // Headers'ı en başta set et
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Check cache first
      const cachedResponse = await this.getCachedResponse(cacheKey);
      if (cachedResponse && !skipCache) {
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      let fullResponse = '';

      for await (const messageChunk of message) {
        if (
          messageChunk.type === 'content_block_delta' &&
          messageChunk.delta.type === 'text_delta'
        ) {
          const content = messageChunk.delta.text;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          fullResponse += content;
        }
      }

      // Cache the complete response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      // Hata durumunda, eğer response hala açıksa hata mesajı gönder
      if (!res.headersSent) {
        res.write(
          `data: ${JSON.stringify({
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          })}\n\n`
        );
      }
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  //! MULTI-TURN CONVERSATION WITH MEMORY, STREAMS RESPONSE CHUNKS IN REAL-TIME
  static async generateChatStreamResponse(
    messages: ChatMessage[],
    res: Response,
    skipCache: boolean = false
  ): Promise<void> {
    // Format message history in Anthropic format - Claude only accepts 'user' or 'assistant' roles
    const formattedMessages = messages.map((msg) => {
      // System messages need to be handled differently in Anthropic
      if (msg.role === 'system') {
        return { role: 'user' as const, content: msg.content };
      }
      // Convert to Anthropic's expected format
      return {
        role: (msg.role === 'assistant' ? 'assistant' : 'user') as
          | 'assistant'
          | 'user',
        content: msg.content,
      };
    });

    // Create a cache key from all messages
    const cacheKey = `anthropic-chat-stream:${JSON.stringify(
      formattedMessages
    )}`;

    try {
      // Headers'ı en başta set et
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Check cache first
      const cachedResponse = await this.getCachedResponse(cacheKey);
      if (cachedResponse && !skipCache) {
        res.write(`data: ${JSON.stringify({ content: cachedResponse })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: formattedMessages,
        stream: true,
      });

      let fullResponse = '';

      for await (const messageChunk of message) {
        if (
          messageChunk.type === 'content_block_delta' &&
          messageChunk.delta.type === 'text_delta'
        ) {
          const content = messageChunk.delta.text;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
          fullResponse += content;
        }
      }

      // Cache the complete response
      if (!skipCache) {
        await this.setCachedResponse(cacheKey, fullResponse);
      }

      // Send completion signal
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Error generating Anthropic chat stream response:', error);
      // Hata durumunda, eğer response hala açıksa hata mesajı gönder
      if (!res.headersSent) {
        res.write(
          `data: ${JSON.stringify({
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          })}\n\n`
        );
      }
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
