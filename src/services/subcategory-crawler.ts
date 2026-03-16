import fs from 'fs-extra';
import { chromium } from 'playwright';
import { Category, Subcategory } from '../types/types';
import { getCrawlerConfig } from '../config/crawler.config';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { getRandomUserAgent, randomSleep } from '../utils/anti-blocking';

export class SubcategoryCrawler {
  private config = getCrawlerConfig();

  /**
   * Normalize subcategory/model name.
   * 
   * Rules:
   *   - Remove prefix: "Xe ", "Mua bán xe ", "bán xe ", "bán ", "Mua bán xe cũ, mới "
   *   - Remove suffix: " cũ"
   *   - Trim whitespace
   * 
   * Examples:
   *   "Mua bán xe Toyota Vios" → "Toyota Vios"
   *   "bán Honda City" → "Honda City"
   *   "bán xe Hyundai Accent" → "Hyundai Accent"
   *   "Mua bán xe cũ, mới Hyundai Tucson" → "Hyundai Tucson"
   *   "Xe Toyota cũ" → "Toyota"
   *   "bán xe Honda Accord" → "Honda Accord"
   */
  private normalizeSubcategoryName(raw: string): string {
    let name = raw.trim();

    // Remove common Vietnamese prefixes (order matters: longest first)
    const prefixes = [
      'Mua bán xe cũ, mới ',
      'Mua bán xe ',
      'bán xe ',
      'bán ',
      'Xe ',
    ];
    for (const prefix of prefixes) {
      if (name.startsWith(prefix)) {
        name = name.substring(prefix.length);
        break; // Only remove the first matching prefix
      }
    }

    // Remove suffix " cũ"
    if (name.endsWith(' cũ')) {
      name = name.substring(0, name.length - 3);
    }

    return name.trim();
  }

  /**
   * Check if a URL is a valid subcategory (model) URL.
   * 
   * MUST REJECT:
   *   - URLs containing "-moi" (new cars)
   *   - URLs containing "aidxc" (individual vehicle listings)
   *   - URLs containing "-nam-" (year filter links)
   *   - URLs containing "-pb" (phiên bản / variant filter links)
   */
  private isValidSubcategoryUrl(url: string): boolean {
    try {
      const pathname = new URL(url).pathname;
      
      // Reject "ô tô mới" subcategory links
      if (pathname.endsWith('-moi')) return false;
      
      // Reject individual vehicle listing pages (e.g., ...-aidxc23408317)
      if (pathname.includes('aidxc')) return false;
      
      // Reject year-filtered links (e.g., ...-nam-2022)
      if (pathname.includes('-nam-')) return false;
      
      // Reject phiên bản (variant) filter links (e.g., ...-pb)
      if (pathname.endsWith('-pb')) return false;

      return true;
    } catch {
      return false;
    }
  }

  public async crawlSubcategories(): Promise<void> {
    logger.info('Starting subcategory crawl (vehicle models per brand)...');

    // Read categories
    if (!fs.existsSync(this.config.files.categories)) {
      logger.error(`Categories file not found. Run 'crawl:categories' first.`);
      return;
    }

    const categories: Category[] = fs.readJsonSync(this.config.files.categories);
    const allSubcategories: Subcategory[] = [];
    let subcategoryIdCounter = 100; // Start from 100 to avoid collision with category IDs

    const browser = await chromium.launch({ headless: this.config.headless });
    const context = await browser.newContext({ userAgent: getRandomUserAgent() });
    const page = await context.newPage();

    try {
      for (const category of categories) {
        // Skip URLs that contain /mua-ban-xe-moi (new cars)
        if (category.url.includes('/mua-ban-xe-moi')) {
          logger.info(`Skipping "Ô TÔ MỚI" category: ${category.name}`);
          continue;
        }

        try {
          await withRetry(
            async () => {
              await page.goto(category.url, {
                waitUntil: 'networkidle',
                timeout: this.config.pageTimeout
              });
              await randomSleep();
            },
            this.config.maxRetries,
            this.config.requestDelay,
            `Navigate to brand page: ${category.name}`
          );

          // Extract model filter links from the brand page
          const brandSlug = new URL(category.url).pathname; // e.g. /mua-ban-xe-toyota
          
          const rawModels = await page.evaluate((parentSlug: string) => {
            const results: { name: string; url: string }[] = [];
            
            // Find links that are sub-paths of the brand: /mua-ban-xe-toyota-vios
            const links = document.querySelectorAll(`a[href^="${parentSlug}-"]`);
            
            links.forEach((link: Element) => {
              const url = (link as HTMLAnchorElement).href;
              const name = link.textContent?.trim();
              
              if (name && url) {
                results.push({ name, url });
              }
            });

            // Deduplicate by URL
            const unique = Array.from(new Map(results.map(item => [item.url, item])).values());
            return unique;
          }, brandSlug);

          // Filter and normalize model entries
          let validCount = 0;
          for (const model of rawModels) {
            // Apply URL filtering rules
            if (!this.isValidSubcategoryUrl(model.url)) {
              continue;
            }

            subcategoryIdCounter++;
            const normalizedName = this.normalizeSubcategoryName(model.name);

            allSubcategories.push({
              subcategory_id: subcategoryIdCounter,
              category_id: category.category_id,
              name: normalizedName,
              url: model.url
            });
            validCount++;
          }

          logger.info(`Found ${validCount} valid models for ${category.name} (category_id: ${category.category_id}) — filtered from ${rawModels.length} raw links`);
          await randomSleep(1000);

        } catch (error) {
          logger.error(`Failed to extract subcategories for ${category.name}`, error);
          // Continue with next brand
        }
      }

      // Save subcategories
      if (allSubcategories.length > 0) {
        fs.ensureDirSync(this.config.directories.data);
        fs.writeJsonSync(this.config.files.subcategories, allSubcategories, { spaces: 2 });
        logger.success(`Saved ${allSubcategories.length} subcategories to ${this.config.files.subcategories}`);
      } else {
        logger.warn('No subcategories found.');
      }

    } catch (error) {
      logger.error('Subcategory crawl failed', error);
      throw error;
    } finally {
      await page.close();
      await context.close();
      await browser.close();
    }
  }
}

export const subcategoryCrawler = new SubcategoryCrawler();
