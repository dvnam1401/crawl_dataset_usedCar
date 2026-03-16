import { logger } from './logger';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  operationName: string
): Promise<T> {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      
      if (attempt >= maxRetries) {
        logger.error(`Failed ${operationName} after ${maxRetries} attempts`, error);
        throw error;
      }
      
      // Exponential backoff: baseDelay, then baseDelay * 2, then baseDelay * 4...
      // Or in this specific case based on requirement: 1s -> 3s -> 5s
      let delayMs = baseDelayMs;
      if (attempt === 1) delayMs = 1000;
      else if (attempt === 2) delayMs = 3000;
      else delayMs = 5000;
      
      logger.warn(`Attempt ${attempt}/${maxRetries} failed for ${operationName}. Retrying in ${delayMs}ms...`, { error: (error as Error).message });
      await delay(delayMs);
    }
  }
  
  throw new Error(`Unreachable - max retries exceeded for ${operationName}`);
}
