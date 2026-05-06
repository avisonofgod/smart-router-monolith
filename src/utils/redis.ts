import { createClient, RedisClientType } from 'redis';

// Singleton Redis connection
let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
    if (!redisClient) {
        redisClient = createClient({ url: 'redis://localhost:6379' });
        await redisClient.connect();
        
        redisClient.on('error', (err) => {
            console.error('Redis error:', err);
        });
    }
    return redisClient;
}

// Helper: Get ticket with type safety
export async function getTicket(ticketId: string): Promise<Record<string, string> | null> {
    const redis = await getRedisClient();
    const data = await redis.hGetAll(`ticket:${ticketId}`);
    return Object.keys(data).length > 0 ? data : null;
}

// Helper: Update ticket
export async function updateTicket(ticketId: string, fields: Record<string, string>): Promise<void> {
    const redis = await getRedisClient();
    await redis.hSet(`ticket:${ticketId}`, fields);
}

// Helper: Check if client is online
export async function isClientOnline(username: string): Promise<boolean> {
    const redis = await getRedisClient();
    return await redis.sIsMember('hs:online', username);
}

// Helper: Get remaining time in seconds
export async function getRemainingTime(ticketId: string): Promise<number> {
    const redis = await getRedisClient();
    const ttl = await redis.ttl(`shadow:${ticketId}`);
    return ttl > 0 ? ttl : 0;
}

// Helper: Set key with TTL
export async function setWithTTL(key: string, value: string, ttlSeconds: number): Promise<void> {
    const redis = await getRedisClient();
    await redis.set(key, value, { PX: ttlSeconds * 1000 });
}

// Helper: Add to set
export async function addToSet(key: string, member: string): Promise<void> {
    const redis = await getRedisClient();
    await redis.sAdd(key, member);
}

// Helper: Remove from set
export async function removeFromSet(key: string, member: string): Promise<void> {
    const redis = await getRedisClient();
    await redis.sRem(key, member);
}

// Close connection (for graceful shutdown)
export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
}
