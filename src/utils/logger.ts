export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

class Logger {
    private level: LogLevel = LogLevel.INFO;
    
    setLevel(level: LogLevel) {
        this.level = level;
    }
    
    debug(module: string, message: string, data?: any): void {
        if (this.level <= LogLevel.DEBUG) {
            console.log(`🔍 [DEBUG] [${module}] ${message}`, data || '');
        }
    }
    
    info(module: string, message: string, data?: any): void {
        if (this.level <= LogLevel.INFO) {
            console.log(`ℹ️  [INFO] [${module}] ${message}`, data || '');
        }
    }
    
    warn(module: string, message: string, data?: any): void {
        if (this.level <= LogLevel.WARN) {
            console.log(`⚠️  [WARN] [${module}] ${message}`, data || '');
        }
    }
    
    error(module: string, message: string, error?: any): void {
        if (this.level <= LogLevel.ERROR) {
            console.error(`❌ [ERROR] [${module}] ${message}`, error || '');
        }
    }
}

export const logger = new Logger();

// Helper to parse error stack
export function formatError(error: any): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}\n${error.stack || ''}`;
    }
    return String(error);
}

// Log to Redis for persistent logs
export async function logToRedis(module: string, level: LogLevel, message: string): Promise<void> {
    try {
        const { createClient } = await import('redis');
        const redis = createClient({ url: 'redis://localhost:6379' });
        await redis.connect();
        
        const logEntry = JSON.stringify({
            timestamp: Date.now(),
            module,
            level: LogLevel[level],
            message
        });
        
        await redis.lPush('hotspot:logs', logEntry);
        await redis.lTrim('hotspot:logs', 0, 199); // Keep last 200 logs
        
        await redis.quit();
    } catch {
        // Silently fail - don't crash on log errors
    }
}
