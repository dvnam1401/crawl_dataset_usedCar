import { categoryCrawler } from './services/category-crawler';
import { subcategoryCrawler } from './services/subcategory-crawler';
import { queueManager } from './queue/queue-manager';
import { workerPool } from './workers/worker-pool';
import { getCrawlerConfig } from './config/crawler.config';
import { logger } from './utils/logger';
import { Subcategory } from './types/types';
import fs from 'fs-extra';

async function main() {
  const args = process.argv.slice(2);
  const phaseIndex = args.indexOf('--phase');
  const phase = phaseIndex !== -1 ? args[phaseIndex + 1] : 'all';

  logger.info(`Starting crawler with phase: ${phase}`);
  const config = getCrawlerConfig();

  try {
    switch (phase) {
      case 'categories':
        // Phase 1: Crawl Categories (brands) from "Ô TÔ CŨ" section
        await categoryCrawler.crawlCategories();
        break;

      case 'subcategories':
        // Phase 2: Crawl Subcategories (models) for each brand
        if (!fs.existsSync(config.files.categories)) {
          logger.error(`Could not find categories file at ${config.files.categories}. Run 'crawl:categories' first.`);
          process.exit(1);
        }
        await subcategoryCrawler.crawlSubcategories();
        break;
        
      case 'queue':
        // Phase 3: Create Queue from Subcategories (NOT categories)
        if (!fs.existsSync(config.files.subcategories)) {
          logger.error(`Could not find subcategories file at ${config.files.subcategories}. Run 'crawl:subcategories' first.`);
          process.exit(1);
        }
        
        const subcategories: Subcategory[] = fs.readJsonSync(config.files.subcategories);
        queueManager.addTasks(subcategories);
        logger.success('Subcategory queue generated successfully from subcategories!');
        break;

      case 'crawl':
        // Phase 4: Run Worker Pool to crawl vehicle list & details
        if (!fs.existsSync(config.files.queue)) {
          logger.error(`Could not find queue file at ${config.files.queue}. Run 'crawl:queue' first.`);
          process.exit(1);
        }
        
        await workerPool.startPool();
        break;

      case 'all':
        // Run full pipeline sequentially: categories → subcategories → queue → crawl
        logger.info('--- RUNNING FULL PIPELINE ---');
        
        // Step 1: Crawl categories
        await categoryCrawler.crawlCategories();
        
        // Step 2: Crawl subcategories
        await subcategoryCrawler.crawlSubcategories();
        
        // Step 3: Generate queue from subcategories
        const allSubcategories: Subcategory[] = fs.readJsonSync(config.files.subcategories);
        queueManager.addTasks(allSubcategories);
        
        // Step 4: Run workers
        await workerPool.startPool();
        break;

      default:
        logger.error(`Unknown phase: ${phase}. Use 'categories', 'subcategories', 'queue', 'crawl' or 'all'`);
        process.exit(1);
    }
    
    logger.success(`Phase '${phase}' completed successfully!`);
    
  } catch (error) {
    logger.error('Crawler pipeline failed critically', error);
    process.exit(1);
  }
}

main();
