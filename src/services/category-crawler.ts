import fs from 'fs-extra';
import { Page, chromium } from 'playwright';
import { Category } from '../types/types';
import { getCrawlerConfig } from '../config/crawler.config';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { getRandomUserAgent, randomSleep } from '../utils/anti-blocking';

export class CategoryCrawler {
  private config = getCrawlerConfig();

  /**
   * Normalize brand name: "Xe Toyota cũ" → "Toyota"
   */
  private normalizeBrandName(raw: string): string {
    let name = raw.trim();
    if (name.startsWith('Xe ')) name = name.substring(3);
    if (name.endsWith(' cũ')) name = name.substring(0, name.length - 3);
    return name.trim();
  }

  public async crawlCategories(): Promise<void> {
    logger.info('Starting category crawl for "Ô TÔ CŨ"...');
    
    const browser = await chromium.launch({ headless: this.config.headless });
    const context = await browser.newContext({ userAgent: getRandomUserAgent() });
    const page = await context.newPage();
    
    try {
      await withRetry(
        async () => {
          await page.goto('https://oto.com.vn/mua-ban-xe', { 
            waitUntil: 'networkidle',
            timeout: this.config.pageTimeout
          });
          await randomSleep();
        },
        this.config.maxRetries,
        this.config.requestDelay,
        'Navigate to main buy/sell page'
      );

      // Extract brands from the sidebar/menu specifically for used cars
      const rawCategories = await page.evaluate(() => {
        const results: { name: string; url: string }[] = [];
        
        // Find links that match subcategory format: /mua-ban-xe-toyota
        const links = document.querySelectorAll('a[href^="/mua-ban-xe-"]');
        
        links.forEach((link: Element) => {
          const url = (link as HTMLAnchorElement).href;
          const name = link.textContent?.trim();
          
          // Filter valid brand links (avoid specific models like /mua-ban-xe-toyota-vios)
          // A brand link usually has 3 dashes: /mua-ban-xe-brand
          const pathParts = new URL(url).pathname.split('-');
          
          if (name && url && pathParts.length === 4) {
            results.push({ name, url });
          }
        });

        // Deduplicate by URL
        const unique = Array.from(new Map(results.map(item => [item.url, item])).values());
        return unique;
      });

      // Filter out "Ô TÔ MỚI" and normalize names
      const categories: Category[] = rawCategories
        .filter(c => !c.url.includes('/mua-ban-xe-moi'))
        .map((c, index) => ({
          category_id: index + 1,
          name: this.normalizeBrandName(c.name),
          url: c.url
        }));

      if (categories.length === 0) {
        logger.warn('No categories found. DOM structure might have changed.');
      } else {
        logger.success(`Found ${categories.length} categories (normalized, excluding "Ô TÔ MỚI").`);
        
        // Save to data/categories.json
        fs.ensureDirSync(this.config.directories.data);
        fs.writeJsonSync(this.config.files.categories, categories, { spaces: 2 });
        logger.info(`Saved categories to ${this.config.files.categories}`);
      }

    } catch (error) {
      logger.error('Failed to crawl categories', error);
      throw error;
    } finally {
      await context.close();
      await browser.close();
    }
  }
}

export const categoryCrawler = new CategoryCrawler();
