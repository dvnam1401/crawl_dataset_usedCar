import { getCrawlerConfig } from '../config/crawler.config';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
];

export const getRandomUserAgent = (): string => {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
};

export const getRandomDelay = (baseDelayMs?: number): number => {
  const config = getCrawlerConfig();
  const base = baseDelayMs || config.requestDelay;
  
  // Random delay between 0.8x and 1.5x of base delay
  const min = base * 0.8;
  const max = base * 1.5;
  
  return Math.floor(Math.random() * (max - min) + min);
};

export const randomSleep = async (baseDelayMs?: number): Promise<void> => {
  const delayMs = getRandomDelay(baseDelayMs);
  return new Promise(resolve => setTimeout(resolve, delayMs));
};
