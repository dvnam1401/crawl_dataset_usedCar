import fs from 'fs-extra';
import { join } from 'path';
import { request } from 'playwright';
import { ImageInfo } from '../types/types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import sizeOf from 'image-size';
import { getRandomUserAgent, randomSleep } from '../utils/anti-blocking';

export class ImageDownloader {
  public async downloadImagesSequentially(
    imageUrls: string[],
    imageFolder: string,
    listingId: string
  ): Promise<ImageInfo[]> {
    const images: ImageInfo[] = [];

    // Ensure folder exists
    fs.ensureDirSync(imageFolder);

    const apiContext = await request.newContext({
      userAgent: getRandomUserAgent(),
      ignoreHTTPSErrors: true
    });

    try {
      for (let i = 0; i < imageUrls.length; i++) {
        const sourceUrl = imageUrls[i];
        
        // All vehicle images from oto.com.vn are .webp from CDN
        const filename = `${i + 1}.webp`;
        const localPath = join(imageFolder, filename);

        // Deduplication rule level 3.b: Check if image already exists
        if (fs.existsSync(localPath)) {
          logger.info(`Skipping existing image ${filename} for vehicle ${listingId}`);
          images.push({ filename, local_path: localPath, source_url: sourceUrl });
          continue;
        }

        // Add small random delay between images to avoid rate limiting
        await randomSleep(500);

        try {
          await withRetry(
            async () => {
              const response = await apiContext.get(sourceUrl);
              
              if (!response.ok()) {
                throw new Error(`HTTP ${response.status()} from image server`);
              }
              
              const buffer = await response.body();
              fs.writeFileSync(localPath, buffer);
              
              const stat = fs.statSync(localPath);
              if (stat.size < 10240) { // < 10KB
                 fs.removeSync(localPath);
                 throw new Error(`File size too small (${stat.size} bytes)`);
              }
              
              try {
                  // @ts-ignore
                  const fileBuf = fs.readFileSync(localPath);
                  const dimensions = sizeOf(fileBuf);
                  if (!dimensions.width || !dimensions.height) {
                      fs.removeSync(localPath);
                      throw new Error(`Could not determine dimensions`);
                  }
                  if (dimensions.width < 640 || dimensions.height < 480) {
                      fs.removeSync(localPath);
                      throw new Error(`Resolution too low: ${dimensions.width}x${dimensions.height} (need >= 640x480)`);
                  }
              } catch (e: any) {
                  fs.removeSync(localPath);
                  throw new Error(`Invalid image format: ${e.message}`);
              }
            },
            3, // max retries
            1000, // base delay 1s
            `Download image ${i+1}/${imageUrls.length} for ${listingId}`
          );
          
          logger.info(`Downloaded image ${filename} for vehicle ${listingId}`);
          images.push({ filename, local_path: localPath, source_url: sourceUrl });
          
        } catch (error) {
          logger.error(`Will skip image ${sourceUrl} due to repeated failures.`);
          // If a download fails completely after 3 retries, we just skip it 
          // to not block the whole vehicle. The integrity checker can detect this later.
        }
      }
    } finally {
      await apiContext.dispose();
    }

    return images;
  }
}

export const imageDownloader = new ImageDownloader();
