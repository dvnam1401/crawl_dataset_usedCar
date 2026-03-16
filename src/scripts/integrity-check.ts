import fs from 'fs-extra';
import { join } from 'path';
import sizeOf from 'image-size';
import { getCrawlerConfig } from '../config/crawler.config';
import { logger } from '../utils/logger';
import { IntegrityReport, RepairTask } from '../types/types';

export class IntegrityChecker {
  private config = getCrawlerConfig();

  public async runCheck(): Promise<void> {
    logger.info('Starting Data Integrity Check...');

    const report: IntegrityReport = {
      total_vehicles: 0,
      valid_vehicles: 0,
      corrupted_vehicles: 0,
      missing_images: 0,
      missing_json: 0,
      mismatched_image_count: 0,
      empty_folders: 0,
      invalid_images: 0,
      missing_ids: 0
    };

    const repairQueue: RepairTask[] = [];

    // Ensure directory exists
    if (!fs.existsSync(this.config.directories.vehicles)) {
      logger.warn(`Vehicle directory not found at ${this.config.directories.vehicles}`);
      return;
    }

    const folders = fs.readdirSync(this.config.directories.vehicles);
    report.total_vehicles = folders.length;

    for (const listingId of folders) {
      const vehicleDir = join(this.config.directories.vehicles, listingId);
      
      // Skip if not directory
      if (!fs.statSync(vehicleDir).isDirectory()) {
         report.total_vehicles--;
         continue;
      }
      
      const jsonPath = join(vehicleDir, 'vehicle.json');
      const imgDir = join(vehicleDir, 'images');

      // 1. Check for empty folder
      if (!fs.existsSync(jsonPath) && !fs.existsSync(imgDir)) {
        report.empty_folders++;
        report.corrupted_vehicles++;
        repairQueue.push({ listing_id: listingId, reason: 'empty_folder' });
        continue;
      }

      // 2. Check missing JSON
      if (!fs.existsSync(jsonPath)) {
        report.missing_json++;
        report.corrupted_vehicles++;
        repairQueue.push({ listing_id: listingId, reason: 'missing_json' });
        continue;
      }

      try {
        // Parse JSON
        const rawJson = fs.readFileSync(jsonPath, 'utf8');
        const vehicleData = JSON.parse(rawJson);

        // 3. Check for missing category_id or subcategory_id
        if (!vehicleData.category_id || !vehicleData.subcategory_id) {
          report.missing_ids++;
          report.corrupted_vehicles++;
          repairQueue.push({ listing_id: listingId, reason: 'missing_category_or_subcategory_id' });
          continue;
        }
        
        // 4. Check for missing images directory or files
        if (!fs.existsSync(imgDir)) {
           report.missing_images++;
           report.corrupted_vehicles++;
           repairQueue.push({ listing_id: listingId, reason: 'missing_images_folder' });
           continue;
        }

        const images = fs.readdirSync(imgDir).filter(f => !f.startsWith('.'));
        
        // 5. Mismatched image count vs actual images
        if (images.length !== vehicleData.image_count) {
           report.mismatched_image_count++;
           report.corrupted_vehicles++;
           repairQueue.push({ listing_id: listingId, reason: 'mismatched_image_count' });
           continue;
        }

        // 6. Missing images references in JSON or corrupt/invalid images
        let hasMissing = false;
        let hasInvalid = false;
        for (const img of vehicleData.images) {
           const localPath = join(imgDir, img.filename);
           if (!fs.existsSync(localPath)) {
              hasMissing = true;
           } else {
              try {
                  const stat = fs.statSync(localPath);
                  if (stat.size < 10240) {
                      hasInvalid = true;
                  } else {
                      // @ts-ignore
                      const buffer = fs.readFileSync(localPath);
                      const dimensions = sizeOf(buffer);
                      if (!dimensions.width || !dimensions.height) {
                          hasInvalid = true;
                      } else if (dimensions.width < 640 || dimensions.height < 480) {
                          hasInvalid = true;
                      }
                  }
              } catch (e) {
                  hasInvalid = true;
              }
           }
        }
        
        if (hasMissing) {
           report.missing_images++;
           report.corrupted_vehicles++;
           repairQueue.push({ listing_id: listingId, reason: 'missing_referenced_image' });
           continue;
        }
        
        if (hasInvalid) {
           report.invalid_images++;
           report.corrupted_vehicles++;
           repairQueue.push({ listing_id: listingId, reason: 'invalid_image_detected' });
           continue;
        }

        // If all checks pass
        report.valid_vehicles++;

      } catch (error) {
        // Corrupted JSON file
        report.corrupted_vehicles++;
        repairQueue.push({ listing_id: listingId, reason: 'corrupted_json' });
      }
    }

    // Save reports
    fs.ensureDirSync(this.config.directories.logs);
    fs.writeJsonSync(this.config.files.integrityReport, report, { spaces: 2 });
    
    fs.ensureDirSync(this.config.directories.data);
    fs.writeJsonSync(this.config.files.repairQueue, repairQueue, { spaces: 2 });

    logger.success('Integrity Check Completed!');
    logger.info(`Report saved at: ${this.config.files.integrityReport}`);
    logger.info('Report Summary:', report);
    
    if (repairQueue.length > 0) {
      logger.warn(`Found ${repairQueue.length} vehicles requiring repair. Created repair queue.`);
    }

    if (report.missing_ids > 0) {
      logger.warn(`Found ${report.missing_ids} vehicles with missing category_id or subcategory_id.`);
    }
  }
}

// Enable standalone execution
if (require.main === module) {
  const checker = new IntegrityChecker();
  checker.runCheck()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
