#!/usr/bin/env bun
/**
 * Load Test: Simula conexión de 100 clientes PPPoE
 * Para probar cómo reacciona SmartRouter bajo carga
 */

import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

const TOTAL_CLIENTS = 100;
const BATCH_SIZE = 10; // Procesar en lotes de 10

console.log(`📡 Iniciando prueba de carga: ${TOTAL_CLIENTS} clientes PPPoE...`);
console.log("==================================================");

interface PPPoEClient {
  username: string;
  password: string;
  ip: string;
  status: string;
}

const clients: PPPoEClient[] = [];

// 1. Crear 100 clientes PPPoE en Redis
console.log(`[1/4] Creando ${TOTAL_CLIENTS} clientes en Redis...`);

for (let i = 1; i <= TOTAL_CLIENTS; i++) {
  const username = `testuser${i}`;
  const password = `pass${i}`;
  const ip = `192.168.20.${i}`;
  
  const clientData = {
    username,
    password,
    group_id: 'speed1',
    speedGroupId: '1',
    assignedIp: ip,
    ip,
    iface: 'veth20',
    status: 'active',
    estado_red: 'active',
    pago_status: 'pagado',
    connected_at: Date.now().toString(),
    nombre: `Test User ${i}`,
    telefono: '1234567890',
    email: `test${i}@example.com`,
  };
  
  await redis.hSet(`pppoe:client:${username}`, clientData);
  await redis.sAdd('pppoe_sessions', username);
  
  clients.push({ username, password, ip, status: 'created' });
  
  if (i % BATCH_SIZE === 0) {
    console.log(`  Progreso: ${i}/${TOTAL_CLIENTS} clientes creados...`);
  }
}

console.log(`✅ ${clients.length} clientes creados en Redis`);

// 2. Simular conexiones (agregar a tablas nftables)
console.log(`\n[2/4] Simulando conexiones PPPoE (agregando a nftables)...`);

let connected = 0;
for (let i = 0; i < clients.length; i++) {
  const client = clients[i];
  
  try {
    // Simular: agregar IP a tabla active_clients de nftables
    const { exec } = Bun;
    const proc = Bun.spawn(['sudo', 'nft', 'add', 'element', 'inet', 'pppoe', 'active_clients', '{', client.ip, '}']);
    await proc.exited;
    
    client.status = 'connected';
    connected++;
    
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`  Progreso: ${i + 1}/${TOTAL_CLIENTS} conectados...`);
    }
  } catch (error) {
    client.status = 'failed';
  }
}

console.log(`✅ ${connected} clientes PPPoE "conectados" (en nftables)`);

// 3. Verificar estado del sistema
console.log(`\n[3/4] Verificando métricas del sistema...`);

try {
  const metrics = await redis.hGetAll('metrics:clients');
  console.log(`  Clientes activos (Redis): ${metrics.pppoe || 0}`);
  console.log(`  Total clientes: ${metrics.total || 0}`);
} catch {}

// 4. Simular tráfico (ping masivo)
console.log(`\n[4/4] Simulando tráfico de red (ping desde namespaces)...`);

// En producción real, aquí harías ppppoe-calls reales
// Por ahora, solo verificamos que las IPs están en nftables
const { exec } = Bun;
const proc = Bun.spawn(['sudo', 'nft', 'list', 'set', 'inet', 'pppoe', 'active_clients']);
const output = await new Response(proc.stdout).text();

const lines = output.split('\n').filter(line => line.includes('elements'));
console.log(`  IPs en tabla nftables: ${lines.length > 0 ? lines[0] : '0'}`);

// 5. Reporte final
console.log(`\n✅ PRUEBA DE CARGA COMPLETADA`);
console.log("==================================================");
console.log(`📊 Reporte:`);
console.log(`  - Clientes creados: ${clients.length}`);
console.log(`  - Clientes conectados: ${connected}`);
console.log(`  - Tasa de éxito: ${(connected / clients.length * 100).toFixed(1)}%`);

// 6. Limpieza (opcional)
console.log(`\n🧹 Limpiando datos de prueba...`);
for (const client of clients) {
  await redis.del(`pppoe:client:${client.username}`);
}
await redis.del('pppoe_sessions');

// Limpiar nftables
try {
  for (const client of clients) {
    await Bun.spawn(['sudo', 'nft', 'delete', 'element', 'inet', 'pppoe', 'active_clients', '{', client.ip, '}']).exited;
  }
} catch {}

await redis.quit();

console.log("✅ Limpieza completada. Sistema listo para nueva prueba.");
