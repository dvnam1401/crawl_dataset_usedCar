import { getCrawlerConfig } from '../config/crawler.config';
import { Worker } from './worker';
import { logger } from '../utils/logger';

export class WorkerPool {
  private config = getCrawlerConfig();

  public async startPool(): Promise<void> {
    const workerCount = this.config.workers;
    logger.info(`Starting Worker Pool with ${workerCount} workers...`);
    
    // Khởi tạo n workers chạy song song
    const workers = Array.from({ length: workerCount }).map((_, i) => new Worker((i + 1).toString()));
    
    // P-Limit có thể dùng để enqueue các promises song song, nhưng ở đây array Promise.all là đủ
    // vì Worker đã tự động vòng lặp (loop pick task) liên kết với Queue Manager
    const workerPromises = workers.map(w => w.start());
    
    try {
      await Promise.all(workerPromises);
      logger.success('All workers finished safely.');
    } catch (error) {
      logger.error('Worker pool crashed critically', error);
      process.exit(1);
    }
  }
}

export const workerPool = new WorkerPool();
