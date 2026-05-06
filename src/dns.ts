import { $ } from "bun";
import { createClient, RedisClientType } from 'redis';

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class DNSManager {
  // Iniciar Unbound
  static async start() {
    await ensureRedisConnected();
    try {
      await $`which unbound`.quiet();
      console.log('  ✓ Unbound ya instalado');
    } catch {
      console.log('  ⚠️  Unbound no instalado. Se requiere instalar manualmente en producción.');
      return;
    }
    
    try {
      // Copiar configuración
      await $`cp /home/river/TRABAJO/smart-router-monolith/config/unbound.conf /etc/unbound/unbound.conf`.quiet();
      
      // Iniciar servicio
      await $`unbound -c /etc/unbound/unbound.conf`.quiet();
      console.log('  ✓ Unbound iniciado');
    } catch (error: any) {
      console.log('  ⚠️  Error iniciando Unbound:', error.message);
    }
  }
  
  // Actualizar listas negras
  static async updateBlacklists() {
    console.log('  ⏳  Actualizando listas negras...');
    try {
      const blacklistUrl = 'https://someonewhocares.org/hosts/hosts';
      const response = await fetch(blacklistUrl);
      const text = await response.text();
      
      const domains = text
        .split('\n')
        .filter(line => line.includes('127.0.0.1') && !line.startsWith('#'))
        .map(line => line.split(/\s+/)[1])
        .filter(domain => domain && !domain.includes('localhost'));
      
      // Escribir a configuración Unbound
      let config = 'server:\n';
      for (const domain of domains.slice(0, 1000)) {
        config += `  local-zone: "${domain}" redirect\n`;
        config += `  local-data: "${domain} A 127.0.0.1"\n`;
      }
      
      await Bun.write('/etc/unbound/blacklists.conf', config);
      await $`unbound-control reload`.quiet();
      console.log(`  ✓ ${domains.length} dominios bloqueados`);
    } catch (error: any) {
      console.log('  ⚠️  Error actualizando listas:', error.message);
    }
  }
  
  // Verificar si dominio está bloqueado
  static async isDomainBlocked(domain: string): Promise<boolean> {
    await ensureRedisConnected();
    return await redis.sIsMember('dns:blacklist', domain);
  }
  
  // Detener DNS
  static async stop() {
    console.log('⏹️  Deteniendo DNS...');
    try {
      await $`pkill unbound`.quiet();
    } catch {}
  }
}
