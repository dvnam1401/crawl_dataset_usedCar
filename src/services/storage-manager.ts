import fs from 'fs-extra';
import { join } from 'path';
import { getCrawlerConfig } from '../config/crawler.config';
import { VehicleData } from '../types/types';
import { logger } from '../utils/logger';

export class StorageManager {
  private config = getCrawlerConfig();

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
