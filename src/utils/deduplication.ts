import fs from 'fs-extra';
import { join } from 'path';
import { getCrawlerConfig } from '../config/crawler.config';
import { logger } from './logger';

export class Deduplicator {
  private visitedIds: Set<string>;
  private config = getCrawlerConfig();

  constructor() {
    this.visitedIds = new Set<string>();
    this.loadVisitedIds();
  }

  // Level 1: In-memory & Level 2: visited_ids.json
  private loadVisitedIds(): void {
    try {
      if (fs.existsSync(this.config.files.visitedIds)) {
        const data = fs.readJsonSync(this.config.files.visitedIds);
        if (Array.isArray(data.visited_ids)) {
          data.visited_ids.forEach((id: string) => this.visitedIds.add(id));
        }
      } else {
        fs.ensureDirSync(this.config.directories.data);
        fs.writeJsonSync(this.config.files.visitedIds, { visited_ids: [] });
      }
      logger.info(`Loaded ${this.visitedIds.size} visited IDs from storage`);
    } catch (error) {
      logger.error('Error loading visited IDs', error);
      this.visitedIds = new Set<string>();
    }
  }

  public saveVisitedId(listingId: string): void {
    if (this.visitedIds.has(listingId)) return;
    
    this.visitedIds.add(listingId);
    
    // Save to file
    try {
      fs.writeJsonSync(
        this.config.files.visitedIds, 
        { visited_ids: Array.from(this.visitedIds) },
        { spaces: 2 }
      );
    } catch (error) {
      logger.error(`Error saving vehicle ID ${listingId} to visited_ids.json`, error);
    }
  }

  // Level 3: Check folder and vehicle.json existence
  private checkFolderExists(listingId: string): boolean {
    const vehicleFolder = join(this.config.directories.vehicles, listingId);
    const vehicleJsonPath = join(vehicleFolder, 'vehicle.json');
    
    return fs.existsSync(vehicleJsonPath);
  }

  public isDuplicate(listingId: string): boolean {
    // Level 1: Check memory
    if (this.visitedIds.has(listingId)) {
      return true;
    }
    
    // Level 3: Check filesystem storage (handles case where id wasn't saved to JSON but folder exists)
    if (this.checkFolderExists(listingId)) {
      this.saveVisitedId(listingId); // Sync memory with filesystem
      return true;
    }

    return false;
  }
}

// Export singleton instance
export const deduplicator = new Deduplicator();
