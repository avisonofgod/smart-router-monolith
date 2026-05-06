import { NetworkManager } from './network';
import { HotspotManager } from './hotspot';
import { PPPoEManager } from './pppoe';
import { TailscaleManager } from './tailscale';
import { DNSManager } from './dns';
import { DashboardServer } from './dashboard';
import { SystemMonitor } from './utils/monitor';
import { createClient, RedisClientType } from 'redis';

// Conexión a Redis
const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

// Estado global
let isRunning = false;

async function initialize() {
  console.log('🚀 SmartRouter Monolith v1.0 Iniciando...');
  
  try {
    // 1. Conectar Redis
    await ensureRedisConnected();
    console.log('✅ Redis conectado');
    
    // 2. Inicializar VLANs
    await NetworkManager.initVLANs();
    console.log('✅ VLANs 10, 20, 99 configuradas');
    
    // 3. Configurar NAT y forwarding
    await NetworkManager.setupNAT();
    console.log('✅ NAT y forwarding configurados');
    
    // 4. Cargar eBPF para balanceo WAN
    await NetworkManager.loadEBPF();
    console.log('✅ eBPF cargado para balanceo WAN');
    
    // 5. Configurar nftables
    await NetworkManager.loadNftablesRules();
    console.log('✅ nftables configurado');
    
    // 6. Iniciar accel-ppp para PPPoE
    await PPPoEManager.start();
    console.log('✅ PPPoE (accel-ppp) iniciado');
    
    // 7. Iniciar Unbound para DNS
    await DNSManager.start();
    console.log('✅ Unbound DNS iniciado');
    
    // 8. Iniciar Tailscale
    await TailscaleManager.start();
    console.log('✅ Tailscale iniciado');
    
    // 9. Iniciar Portal Cautivo Hotspot
    await HotspotManager.start();
    console.log('✅ Portal Hotspot iniciado');
    
    // 10. Iniciar Dashboard API
    await DashboardServer.start();
    console.log('✅ Dashboard API en puerto 3000');
    
    // 11. Iniciar System Monitor
    try {
      const monitor = SystemMonitor.getInstance();
      await monitor.start(30000); // Cada 30 segundos
      console.log('✅ System Monitor iniciado');
    } catch (error) {
      console.error('❌ Error iniciando System Monitor:', error);
    }
    
    isRunning = true;
    console.log('🎉 SmartRouter Monolith Operativo');
    
    // 12. Loop de monitoreo
    startMonitoring();
    
  } catch (error) {
    console.error('❌ Error durante inicialización:', error);
    process.exit(1);
  }
}

function startMonitoring() {
  // Monitoreo cada 5 segundos
  setInterval(async () => {
    if (!isRunning) return;
    
    try {
      // Check WAN health
      await NetworkManager.checkWANHealth();
      
      // Check expired hotspot tickets
      await HotspotManager.checkExpiredTickets();
      
      // Check active PPPoE sessions
      await PPPoEManager.checkActiveSessions();
      
      // Session checker for hotspot clients
      await HotspotManager.sessionChecker();
      
      // Update metrics in Redis
      await updateMetrics();
      
    } catch (error) {
      console.error('Error en monitoreo:', error);
    }
  }, 5000);
  
  // Health check cada 30 segundos
  setInterval(async () => {
    if (!isRunning) return;
    
    const stats = {
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
    
    await redis.set('metrics:system', JSON.stringify(stats));
  }, 30000);
}

async function updateMetrics() {
  try {
    const wan1Status = await NetworkManager.getWANStatus('eth1');
    const wan2Status = await NetworkManager.getWANStatus('eth2');
    
    await redis.hSet('metrics:wan', {
      wan1_latency: wan1Status.latency || 0,
      wan1_status: wan1Status.online ? 'online' : 'offline',
      wan2_latency: wan2Status.latency || 0,
      wan2_status: wan2Status.online ? 'online' : 'offline',
    });
    
    const hotspotCount = await HotspotManager.getActiveCount();
    const pppoeCount = await PPPoEManager.getActiveCount();
    
    await redis.hSet('metrics:clients', {
      hotspot: hotspotCount,
      pppoe: pppoeCount,
      total: hotspotCount + pppoeCount,
    });
    
  } catch (error) {
    console.error('Error actualizando métricas:', error);
  }
}

// Manejo de señales para cierre limpio
process.on('SIGINT', async () => {
  console.log('\n⏹️  Cerrando SmartRouter...');
  isRunning = false;
  
  try {
    const monitor = SystemMonitor.getInstance();
    await monitor.stop();
  } catch (error) {
    console.error('Error deteniendo System Monitor:', error);
  }
  
  await HotspotManager.stop();
  await PPPoEManager.stop();
  await DNSManager.stop();
  await TailscaleManager.stop();
  
  if (redis.isOpen) {
    await redis.quit();
  }
  console.log('✅ SmartRouter cerrado correctamente');
  process.exit(0);
});

// Iniciar
initialize();
