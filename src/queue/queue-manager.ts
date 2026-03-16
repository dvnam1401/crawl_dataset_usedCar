import fs from 'fs-extra';
import crypto from 'crypto';
import { getCrawlerConfig } from '../config/crawler.config';
import { SubcategoryTask, Subcategory } from '../types/types';
import { logger } from '../utils/logger';

export class QueueManager {
  private config = getCrawlerConfig();
  private queue: SubcategoryTask[] = [];

  constructor() {
    this.loadQueue();
  }

  private loadQueue(): void {
    try {
      if (fs.existsSync(this.config.files.queue)) {
        this.queue = fs.readJsonSync(this.config.files.queue);
        logger.info(`Loaded queue with ${this.queue.length} tasks`);
        
        const now = Date.now();
        let changed = false;

        this.queue.forEach(task => {
          if (task.status === 'processing') {
            // Check lock expiration (10 minutes)
            if (task.lock_expire && task.lock_expire < now) {
               logger.warn(`Task ${task.task_id} lock expired. Reclaiming...`);
               task.status = 'pending';
               task.locked_by = null;
               task.lock_expire = null;
               changed = true;
            } else if (!task.lock_expire) {
               // Legacy stuck tasks without lock_expire
               task.status = 'pending';
               task.locked_by = null;
               changed = true;
            }
          }
        });
        
        if (changed) {
          logger.info('Reset expired or zombie tasks from previous run');
          this.saveQueue();
        }
      } else {
        this.queue = [];
      }
    } catch (error) {
      logger.error('Failed to load queue', error);
      this.queue = [];
    }
  }

  private saveQueue(): void {
    try {
      fs.ensureDirSync(this.config.directories.data);
      fs.writeJsonSync(this.config.files.queue, this.queue, { spaces: 2 });
    } catch (error) {
      logger.error('Failed to save queue', error);
    }
  }

  private generateUrlHash(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  public addTasks(subcategories: Subcategory[]): void {
    let addedCount = 0;
    
    for (const sub of subcategories) {
      const urlHash = this.generateUrlHash(sub.url);
      
      // Deduplication check: skip if hash already exists in queue
      if (this.queue.some(t => t.url_hash === urlHash)) {
         continue;
      }
      
      const newTask: SubcategoryTask = {
        task_id: `task_${sub.subcategory_id}`,
        subcategory_id: sub.subcategory_id,
        category_id: sub.category_id,
        subcategory: sub.name,
        url: sub.url,
        url_hash: urlHash,
        current_page: 1,
        last_page_completed: 0,
        status: 'pending',
        locked_by: null,
        lock_expire: null,
        last_updated: new Date().toISOString()
      };
      
      this.queue.push(newTask);
      addedCount++;
    }

    if (addedCount > 0) {
       this.saveQueue();
       logger.success(`Added ${addedCount} new tasks to queue (skipped ${subcategories.length - addedCount} duplicates)`);
    } else {
       logger.info(`No new tasks added. All ${subcategories.length} subcategories already exist in queue.`);
    }
  }

  public getNextTask(workerId: string): SubcategoryTask | null {
    const taskIndex = this.queue.findIndex(t => t.status === 'pending');
    
    if (taskIndex === -1) {
      return null; // No pending tasks
    }
    
    const task = this.queue[taskIndex];
    task.status = 'processing';
    task.locked_by = workerId;
    task.lock_expire = Date.now() + 10 * 60 * 1000; // 10 minutes from now
    task.last_updated = new Date().toISOString();
    
    this.saveQueue();
    return task;
  }

  /**
   * Update page progress. This sets both current_page to the target
   * and last_page_completed to the page that was just successfully completely scraped.
   */
  public updatePageProgress(taskId: string, completedPage: number): void {
    const task = this.queue.find(t => t.task_id === taskId);
    if (task) {
      task.last_page_completed = completedPage;
      task.current_page = completedPage + 1; // move to next page
      task.lock_expire = Date.now() + 10 * 60 * 1000; // extend lock
      task.last_updated = new Date().toISOString();
      this.saveQueue();
      logger.info(`Updated queue progress: ${task.task_id} -> completed page ${completedPage}, moving to ${task.current_page}`);
    }
  }

  public completeTask(taskId: string): void {
    const task = this.queue.find(t => t.task_id === taskId);
    if (task) {
      task.status = 'completed';
      task.locked_by = null;
      task.lock_expire = null;
      task.last_updated = new Date().toISOString();
      this.saveQueue();
      logger.success(`Completed task: ${task.task_id} (sub_id: ${task.subcategory_id}, cat_id: ${task.category_id})`);
    }
  }

  public failTask(taskId: string): void {
    const task = this.queue.find(t => t.task_id === taskId);
    if (task) {
      task.status = 'failed';
      task.locked_by = null;
      task.lock_expire = null;
      task.last_updated = new Date().toISOString();
      this.saveQueue();
      logger.error(`Failed task: ${task.task_id} (sub_id: ${task.subcategory_id}, cat_id: ${task.category_id})`);
    }
  }

  public getPendingCount(): number {
    return this.queue.filter(t => t.status === 'pending').length;
  }
}

export const queueManager = new QueueManager();
