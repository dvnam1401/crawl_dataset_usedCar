import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs-extra';
import { getCrawlerConfig } from '../config/crawler.config';
import { queueManager } from '../queue/queue-manager';
import { vehicleListCrawler } from '../services/vehicle-list-crawler';
import { vehicleDetailCrawler } from '../services/vehicle-detail-crawler';
import { storageManager } from '../services/storage-manager';
import { imageDownloader } from '../services/image-downloader';
import { deduplicator } from '../utils/deduplication';
import { logger } from '../utils/logger';
import { getRandomUserAgent, randomSleep } from '../utils/anti-blocking';
import { SubcategoryTask } from '../types/types';
import { v4 as uuidv4 } from 'uuid';

export class Worker {
  private workerId: string;
  private browser: Browser | null = null;
  private config = getCrawlerConfig();

  constructor(id: string) {
    this.workerId = `worker_${id}_${uuidv4().substring(0, 5)}`;
  }

  public async start(): Promise<void> {
    logger.info(`Worker ${this.workerId} starting...`);
    
    this.browser = await chromium.launch({ headless: this.config.headless });
    
    try {
      let active = true;
      while (active) {
        const task = queueManager.getNextTask(this.workerId);
        
        if (!task) {
          logger.info(`Worker ${this.workerId} found no pending tasks. Sleeping...`);
          await randomSleep(5000);
          if (queueManager.getPendingCount() === 0) {
             logger.info(`Worker ${this.workerId} terminal exit. Queue is entirely empty.`);
             active = false;
          }
          continue;
        }

        try {
          await this.processSubcategory(task);
          queueManager.completeTask(task.task_id);
        } catch (error) {
          logger.error(`Worker ${this.workerId} failed task ${task.task_id}`, error);
          queueManager.failTask(task.task_id);
        }
      }
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  private async processSubcategory(task: SubcategoryTask): Promise<void> {
    // Resume from the page right after the last completed page
    let currentPageNum = task.last_page_completed + 1;
    let hasNextPage = true;
    
    logger.success(`Worker ${this.workerId} executing task: ${task.task_id} — ${task.subcategory} (sub_id: ${task.subcategory_id}, cat_id: ${task.category_id}) — RESUMING AT PAGE ${currentPageNum}`);
    
    const context = await this.browser!.newContext({ userAgent: getRandomUserAgent() });
    const page = await context.newPage();

    try {
      while (hasNextPage) {
        // Extend lock before processing page
        task.lock_expire = Date.now() + 10 * 60 * 1000;
        
        // URL pagination pattern: /mua-ban-xe-toyota-vios/p2
        const pageUrl = currentPageNum === 1 
          ? task.url 
          : `${task.url}/p${currentPageNum}`;
          
        logger.info(`Crawling subcategory page ${currentPageNum}: ${pageUrl}`);
        
        // 1. Extract vehicle list
        const listResult = await vehicleListCrawler.extractVehiclesFromPage(page, pageUrl);
        
        // 2. Crawl each vehicle detail
        for (const vehicle of listResult.vehicleUrls) {
          if (deduplicator.isDuplicate(vehicle.listingId)) {
            logger.info(`Skipped duplicate vehicle ${vehicle.listingId} at worker level`);
            continue;
          }
          
          await this.processVehicle(page, vehicle.url, vehicle.listingId, task.category_id, task.subcategory_id);
        }
        
        // Check for next page
        hasNextPage = listResult.hasNextPage;
        
        // Mark this page as completed and move checkpoint forward
        queueManager.updatePageProgress(task.task_id, currentPageNum);
        
        if (hasNextPage) {
           currentPageNum++;
           await randomSleep(2000);
        }
      }
    } finally {
      await page.close();
      await context.close();
    }
  }

  public async processVehicle(
    page: Page,
    url: string,
    listingId: string,
    categoryId: number,
    subcategoryId: number
  ): Promise<void> {
    try {
      // 0. Pre-request validation: Check if already stored completely
      const expectedJsonPath = storageManager.getVehicleJsonPath(listingId);
      if (fs.existsSync(expectedJsonPath)) {
        logger.info(`Vehicle ${listingId} already exists locally. Skipping detail request.`);
        deduplicator.saveVisitedId(listingId); // Sync memory
        return;
      }
      
      // 1. Extract vehicle data + image URLs
      const { info, imageUrls } = await vehicleDetailCrawler.extractVehicleData(page, url);
      
      // Create storage folders
      const { vehicleFolder, imageFolder } = storageManager.createVehicleFolder(listingId);
      
      // 2. Download images sequentially
      const downloadedImages = await imageDownloader.downloadImagesSequentially(imageUrls, imageFolder, listingId);
      
      // 3. Build vehicle JSON with category_id and subcategory_id
      const vehicleData = {
        listing_id: listingId,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        vehicle_info: info,
        source_url: url,
        images: downloadedImages,
        image_count: downloadedImages.length,
        crawled_at: new Date().toISOString()
      };
      
      // 4. Save vehicle.json
      storageManager.saveVehicleData(vehicleData);
      
      // 5. Update visited ID
      deduplicator.saveVisitedId(listingId);
      logger.success(`Successfully processed vehicle ${listingId} (${info.title}) [cat: ${categoryId}, sub: ${subcategoryId}]`);
      
    } catch (error) {
      logger.error(`Failed resolving vehicle ${listingId}: ${url}`, error);
    }
  }
}
