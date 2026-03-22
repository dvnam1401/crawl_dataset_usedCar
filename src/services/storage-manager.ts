import fs from 'fs-extra';
import { join } from 'path';
import { getCrawlerConfig } from '../config/crawler.config';
import { VehicleData } from '../types/types';
import { logger } from '../utils/logger';

export class StorageManager {
  private config = getCrawlerConfig();
  private descriptionHashes: Set<string> = new Set();
  private hashesLoaded = false;

  constructor() {
    this.initStorage();
  }

  private initStorage(): void {
    try {
      fs.ensureDirSync(this.config.directories.data);
      fs.ensureDirSync(this.config.directories.vehicles);
      fs.ensureDirSync(this.config.directories.logs);
      logger.info('Storage directories initialized');
    } catch (error) {
      logger.error('Failed to initialize storage directories', error);
      throw error;
    }
  }

  /**
   * Lazy-load description hashes from all existing vehicle.json files.
   * Called once on first dedup check to avoid scanning at startup.
   */
  private loadDescriptionHashes(): void {
    if (this.hashesLoaded) return;
    try {
      const vehiclesDir = this.config.directories.vehicles;
      if (fs.existsSync(vehiclesDir)) {
        const folders = fs.readdirSync(vehiclesDir);
        for (const folder of folders) {
          const jsonPath = join(vehiclesDir, folder, 'vehicle.json');
          if (fs.existsSync(jsonPath)) {
            try {
              const data = fs.readJsonSync(jsonPath);
              if (data.description_hash) {
                this.descriptionHashes.add(data.description_hash);
              }
            } catch {
              // Skip corrupted files
            }
          }
        }
        logger.info(`Loaded ${this.descriptionHashes.size} description hashes from storage`);
      }
    } catch (error) {
      logger.error('Error loading description hashes', error);
    }
    this.hashesLoaded = true;
  }

  /**
   * Check if a description hash already exists (deduplication).
   * Thread-safe: Node.js is single-threaded, Set operations are atomic.
   */
  public isDescriptionDuplicate(hash: string): boolean {
    if (!hash) return false;
    this.loadDescriptionHashes();
    return this.descriptionHashes.has(hash);
  }

  public createVehicleFolder(listingId: string): { vehicleFolder: string; imageFolder: string } {
    const vehicleFolder = join(this.config.directories.vehicles, listingId);
    const imageFolder = join(vehicleFolder, 'images');

    try {
      fs.ensureDirSync(vehicleFolder);
      fs.ensureDirSync(imageFolder);
      return { vehicleFolder, imageFolder };
    } catch (error) {
      logger.error(`Failed to create folders for vehicle ${listingId}`, error);
      throw error;
    }
  }

  public getVehicleJsonPath(listingId: string): string {
    const vehicleFolder = join(this.config.directories.vehicles, listingId);
    return join(vehicleFolder, 'vehicle.json');
  }

  public saveVehicleData(data: VehicleData): void {
    const vehicleFolder = join(this.config.directories.vehicles, data.listing_id);
    const vehicleJsonPath = join(vehicleFolder, 'vehicle.json');
    const tempJsonPath = join(vehicleFolder, 'vehicle.json.tmp');
    
    try {
      fs.ensureDirSync(vehicleFolder);
      // Write to temp file first to prevent corruption on crash
      fs.writeJsonSync(tempJsonPath, data, { spaces: 2 });
      // Atomic rename
      fs.renameSync(tempJsonPath, vehicleJsonPath);

      // Track description hash for deduplication
      if (data.description_hash) {
        this.descriptionHashes.add(data.description_hash);
      }
      
      logger.info(`Saved vehicle.json for ${data.listing_id} [cat: ${data.category_id}, sub: ${data.subcategory_id}]`);
    } catch (error) {
      // Cleanup temp file if error
      if (fs.existsSync(tempJsonPath)) {
         fs.removeSync(tempJsonPath);
      }
      logger.error(`Failed to save vehicle.json for ${data.listing_id}`, error);
      throw error;
    }
  }
}

export const storageManager = new StorageManager();

