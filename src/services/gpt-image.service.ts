import OpenAI from "openai";
import { AppError } from "../middleware/error.middleware";
import { BaseService } from "./base.service"; // Import BaseService

// Check for API key at module level
if (!process.env.OPENAI_API_KEY) {
  throw new AppError("OpenAI API key is not configured", 500);
}

// Initialize client at module level with increased timeout
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 180000, // Increase timeout to 3 minutes (180000ms)
});

// Define model name as a constant
const IMAGE_MODEL = "gpt-image-1"; // Reverted model name per user request

export class GPTImageService extends BaseService {
  // Extend BaseService
  static async generateImage(
    prompt: string,
    skipCache: boolean = false // Add skipCache parameter
  ): Promise<string> {
    const cacheKey = `gpt-image:${prompt}`; // Define cache key

    // Check cache first
    const cachedResponse = await this.getCachedResponse(cacheKey, {
      skipCache,
    });
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      console.log("Attempting to generate image with prompt:", prompt);
      const response = await client.images.generate({
        model: IMAGE_MODEL,
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        output_format: "png",
        quality: "low",
        moderation: "low",
      });

      // Check for b64_json instead of url
      if (!response.data || !response.data[0]?.b64_json) {
        throw new AppError("Failed to generate image data", 500);
      }

      const imageData = response.data[0].b64_json;

      // Cache the successful response
      await this.setCachedResponse(cacheKey, imageData, { skipCache });

      // Return base64 encoded image data
      return imageData;
    } catch (error) {
      console.error("Error generating image:", error);
      // Improve error message based on potential error types
      if (error instanceof OpenAI.APIError) {
        throw new AppError(
          `API Error (${error.status}): ${error.message}`,
          error.status || 500
        );
      } else if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string" &&
        (error.message.includes("timeout") ||
          error.message.includes("timed out"))
      ) {
        throw new AppError(
          "API request timed out. Please try again later.",
          504 // Gateway Timeout status
        );
      } else {
        // Re-throw the original error or a generic one if needed
        if (
          error instanceof AppError &&
          error.message === "Failed to generate image data"
        ) {
          throw error; // Re-throw the specific AppError if it came from the check
        }
        // Throw the generic error for any other type of error caught after API call
        throw new AppError("Failed to generate image after API call", 500);
      }
    }
  }
}
