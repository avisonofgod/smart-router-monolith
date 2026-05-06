#!/usr/bin/env bun
/**
 * Test Suite Completo para SmartRouter Monolith
 * Verifica: WAN balance, eBPF, tickets, shaper, PPPoE, DNS
 */

import { $ } from "bun";
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

console.log("🧪 SMARTROUTER MONOLITH — TEST SUITE");
console.log("================================================");
console.log("");

let passed = 0;
let failed = 0;

function logTest(name: string, passed: boolean, detail: string = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${name}${detail ? ` (${detail})` : ''}`);
  if (passed) passed++; else failed++;
}

// =============================================
// TEST 1: Verificar entorno de desarrollo
// =============================================
console.log("📡 TEST 1: Entorno de Desarrollo");
console.log("─────────────────────────────────────────────");

try {
  // Verificar veth pairs
  const ipLink = await $`ip link show`.text();
  
  logTest("wan1-modem existe", ipLink.includes('wan1-modem'), 'veth WAN1');
  logTest("wan2-modem existe", ipLink.includes('wan2-modem'), 'veth WAN2');
  logTest("lan-client existe", ipLink.includes('lan-client'), 'veth LAN');
  
  // Verificar bridges
  logTest("br-hotspot existe", ipLink.includes('br-hotspot'), 'Bridge Hotspot');
  logTest("br-pppoe existe", ipLink.includes('br-pppoe'), 'Bridge PPPoE');
  logTest("br-mgmt existe", ipLink.includes('br-mgmt'), 'Bridge Gestión');
  
  // Verificar IPs
  const ipAddr = await $`ip addr show`.text();
  logTest("wan1-router IP (10.1.1.2)", ipAddr.includes('10.1.1.2'), 'WAN1 router side');
  logTest("wan2-router IP (10.2.2.2)", ipAddr.includes('10.2.2.2'), 'WAN2 router side');
  logTest("br-hotspot IP (192.168.10.1)", ipAddr.includes('192.168.10.1'), 'Hotspot bridge');
  
  console.log("");
} catch (error: any) {
  logTest("Entorno de desarrollo", false, error.message);
  console.log("");
}

// =============================================
// TEST 2: Verificar Redis
// =============================================
console.log("📡 TEST 2: Redis Connection & Keys");
console.log("─────────────────────────────────────────────");

try {
  await redis.ping();
  logTest("Redis responde PING", true, 'localhost:6379');
  
  // Crear clave de prueba
  await redis.set('test:key', 'SmartRouterTest');
  const val = await redis.get('test:key');
  logTest("Redis lectura/escritura", val === 'SmartRouterTest', 'read/write');
  await redis.del('test:key');
  
  // Verificar comandos de ticket
  await redis.hSet('test:ticket:123', {
    id: '123',
    profile: 'pausado',
    status: 'active',
    remaining_ms: '3600000',
  });
  const ticket = await redis.hGetAll('test:ticket:123');
  logTest("Redis Hash (ticket)", ticket.id === '123', 'ticket:123');
  await redis.del('test:ticket:123');
  
  console.log("");
} catch (error: any) {
  logTest("Redis connection", false, error.message);
  console.log("");
}

// =============================================
// TEST 3: Verificar eBPF XDP
// =============================================
console.log("📡 TEST 3: eBPF XDP Program");
console.log("─────────────────────────────────────────────");

try {
  // Verificar si el programa está cargado
  const bpftool = await $`sudo bpftool prog list`.text().catch(() => '');
  logTest("bpftool disponible", bpftool.length > 0, 'bpftool installed');
  
  if (bpftool.includes('xdp_wan_balance')) {
    logTest("eBPF XDP cargado", true, 'xdp_wan_balance');
  } else {
    logTest("eBPF XDP cargado", false, 'run: sudo bpftool prog load router_kern.o xdp_wan_balance');
  }
  
  // Verificar interfaces con XDP
  const ipLink = await $`ip link show`.text();
  logTest("wan1-router con XDP", ipLink.includes('xdp'), 'XDP attached');
  
  console.log("");
} catch (error: any) {
  logTest("eBPF XDP", false, error.message);
  console.log("");
}

// =============================================
// TEST 4: Verificar nftables
// =============================================
console.log("📡 TEST 4: nftables Rules");
console.log("─────────────────────────────────────────────");

try {
  const nftList = await $`sudo nft list tables`.text().catch(() => '');
  
  logTest("Tabla hotspot", nftList.includes('hotspot'), 'inet hotspot');
  logTest("Tabla pppoe", nftList.includes('pppoe'), 'inet pppoe');
  logTest("Tabla management", nftList.includes('management'), 'inet management');
  
  // Verificar sets
  const sets = await $`sudo nft list sets`.text().catch(() => '');
  logTest("Set active_clients (hotspot)", sets.includes('active_clients'), 'hotspot set');
  logTest("Set whitelist (mgmt)", sets.includes('whitelist'), 'mgmt set');
  
  console.log("");
} catch (error: any) {
  logTest("nftables", false, error.message);
  console.log("");
}

// =============================================
// TEST 5: Tickets Hotspot (Pausado vs Corrido)
// =============================================
console.log("📡 TEST 5: Hotspot Tickets (Pausado vs Corrido)");
console.log("─────────────────────────────────────────────");

try {
  const now = Date.now();
  
  // 5.1 Crear ticket Pausado
  await redis.hSet('test:ticket:pausado', {
    id: 'pausado1',
    profile: 'pausado',
    status: 'active',
    remaining_ms: '3600000',
    paused: 'false',
  });
  const pausado = await redis.hGetAll('test:ticket:pausado');
  logTest("Ticket Pausado creado", pausado.profile === 'pausado', 'profile=pausado');
  
  // 5.2 Crear ticket Corrido
  await redis.hSet('test:ticket:corrido', {
    id: 'corrido1',
    profile: 'corrido',
    status: 'active',
    start_time: now.toString(),
    expires_at: (now + 86400000).toString(),
  });
  const corrido = await redis.hGetAll('test:ticket:corrido');
  logTest("Ticket Corrido creado", corrido.profile === 'corrido', 'profile=corrido');
  
  // 5.3 Verificar shadow keys
  await redis.set('test:shadow:pausado', '1', { PX: 3600 });
  const ttl = await redis.ttl('test:shadow:pausado');
  logTest("Shadow key (TTL)", ttl > 0 && ttl <= 3600, `TTL=${ttl}s`);
  
  // Limpiar
  await redis.del('test:ticket:pausado');
  await redis.del('test:ticket:corrido');
  await redis.del('test:shadow:pausado');
  
  console.log("");
} catch (error: any) {
  logTest("Hotspot tickets", false, error.message);
  console.log("");
}

// =============================================
// TEST 6: Traffic Shaping (tc htb)
// =============================================
console.log("📡 TEST 6: Traffic Shaping (tc htb)");
console.log("─────────────────────────────────────────────");

try {
  // Verificar si tc está disponible
  const tcVersion = await $`tc -V`.text().catch(() => '');
  logTest("tc (iproute2) disponible", tcVersion.includes('tc'), 'iproute2 installed');
  
  // Intentar crear qdisc (requiere sudo)
  try {
    await $`sudo tc qdisc add dev br-hotspot root handle 1: htb`.quiet();
    const tcShow = await $`sudo tc qdisc show dev br-hotspot`.text();
    logTest("htb qdisc creado", tcShow.includes('htb'), 'qdisc htb 1:');
    
    // Limpiar
    await $`sudo tc qdisc del dev br-hotspot root`.quiet();
  } catch {
    logTest("htb qdisc creado", false, 'requires sudo');
  }
  
  console.log("");
} catch (error: any) {
  logTest("Traffic shaping", false, error.message);
  console.log("");
}

// =============================================
// TEST 7: Ping tests (conectividad)
// =============================================
console.log("📡 TEST 7: Conectividad (Ping)");
console.log("─────────────────────────────────────────────");

try {
  // Ping a wan1-modem (simula WAN1)
  try {
    await $`ping -c 1 -W 1 10.1.1.1`.quiet();
    logTest("Ping WAN1 (wan1-modem)", true, '10.1.1.1');
  } catch {
    logTest("Ping WAN1 (wan1-modem)", false, 'check wan1-modem');
  }
  
  // Ping a wan2-modem (simula WAN2)
  try {
    await $`ping -c 1 -W 1 10.2.2.1`.quiet();
    logTest("Ping WAN2 (wan2-modem)", true, '10.2.2.1');
  } catch {
    logTest("Ping WAN2 (wan2-modem)", false, 'check wan2-modem');
  }
  
  // Ping a br-hotspot (Hotspot)
  try {
    await $`ping -c 1 -W 1 192.168.10.1`.quiet();
    logTest("Ping Hotspot (br-hotspot)", true, '192.168.10.1');
  } catch {
    logTest("Ping Hotspot (br-hotspot)", false, 'check br-hotspot');
  }
  
  console.log("");
} catch (error: any) {
  logTest("Ping tests", false, error.message);
  console.log("");
}

// =============================================
// TEST 8: Accel-PPP o模拟 (solo verificar instalación)
// =============================================
console.log("📡 TEST 8: PPPoE (accel-ppp)");
console.log("─────────────────────────────────────────────");

try {
  const whichAccel = await $`which accel-pppd`.text().catch(() => '');
  logTest("accel-ppp instalado", whichAccel.includes('accel-pppd'), 'daemon exists');
  
  // Verificar configuración
  const configExists = await Bun.file('/etc/accel-ppp.conf').exists();
  logTest("Config accel-ppp existe", configExists, '/etc/accel-ppp.conf');
  
  console.log("");
} catch (error: any) {
  logTest("PPPoE", false, error.message);
  console.log("");
}

// =============================================
// TEST 9: Unbound DNS
// =============================================
console.log("📡 TEST 9: DNS (Unbound)");
console.log("─────────────────────────────────────────────");

try {
  const whichUnbound = await $`which unbound`.text().catch(() => '');
  logTest("Unbound instalado", whichUnbound.includes('unbound'), 'daemon exists');
    
  const configExists = await Bun.file('/etc/unbound/unbound.conf').exists();
  logTest("Config Unbound existe", configExists, '/etc/unbound/unbound.conf');
  
  console.log("");
} catch (error: any) {
  logTest("Unbound", false, error.message);
  console.log("");
}

// =============================================
// RESUMEN FINAL
// =============================================
console.log("================================================");
console.log("📊 RESUMEN DE PRUEBAS");
console.log("================================================");
console.log(`✅ Pasadas: ${passed}`);
console.log(`❌ Falladas: ${failed}`);
console.log(`📊 Total: ${passed + failed}`);
console.log("");

if (failed === 0) {
  console.log("🎉 TODAS LAS PRUEBAS PASARON — SmartRouter listo para producción!");
} else {
  console.log("⚠️  Algunas pruebas fallaron. Revisa los errores arriba.");
}

await redis.quit();
process.exit(failed > 0 ? 1 : 0);
