import { $ } from "bun";
import { createClient, RedisClientType } from 'redis';

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class PPPoEManager {
  // Iniciar accel-ppp
  static async start() {
    await ensureRedisConnected();
    try {
      // Verificar si accel-ppp está instalado
      await $`which accel-pppd`.quiet();
      console.log('  ✓ accel-ppp ya instalado');
    } catch {
      console.log('  ⚠️  accel-ppp no instalado. Se requiere instalar manualmente en producción.');
      return;
    }
    
    try {
      // Copiar configuración
      await $`cp /home/river/TRABAJO/smart-router-monolith/config/accel-ppp.conf /etc/accel-ppp.conf`.quiet();
      
      // Iniciar daemon
      await $`accel-pppd -c /etc/accel-ppp.conf -d`.quiet();
      console.log('  ✓ accel-ppp iniciado en eth0.20');
    } catch (error: any) {
      console.log('  ⚠️  Error iniciando accel-ppp:', error.message);
    }
  }
  
  // Crear sesión PPPoE (asignar usuario)
  static async createSession(user: string, password: string, plan: string): Promise<string> {
    await ensureRedisConnected();
    const sessionId = Math.random().toString(36).substring(2, 10);
    const now = Date.now();
    
    const session = {
      id: sessionId,
      type: 'pppoe',
      user: user,
      password: password,
      plan: plan,
      ip: '',
      created_at: now.toString(),
      status: 'active',
    };
    
    await redis.hSet(`pppoe:${sessionId}`, session);
    await redis.sAdd('pppoe_sessions', sessionId);
    
    console.log(`✅ Sesión PPPoE creada: ${sessionId} para ${user} (${plan})`);
    return sessionId;
  }
  
  // Desconectar sesión
  static async disconnectSession(sessionId: string) {
    await ensureRedisConnected();
    try {
      await $`nft delete element inet pppoe active_clients { ${sessionId} }`.quiet();
      await redis.hSet(`pppoe:${sessionId}`, { status: 'disconnected' });
      console.log(`⏹️  Sesión ${sessionId} desconectada`);
    } catch (error: any) {
      console.error('Error desconectando sesión:', error.message);
    }
  }
  
  // Obtener todas las sesiones
  static async getAllSessions() {
    await ensureRedisConnected();
    const sessionIds = await redis.sMembers('pppoe_sessions');
    const sessions = [];
    for (const id of sessionIds) {
      const session = await redis.hGetAll(`pppoe:${id}`);
      if (session) sessions.push(session);
    }
    return sessions;
  }
  
  // Obtener cantidad de sesiones activas
  static async getActiveCount(): Promise<number> {
    await ensureRedisConnected();
    return await redis.sCard('pppoe_sessions');
  }
  
  // Verificar sesiones activas
  static async checkActiveSessions() {
    await ensureRedisConnected();
    try {
      const sessions = await redis.sMembers('pppoe_sessions');
      console.log(`📡 PPPoE sesiones activas: ${sessions.length}`);
    } catch (error: any) {
      console.error('Error verificando sesiones PPPoE:', error.message);
    }
  }

  // Detener PPPoE
  static async stop() {
    console.log('⏹️  Deteniendo PPPoE...');
    try {
      await $`pkill accel-pppd`.quiet();
    } catch {}
  }
}
