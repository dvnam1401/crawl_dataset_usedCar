import { join } from 'path';

export interface CrawlerConfig {
  workers: number;
  maxRetries: number;
  requestDelay: number;
  pageTimeout: number;
  headless: boolean;
  directories: {
    data: string;
    vehicles: string;
    logs: string;
  };
  files: {
    categories: string;
    subcategories: string;
    queue: string;
    visitedIds: string;
    repairQueue: string;
    integrityReport: string;
  };
}

const dataDir = join(__dirname, '../../data');
const logsDir = join(__dirname, '../../logs');

export const getCrawlerConfig = (): CrawlerConfig => ({
  workers: parseInt(process.env.WORKERS || '3', 10),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
  requestDelay: parseInt(process.env.REQUEST_DELAY || '1500', 10),
  pageTimeout: parseInt(process.env.PAGE_TIMEOUT || '30000', 10),
  headless: process.env.HEADLESS !== 'false',
  directories: {
    data: dataDir,
    vehicles: join(dataDir, 'vehicles'),
    logs: logsDir
  },
  files: {
    categories: join(dataDir, 'categories.json'),
    subcategories: join(dataDir, 'subcategories.json'),
    queue: join(dataDir, 'subcategory_queue.json'),
    visitedIds: join(dataDir, 'visited_ids.json'),
    repairQueue: join(dataDir, 'repair_queue.json'),
    integrityReport: join(logsDir, 'integrity_report.json')
  }
});
