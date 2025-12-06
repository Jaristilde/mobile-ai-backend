import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { OpenAIChatService } from "../services/openai-chat.service";
import { AnthropicChatService } from "../services/anthropic-chat.service";
import { VisionService } from "../services/vision.service";
import { FalAIService } from "../services/fal-ai.service";
import { ReplicateService } from "../services/replicate.service";
import { GeminiChatService } from "../services/gemini-chat.service";
import { GPTImageService } from "../services/gpt-image.service";
import { AppError } from "../middleware/error.middleware";
import { OpenRouterService } from "../services/openrouter.service";

const router = Router();

// Debug middleware
// router.use((req, res, next) => {
//   console.log('AI Router - Incoming request:', {
//     method: req.method,
//     path: req.path,
//     body: req.body,
//   });
//   next();
// });

// Request validation schemas
const baseSchema = z.object({
  skipCache: z.boolean().optional().default(false),
});

const promptSchema = baseSchema.extend({
  prompt: z.string().min(1).max(5000),
});

const visionSchema = baseSchema.extend({
  prompt: z.string().min(1).max(1000),
  imageUrl: z.string(),
});

const chatMessagesSchema = baseSchema.extend({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1),
      })
    )
    .min(1),
});

// Middleware for request validation
const validateRequest =
  (schema: z.ZodSchema) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(new AppError("Invalid request data", 400));
    }
  };

// OpenAI endpoints
router.post(
  "/openai",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      const response = await OpenAIChatService.generateChatResponse(
        messages,
        skipCache
      );
      res.json({ response });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/openai/stream",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      await OpenAIChatService.generateChatStreamResponse(
        messages,
        res,
        skipCache
      );
    } catch (error) {
      next(error);
    }
  }
);

// Anthropic endpoints
router.post(
  "/anthropic",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      const response = await AnthropicChatService.generateChatResponse(
        messages,
        skipCache
      );
      res.json({ response });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/anthropic/stream",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      await AnthropicChatService.generateChatStreamResponse(
        messages,
        res,
        skipCache
      );
    } catch (error) {
      next(error);
    }
  }
);

// Vision endpoint
router.post(
  "/vision",
  validateRequest(visionSchema),
  async (req, res, next) => {
    try {
      const { prompt, imageUrl, skipCache } = req.body;
      const response = await VisionService.analyzeImage(
        imageUrl,
        prompt,
        skipCache
      );
      res.json({ response });
    } catch (error) {
      next(error);
    }
  }
);

// Gemini endpoints with conversation history support
router.post(
  "/gemini",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      const response = await GeminiChatService.generateChatResponse(
        messages,
        skipCache
      );
      res.json({ response });
    } catch (error) {
      next(error);
    }
  }
);

// Streaming version with conversation history support
router.post(
  "/gemini/stream",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      await GeminiChatService.generateChatStreamResponse(
        messages,
        res,
        skipCache
      );
      // Response is handled within the stream method
    } catch (error) {
      next(error);
    }
  }
);

// Fal AI endpoints
router.post(
  "/fal/generate",
  validateRequest(promptSchema),
  async (req, res, next) => {
    try {
      const { prompt, skipCache } = req.body;
      const imageUrl = await FalAIService.generateImage(prompt, skipCache);
      res.json({ imageUrl: imageUrl });
    } catch (error) {
      next(error);
    }
  }
);

// Replicate endpoints
router.post(
  "/replicate/generate",
  validateRequest(promptSchema),
  async (req, res, next) => {
    try {
      const { prompt, skipCache } = req.body;
      const imageUrl = await ReplicateService.generateImage(prompt, skipCache);
      res.json({ imageUrl });
    } catch (error) {
      next(error);
    }
  }
);

// GPT-Image-1 Generation endpoint
router.post(
  "/image/generate",
  validateRequest(promptSchema),
  async (req, res, next) => {
    try {
      const { prompt, skipCache } = req.body;
      const imageUrl = await GPTImageService.generateImage(prompt, skipCache);
      res.json({ imageUrl });
    } catch (error) {
      next(error);
    }
  }
);

// OpenRouter endpoints
router.post(
  "/openrouter",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      const response = await OpenRouterService.generateChatResponse(
        messages,
        skipCache
      );
      res.json({ response });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/openrouter/stream",
  validateRequest(chatMessagesSchema),
  async (req, res, next) => {
    try {
      const { messages, skipCache } = req.body;
      await OpenRouterService.generateChatStreamResponse(
        messages,
        res,
        skipCache
      );
    } catch (error) {
      next(error);
    }
  }
);

export const aiRouter = router;
