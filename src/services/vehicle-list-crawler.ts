import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { randomSleep } from '../utils/anti-blocking';
import { deduplicator } from '../utils/deduplication';

export interface VehicleListResult {
  vehicleUrls: { url: string; listingId: string }[];
  hasNextPage: boolean;
}

export class VehicleListCrawler {
  public async extractVehiclesFromPage(page: Page, url: string): Promise<VehicleListResult> {
    try {
      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          await randomSleep();
        },
        3,
        1500,
        `Navigate to list page ${url}`
      );

      // Extract all vehicle links that have aidxc in URL
      const vehicleLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="-aidxc"]');
        const results: { url: string; listingId: string }[] = [];
        
        links.forEach((link: Element) => {
          const href = (link as HTMLAnchorElement).href;
          const match = href.match(/-aidxc(\d+)/);
          
          if (match && match[1]) {
            results.push({ url: href, listingId: match[1] });
          }
        });
        
        // Deduplicate on page
        return Array.from(new Map(results.map(item => [item.listingId, item])).values());
      });

      logger.info(`Found ${vehicleLinks.length} listings on ${url}`);

      // Filter out duplicates (Level 1, 2, 3) immediately to save memory
      const newVehicles = vehicleLinks.filter(v => !deduplicator.isDuplicate(v.listingId));
      
      if (newVehicles.length < vehicleLinks.length) {
         logger.info(`Skipped ${vehicleLinks.length - newVehicles.length} duplicate listings.`);
      }

      // Check for pagination - next page button exists and is not disabled
      const hasNextPage = await page.evaluate(() => {
        const nextBtn = document.querySelector('.pagination .next');
        const activeNext = document.querySelector('.next-page.active, a.next:not(.disabled)');
        
        // Try multiple selectors common for pagination next buttons
        return !!(nextBtn || activeNext || document.querySelector('a[aria-label="Next"]'));
      });

      return {
        vehicleUrls: newVehicles,
        hasNextPage
      };
      
    } catch (error) {
      logger.error(`Failed to extract vehicles from ${url}`, error);
      throw error;
    }
  }
}

export const vehicleListCrawler = new VehicleListCrawler();
