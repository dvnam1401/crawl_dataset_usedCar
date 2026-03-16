import fs from 'fs-extra';
import { join } from 'path';

const logsDir = join(__dirname, '../../logs');
fs.ensureDirSync(logsDir);

const logFile = join(logsDir, 'crawler.log');
const errorFile = join(logsDir, 'error.log');

export const logger = {
  info: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message} ${meta ? JSON.stringify(meta) : ''}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
  },
  
  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    const errMessage = error instanceof Error ? error.message : JSON.stringify(error);
    const errStack = error instanceof Error ? error.stack : '';
    const logMessage = `[${timestamp}] [ERROR] ${message} ${errMessage}`;
    
    console.error(logMessage);
    if (errStack) console.error(errStack);
    
    fs.appendFileSync(errorFile, `${logMessage}\n${errStack}\n`);
    fs.appendFileSync(logFile, logMessage + '\n');
  },
  
  warn: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WARN] ${message} ${meta ? JSON.stringify(meta) : ''}`;
    console.warn(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
  },
  
  success: (message: string, meta?: any) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [SUCCESS] ${message} ${meta ? JSON.stringify(meta) : ''}`;
    console.log(`\x1b[32m${logMessage}\x1b[0m`); // Green color
    fs.appendFileSync(logFile, logMessage + '\n');
  }
};
