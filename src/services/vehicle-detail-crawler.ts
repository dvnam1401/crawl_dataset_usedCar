import { Page } from 'playwright';
import { VehicleInfo } from '../types/types';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { randomSleep } from '../utils/anti-blocking';

export class VehicleDetailCrawler {
  public async extractVehicleData(page: Page, url: string): Promise<{ info: VehicleInfo; imageUrls: string[] }> {
    try {
      await withRetry(
        async () => {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 });
          // Mở rộng bộ nhớ đệm hình ảnh / lazy loading if exists
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await randomSleep(2000); // Đợi tải ảnh
        },
        3,
        1500,
        `Navigate to detail page ${url}`
      );

      // Extract Vehicle Info
      const info = await page.evaluate((): VehicleInfo => {
        // Hàm helper lấy text an toàn
        const getText = (selector: string): string => {
          const el = document.querySelector(selector);
          return el ? el.textContent?.trim() || '' : '';
        };

        // Lấy giá trị từ danh sách thông số (ul/li lists thường thấy)
        const getSpec = (labelFragment: string): string => {
          const listItems = Array.from(document.querySelectorAll('li, .box-info-detail .item')) as HTMLElement[];
          const item = listItems.find((li) => li.textContent?.toLowerCase().includes(labelFragment.toLowerCase()));
          
          if (item) {
             // Thường cấu trúc là <span>Label:</span> <span>Value</span>
             const valueElement = item.querySelector('.value, span:not(.label)');
             if (valueElement) return valueElement.textContent?.trim() || '';
             
             // Xử lý fallback cho text node
             const text = item.textContent || '';
             const split = text.split(':');
             if (split.length > 1) return split[1].trim();
             return text.replace(new RegExp(labelFragment, 'i'), '').trim();
          }
          return '';
        };

        const title = getText('h1') || getText('.title-detail');
        const price = getText('.price') || getText('.price-detail') || getText('.title-price');
        
        return {
          title,
          price,
          year: getSpec('Năm SX') || getSpec('năm sản xuất'),
          location: getSpec('Tỉnh thành') || getSpec('địa chỉ'),
          fuel: getSpec('Nhiên liệu'),
          transmission: getSpec('Hộp số'),
          mileage: getSpec('Km đã đi') || getSpec('số km'),
          body_style: getSpec('Kiểu dáng'),
          origin: getSpec('Xuất xứ')
        };
      });

      // Bắt buộc fallback cho những trường rỗng nếu có thể regex từ title
      if (!info.year) {
        const yearMatch = info.title.match(/(20\d{2}|19\d{2})/);
        if (yearMatch) info.year = yearMatch[0];
      }

      // ========================================================
      // Extract Images from Swiper Gallery (data-src attribute)
      // ========================================================
      let imageUrls: string[] = [];
      const MAX_EXTRACT_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_EXTRACT_RETRIES; attempt++) {
        try {
          // Wait for the main gallery container to be present
          await page.waitForSelector('.slider-detail .gallery-top .swiper-slide.imageGallery', {
            state: 'attached',
            timeout: 5000
          });

          // Extract data-src from each slide in the MAIN gallery only
          // MUST NOT extract from .gallery-thumbs (thumbnails are low-res 262x196)
          const rawUrls = await page.evaluate(() => {
            const slides = document.querySelectorAll(
              '.slider-detail .gallery-top .swiper-slide.imageGallery'
            );
            const urls: string[] = [];
            slides.forEach((slide: Element) => {
              const dataSrc = slide.getAttribute('data-src');
              if (dataSrc) urls.push(dataSrc);
            });
            return urls;
          });

          // Validate & filter URLs
          imageUrls = rawUrls.filter(u => {
            // 1. Must exist and be a real URL
            if (!u || !u.startsWith('http')) return false;
            // 2. Must NOT be a placeholder (/Static/Images/)
            if (u.includes('/Static/Images/')) return false;
            // 3. Must contain /crop/640x480/ (high-res indicator)
            if (!u.includes('/crop/640x480/')) return false;
            return true;
          });

          // Image count validation against gallery indicator
          const expectedCount = await page.evaluate(() => {
            const totalEl = document.querySelector('.swiper-pagination-total');
            return totalEl ? parseInt(totalEl.textContent?.trim() || '0', 10) : 0;
          });

          if (expectedCount > 0 && imageUrls.length !== expectedCount) {
            logger.warn(
              `Image count mismatch for ${url}: extracted ${imageUrls.length}, expected ${expectedCount}. Attempt ${attempt}/${MAX_EXTRACT_RETRIES}`
            );
            if (attempt < MAX_EXTRACT_RETRIES) {
              await randomSleep(1000);
              // Scroll to trigger lazy loading
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await randomSleep(1000);
              continue; // retry extraction
            }
          }

          // If we got images, break the retry loop
          if (imageUrls.length > 0) break;

        } catch (e) {
          logger.warn(`Gallery extraction attempt ${attempt} failed for ${url}`);
          if (attempt < MAX_EXTRACT_RETRIES) {
            await randomSleep(1000);
          }
        }
      }

      logger.info(`Extracted data and ${imageUrls.length} images for ${url}`);

      return { info, imageUrls };
      
    } catch (error) {
      logger.error(`Failed to extract data from ${url}`, error);
      throw error;
    }
  }
}

export const vehicleDetailCrawler = new VehicleDetailCrawler();
