import fs from 'fs-extra';
import { chromium } from 'playwright';
import { join } from 'path';
import { getCrawlerConfig } from '../config/crawler.config';
import { logger } from '../utils/logger';
import { RepairTask } from '../types/types';
import { deduplicator } from '../utils/deduplication';
import { Worker } from '../workers/worker';
import { getRandomUserAgent } from '../utils/anti-blocking';

export class RepairSystem {
  private config = getCrawlerConfig();

  public async runRepair(): Promise<void> {
    logger.info('Starting Data Repair System...');

    if (!fs.existsSync(this.config.files.repairQueue)) {
      logger.info('No repair queue found. Run integrity check first.');
      return;
    }

    const queue: RepairTask[] = fs.readJsonSync(this.config.files.repairQueue);
    
    if (queue.length === 0) {
      logger.success('Repair queue is empty. Nothing to repair.');
      return;
    }

    logger.warn(`Attempting to repair ${queue.length} vehicles...`);
    
    const browser = await chromium.launch({ headless: this.config.headless });
    const context = await browser.newContext({ userAgent: getRandomUserAgent() });

    try {
      const worker = new Worker('repair'); 
      
      let successCount = 0;
      let failCount = 0;

      for (const task of queue) {
         try {
            logger.info(`Repairing [${task.reason}] for vehicle ${task.listing_id}`);
            
            // Extract URL and IDs from existing vehicle.json
            let urlToCrawl = '';
            let categoryId = 0;
            let subcategoryId = 0;
            const jsonPath = join(this.config.directories.vehicles, task.listing_id, 'vehicle.json');
            
            if (fs.existsSync(jsonPath)) {
               try {
                  const data = fs.readJsonSync(jsonPath);
                  urlToCrawl = data.source_url || '';
                  categoryId = data.category_id || 0;
                  subcategoryId = data.subcategory_id || 0;
               } catch (e) {
                 // Ignore invalid JSON parsing error
               }
            }
            
            if (!urlToCrawl) {
               logger.error(`Cannot repair ${task.listing_id}: Missing URL reference.`);
               failCount++;
               continue;
            }

            if (!categoryId || !subcategoryId) {
               logger.warn(`Repair ${task.listing_id}: Missing category/subcategory IDs, will use 0.`);
            }

            // Remove folder entirely to ensure clean slate
            const vehicleDir = join(this.config.directories.vehicles, task.listing_id);
            if (fs.existsSync(vehicleDir)) {
               fs.removeSync(vehicleDir);
            }
            
            // Re-crawl with proper IDs
            const page = await context.newPage();
            await worker.processVehicle(page, urlToCrawl, task.listing_id, categoryId, subcategoryId);
            await page.close();

            successCount++;

         } catch (error) {
            failCount++;
            logger.error(`Failed to repair vehicle ${task.listing_id}`, error);
         }
      }

      logger.success(`Repair completed. Success: ${successCount}, Failed: ${failCount}`);
      
      if (failCount === 0) {
         // Clear queue
         fs.writeJsonSync(this.config.files.repairQueue, [], { spaces: 2 });
      }

    } finally {
      await context.close();
      await browser.close();
    }
  }
}

if (require.main === module) {
  const system = new RepairSystem();
  system.runRepair()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
