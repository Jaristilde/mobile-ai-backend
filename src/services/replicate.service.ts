import Replicate from 'replicate';
import { AppError } from '../middleware/error.middleware';
import { BaseService } from './base.service';

if (!process.env.REPLICATE_API_KEY) {
  throw new Error('REPLICATE_API_KEY is not set');
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_KEY,
});

// Helper function to wait between polling attempts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ReplicateService extends BaseService {
  static async generateImage(
    prompt: string,
    skipCache: boolean = false
  ): Promise<string> {
    const cacheKey = `replicate-sdxl:${prompt}`;

    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse && !skipCache) return cachedResponse;

    try {
      // Create the prediction
      const prediction = await replicate.predictions.create({
        version:
          'black-forest-labs/flux-schnell',
        input: {
          prompt,
          width: 512,
          height: 512,
          num_outputs: 1,
          negative_prompt: 'ugly, blurry, poor quality, low resolution',
          output_format: 'png',
        },
      });

      // Poll for the prediction status
      let result = await replicate.predictions.get(prediction.id);
      while (result.status !== 'succeeded' && result.status !== 'failed') {
        await sleep(1000); // Wait for 1 second before polling again
        result = await replicate.predictions.get(prediction.id);
      }

      if (result.status === 'failed') {
        throw new AppError('Image generation failed', 500);
      }

      const imageUrl = Array.isArray(result.output)
        ? result.output[0]
        : result.output;

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new AppError('No image URL in the response', 500);
      }

      await this.setCachedResponse(cacheKey, imageUrl);
      return imageUrl;
    } catch (error) {
      throw new AppError('Error generating image with SDXL', 500);
    }
  }

  static async removeBackground(imageUrl: string): Promise<string> {
    const cacheKey = `replicate-rembg:${imageUrl}`;

    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse) return cachedResponse;

    try {
      // Create the prediction
      const prediction = await replicate.predictions.create({
        version:
          'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
        input: {
          image: imageUrl,
        },
      });

      // Poll for the prediction status
      let result = await replicate.predictions.get(prediction.id);
      while (result.status !== 'succeeded' && result.status !== 'failed') {
        await sleep(1000);
        result = await replicate.predictions.get(prediction.id);
      }

      if (result.status === 'failed') {
        throw new AppError('Background removal failed', 500);
      }

      const processedUrl = Array.isArray(result.output)
        ? result.output[0]
        : result.output;
      if (!processedUrl || typeof processedUrl !== 'string') {
        throw new AppError('No processed image URL in the response', 500);
      }
      await this.setCachedResponse(cacheKey, processedUrl);
      return processedUrl;
    } catch (error) {
      throw new AppError('Error removing background', 500);
    }
  }

  static async enhanceImage(imageUrl: string): Promise<string> {
    const cacheKey = `replicate-enhance:${imageUrl}`;

    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse) return cachedResponse;

    try {
      const output = await replicate.run(
        'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
        {
          input: {
            image: imageUrl,
            scale: 2,
            face_enhance: true,
          },
        }
      );

      const enhancedUrl = Array.isArray(output) ? output[0] : output;
      if (!enhancedUrl || typeof enhancedUrl !== 'string') {
        throw new Error('No image enhanced');
      }

      await this.setCachedResponse(cacheKey, enhancedUrl);
      return enhancedUrl;
    } catch (error) {
      throw new AppError('Error enhancing image', 500);
    }
  }

  static async generateVideo(prompt: string): Promise<string> {
    const cacheKey = `replicate-video:${prompt}`;

    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse) return cachedResponse;

    try {
      const output = await replicate.run(
        'anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351',
        {
          input: {
            prompt,
            num_frames: 24,
            fps: 12,
            num_inference_steps: 50,
            guidance_scale: 17.5,
            negative_prompt: 'blurry, low quality, low resolution',
          },
        }
      );

      const videoUrl = Array.isArray(output) ? output[0] : output;
      if (!videoUrl || typeof videoUrl !== 'string') {
        throw new Error('No video generated');
      }

      await this.setCachedResponse(cacheKey, videoUrl);
      return videoUrl;
    } catch (error) {
      throw new AppError('Error generating video', 500);
    }
  }

  static async imageToImage(imageUrl: string, prompt: string): Promise<string> {
    const cacheKey = `replicate-img2img:${imageUrl}:${prompt}`;

    const cachedResponse = await this.getCachedResponse(cacheKey);
    if (cachedResponse) return cachedResponse;

    try {
      const output = await replicate.run(
        'stability-ai/stable-diffusion-img2img:15a3689ee13b0d2616e98820eca31d4c3abcd36672df6afce5cb6feb1d66087d',
        {
          input: {
            image: imageUrl,
            prompt,
            num_outputs: 1,
            num_inference_steps: 50,
            guidance_scale: 7.5,
            negative_prompt: 'ugly, blurry, low quality',
            strength: 0.7,
          },
        }
      );

      const resultUrl = Array.isArray(output) ? output[0] : output;
      if (!resultUrl || typeof resultUrl !== 'string') {
        throw new Error('No image generated');
      }

      await this.setCachedResponse(cacheKey, resultUrl);
      return resultUrl;
    } catch (error) {
      throw new AppError('Error transforming image', 500);
    }
  }
}
