import { createClient, RedisClientType } from 'redis';
import { $ } from "bun";

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class SystemMonitor {
  private static instance: SystemMonitor;
  private isRunning: boolean = false;
  private intervalId: Timer | null = null;

  static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  async start(intervalMs: number = 30000) {
    await ensureRedisConnected();
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`🔍 System Monitor iniciado (cada ${intervalMs/1000}s)`);

    this.intervalId = setInterval(async () => {
      try {
        await this.collectLogs();
        await this.detectFailures();
        await this.updateSystemHealth();
      } catch (error) {
        console.error('Error en System Monitor:', error);
      }
    }, intervalMs);
  }

  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('⏹️ System Monitor detenido');
  }

  private async collectLogs() {
    const timestamp = Date.now();
    const logs: any = {
      timestamp,
      components: {}
    };

    // 1. Verificar eBPF en interfaces WAN
    try {
      const ebpf1 = await $`bpftool net show dev eth1 2>&1`.quiet();
      const ebpf2 = await $`bpftool net show dev eth2 2>&1`.quiet();
      logs.components.ebpf = {
        eth1: ebpf1.text().includes('xdp'),
        eth2: ebpf2.text().includes('xdp'),
        raw: ebpf1.text() + ebpf2.text()
      };
    } catch (error: any) {
      logs.components.ebpf = { error: error.message };
    }

    // 2. Verificar nftables
    try {
      const nft = await $`nft list tables 2>&1`.quiet();
      const tables = nft.text().split('\n').filter(l => l.includes('table'));
      logs.components.nftables = {
        active: tables.length > 0,
        tables: tables,
        hotspot: tables.some(t => t.includes('hotspot')),
        pppoe: tables.some(t => t.includes('pppoe')),
        management: tables.some(t => t.includes('management'))
      };
    } catch (error: any) {
      logs.components.nftables = { error: error.message };
    }

    // 3. Verificar accel-ppp
    try {
      const accel = await $`systemctl is-active accel-ppp 2>&1 || pgrep accel-pppd 2>&1`.quiet();
      logs.components.accel_ppp = {
        running: accel.text().includes('active') || accel.text().length > 0,
        raw: accel.text()
      };
    } catch (error: any) {
      logs.components.accel_ppp = { error: error.message };
    }

    // 4. Verificar Unbound DNS
    try {
      const unbound = await $`systemctl is-active unbound 2>&1 || pgrep unbound 2>&1`.quiet();
      logs.components.unbound = {
        running: unbound.text().includes('active') || unbound.text().length > 0,
        raw: unbound.text()
      };
    } catch (error: any) {
      logs.components.unbound = { error: error.message };
    }

    // 5. Verificar Tailscale
    try {
      const tailscale = await $`tailscale status 2>&1`.quiet();
      logs.components.tailscale = {
        running: !tailscale.text().includes('not') && !tailscale.text().includes('stopped'),
        raw: tailscale.text()
      };
    } catch (error: any) {
      logs.components.tailscale = { error: error.message };
    }

    // 6. Verificar interfaces y WANs
    try {
      const ipaddr = await $`ip addr show 2>&1`.quiet();
      const iproute = await $`ip route show default 2>&1`.quiet();
      logs.components.network = {
        interfaces: ipaddr.text(),
        default_route: iproute.text()
      };
    } catch (error: any) {
      logs.components.network = { error: error.message };
    }

    // 7. Verificar Redis
    try {
      await ensureRedisConnected();
      await redis.ping();
      const info = await redis.info('server');
      logs.components.redis = {
        running: true,
        info: info
      };
    } catch (error: any) {
      logs.components.redis = { running: false, error: error.message };
    }

    // Guardar log en Redis
    await redis.set(`logs:system:${timestamp}`, JSON.stringify(logs), { EX: 86400 }); // Keep 24h
    await redis.lPush('logs:system:recent', `logs:system:${timestamp}`);
    await redis.lTrim('logs:system:recent', 0, 99); // Keep last 100
  }

  private async detectFailures() {
    const failures: any[] = [];

    // Verificar eBPF
    const ebpfLog = await redis.lIndex('logs:system:recent', 0);
    if (ebpfLog) {
      const log = JSON.parse(await redis.get(ebpfLog) || '{}');
      if (log.components?.ebpf?.eth1 === false) {
        failures.push({ component: 'eBPF', issue: 'XDP no cargado en eth1', severity: 'high' });
      }
      if (log.components?.ebpf?.eth2 === false) {
        failures.push({ component: 'eBPF', issue: 'XDP no cargado en eth2', severity: 'high' });
      }
    }

    // Verificar nftables
    const nftablesLog = await redis.lIndex('logs:system:recent', 0);
    if (nftablesLog) {
      const log = JSON.parse(await redis.get(nftablesLog) || '{}');
      if (log.components?.nftables?.hotspot === false) {
        failures.push({ component: 'nftables', issue: 'Tabla hotspot no encontrada', severity: 'medium' });
      }
      if (log.components?.nftables?.pppoe === false) {
        failures.push({ component: 'nftables', issue: 'Tabla pppoe no encontrada', severity: 'medium' });
      }
    }

    // Verificar servicios críticos
    const services = ['accel_ppp', 'unbound', 'tailscale', 'redis'];
    for (const svc of services) {
      const key = `logs:system:recent`;
      const logKey = await redis.lIndex(key, 0);
      if (logKey) {
        const log = JSON.parse(await redis.get(logKey) || '{}');
        const component = log.components?.[svc];
        if (component && component.running === false) {
          failures.push({ component: svc, issue: 'Servicio no está corriendo', severity: 'high' });
        }
      }
    }

    // Guardar fallas detectadas
    if (failures.length > 0) {
      const timestamp = Date.now();
      await redis.set(`failures:${timestamp}`, JSON.stringify({
        timestamp,
        failures,
        count: failures.length
      }), { EX: 604800 }); // Keep 7 days

      await redis.lPush('failures:recent', `failures:${timestamp}`);
      await redis.lTrim('failures:recent', 0, 49); // Keep last 50

      console.log(`⚠️  ${failures.length} falla(s) detectada(s):`);
      failures.forEach(f => {
        console.log(`   [${f.severity.toUpperCase()}] ${f.component}: ${f.issue}`);
      });
    }
  }

  private async updateSystemHealth() {
    const recentLogs = await redis.lRange('logs:system:recent', 0, 9);
    let healthyCount = 0;
    let totalCount = 0;

    for (const logKey of recentLogs) {
      const log = JSON.parse(await redis.get(logKey) || '{}');
      const components = log.components || {};

      for (const [name, data] of Object.entries(components)) {
        totalCount++;
        if (data && typeof data === 'object' && 'running' in data && data.running === true) {
          healthyCount++;
        } else if (data && typeof data === 'object' && 'active' in data && data.active === true) {
          healthyCount++;
        }
      }
    }

    const healthScore = totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 0;

    await redis.hSet('system:health', {
      score: healthScore.toString(),
      last_update: Date.now().toString(),
      healthy: healthyCount.toString(),
      total: totalCount.toString()
    });
  }

  static async getRecentLogs(count: number = 10) {
    await ensureRedisConnected();
    const keys = await redis.lRange('logs:system:recent', 0, count - 1);
    const logs = [];
    for (const key of keys) {
      const log = await redis.get(key);
      if (log) logs.push(JSON.parse(log));
    }
    return logs;
  }

  static async getRecentFailures(count: number = 10) {
    await ensureRedisConnected();
    const keys = await redis.lRange('failures:recent', 0, count - 1);
    const failures = [];
    for (const key of keys) {
      const failure = await redis.get(key);
      if (failure) failures.push(JSON.parse(failure));
    }
    return failures;
  }

  static async getSystemHealth() {
    await ensureRedisConnected();
    return await redis.hGetAll('system:health');
  }
}
