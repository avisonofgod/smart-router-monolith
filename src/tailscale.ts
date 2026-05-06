import { $ } from "bun";
import { createClient, RedisClientType } from 'redis';

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class TailscaleManager {
  // Iniciar Tailscale
  static async start() {
    await ensureRedisConnected();
    try {
      await $`which tailscale`.quiet();
      console.log('  ✓ Tailscale ya instalado');
    } catch {
      console.log('  ⚠️  Tailscale no instalado. Se requiere instalar manualmente en producción.');
      return;
    }
    
    try {
      await $`tailscale up --advertise-routes=192.168.10.0/24,192.168.20.0/24,10.99.0.0/24`.quiet();
      console.log('  ✓ Tailscale iniciado');
    } catch (error: any) {
      console.log('  ⚠️  Error iniciando Tailscale:', error.message);
    }
  }
  
  // Obtener IP de Tailscale
  static async getTailscaleIP(): Promise<string> {
    try {
      const result = await $`tailscale ip -4`.quiet();
      return result.text().trim();
    } catch {
      return '';
    }
  }
  
  // Obtener estado
  static async getStatus(): Promise<string> {
    try {
      const result = await $`tailscale status`.quiet();
      return result.text();
    } catch {
      return 'Tailscale no disponible';
    }
  }
  
  // Detener Tailscale
  static async stop() {
    console.log('⏹️  Deteniendo Tailscale...');
    try {
      await $`tailscale down`.quiet();
    } catch {}
  }
}
