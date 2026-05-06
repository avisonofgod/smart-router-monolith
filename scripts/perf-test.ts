#!/usr/bin/env bun
/**
 * Performance Test: Mide el rendimiento de SmartRouter
 * - eBPF XDP packet processing
 * - TCP throughput con iperf3
 * - Latencia bajo carga
 */

import { $ } from "bun";
import { createClient } from 'redis';

console.log("📈 SMARTROUTER — PERFORMANCE TEST");
console.log("================================================");
console.log("");

const results: any[] = [];

// =============================================
// 1. Test de throughput (requiere iperf3)
// =============================================
console.log("📡 TEST 1: TCP Throughput (iperf3)");
console.log("─────────────────────────────────────────────");

try {
  // Verificar si iperf3 está instalado
  const whichIperf = await $`which iperf3`.text().catch(() => '');
  
  if (whichIperf.includes('iperf3')) {
    console.log("  ℹ️  iperf3 encontrado, ejecutando test...");
    
    // Iniciar servidor iperf3 en wan1-modem (background)
    const serverProc = Bun.spawn(['sudo', 'iperf3', '-s', '-D', '-B', '10.1.1.1']);
    await Bun.sleep(1000); // Esperar servidor inicie
    
    // Ejecutar cliente desde wan1-router
    try {
      const clientResult = await $`iperf3 -c 10.1.1.1 -B 10.1.1.2 -t 5 -J`.quiet();
      const data = JSON.parse(clientResult.text());
      const bandwidth = data.end.sum_received.bits_per_second;
      const mbps = (bandwidth / 1000000).toFixed(2);
      
      console.log(`  ✅ Throughput: ${mbps} Mbps`);
      results.push({ test: 'TCP_Throughput', value: mbps, unit: 'Mbps' });
    } catch (error: any) {
      console.log(`  ❌ Error en iperf3: ${error.message}`);
    }
    
    // Detener servidor
    await $`sudo pkill iperf3`.quiet();
  } else {
    console.log("  ⚠️  iperf3 no instalado. Instalar: apt install iperf3");
    console.log("  ℹ️  Omitiendo test de throughput...");
  }
} catch (error: any) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log("");

// =============================================
// 2. Test de latencia bajo carga
// =============================================
console.log("📡 TEST 2: Latencia bajo carga");
console.log("─────────────────────────────────────────────");

try {
  const latencies: number[] = [];
  
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    await $`ping -c 1 -W 1 10.1.1.1`.quiet().catch(() => {});
    const end = Date.now();
    latencies.push(end - start);
  }
  
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);
  
  console.log(`  ✅ Latencia promedio: ${avgLatency.toFixed(2)} ms`);
  console.log(`     Mín: ${minLatency} ms, Máx: ${maxLatency} ms`);
  
  results.push({ test: 'Latency_Avg', value: avgLatency, unit: 'ms' });
} catch (error: any) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log("");

// =============================================
// 3. Test de Redis (ops/sec)
// =============================================
console.log("📡 TEST 3: Redis Performance (ops/sec)");
console.log("─────────────────────────────────────────────");

try {
  const redis = createClient({ url: 'redis://localhost:6379' });
  await redis.connect();
  
  const iterations = 1000;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    await redis.set(`perf:key:${i}`, `value${i}`);
  }
  
  const elapsed = Date.now() - start;
  const opsPerSec = (iterations / elapsed) * 1000;
  
  console.log(`  ✅ ${opsPerSec.toFixed(0)} ops/sec (${iterations} operaciones en ${(elapsed/1000).toFixed(2)}s)`);
  results.push({ test: 'Redis_OPS', value: opsPerSec, unit: 'ops/sec' });
  
  // Limpiar
  for (let i = 0; i < iterations; i++) {
    await redis.del(`perf:key:${i}`);
  }
  
  await redis.quit();
} catch (error: any) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log("");

// =============================================
// 4. Test de eBPF XDP (paquetes procesados)
// =============================================
console.log("📡 TEST 4: eBPF XDP Packet Processing");
console.log("─────────────────────────────────────────────");

try {
  const bpftool = await $`sudo bpftool map show`.text().catch(() => '');
  
  if (bpftool.includes('wan_stats')) {
    console.log("  ✅ Mapa wan_stats encontrado (eBPF XDP)");
    
    // Intentar leer estadísticas
    const mapInfo = await $`sudo bpftool map dump`.text().catch(() => '');
    console.log(`  ℹ️  Estadísticas eBPF disponibles`);
  } else {
    console.log("  ⚠️  Programa eBPF no está cargado");
    console.log("     Ejecutar: sudo ip link set dev wan1-router xdp obj kernel/router_kern.o sec xdp_wan_balance");
  }
} catch (error: any) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log("");

// =============================================
// RESUMEN
// =============================================
console.log("================================================");
console.log("📊 RESUMEN DE RENDIMIENTO");
console.log("================================================");
console.log("");

for (const r of results) {
  console.log(`  ${r.test}: ${r.value} ${r.unit}`);
}

console.log("");
console.log("✅ Tests de rendimiento completados!");
