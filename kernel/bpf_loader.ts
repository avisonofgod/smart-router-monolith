// Cargador de programas eBPF desde Bun
import { $ } from "bun";
import { existsSync } from 'fs';
import { join } from 'path';

const BPF_DIR = '/home/river/smart-router-monolith/kernel';

export class BPFLoader {
  // Cargar programa eBPF en interfaz
  static async loadXDP(programPath: string, iface: string = 'eth0') {
    if (!existsSync(programPath)) {
      throw new Error(`Programa eBPF no encontrado: ${programPath}`);
    }
    
    try {
      // Cargar programa XDP
      await $`ip link set dev ${iface} xdp obj ${programPath} sec xdp_wan_balance`.quiet();
      console.log(`✅ eBPF XDP cargado en ${iface}`);
      return true;
    } catch (error) {
      console.error('❌ Error cargando eBPF XDP:', error);
      return false;
    }
  }
  
  // Descargar programa eBPF
  static async unloadXDP(iface: string = 'eth0') {
    try {
      await $`ip link set dev ${iface} xdp off`.quiet();
      console.log(`✅ eBPF XDP descargado de ${iface}`);
      return true;
    } catch (error) {
      console.error('❌ Error descargando eBPF XDP:', error);
      return false;
    }
  }
  
  // Cargar programa TC (Traffic Control)
  static async loadTC(programPath: string, iface: string = 'eth0') {
    if (!existsSync(programPath)) {
      throw new Error(`Programa eBPF no encontrado: ${programPath}`);
    }
    
    try {
      // Crear qdisc clsact si no existe
      await $`tc qdisc add dev ${iface} clsact`.quiet().catch(() => {});
      
      // Cargar programa en hook ingress
      await $`tc filter add dev ${iface} ingress bpf da obj ${programPath} sec tc_ingress`.quiet();
      console.log(`✅ eBPF TC cargado en ${iface} (ingress)`);
      return true;
    } catch (error) {
      console.error('❌ Error cargando eBPF TC:', error);
      return false;
    }
  }
  
  // Verificar programas cargados
  static async listLoaded() {
    try {
      const xdp = await $`ip link show | grep xdp`.quiet();
      console.log('Programas XDP cargados:');
      console.log(xdp.text());
    } catch {
      console.log('No hay programas XDP cargados');
    }
    
    try {
      const tc = await $`tc filter show dev eth0 ingress`.quiet();
      console.log('Programas TC cargados:');
      console.log(tc.text());
    } catch {
      console.log('No hay programas TC cargados');
    }
  }
  
  // Compilar programa eBPF
  static async compile() {
    const cPath = join(BPF_DIR, 'router_kern.c');
    const oPath = join(BPF_DIR, 'router_kern.o');
    
    if (!existsSync(cPath)) {
      throw new Error(`Archivo fuente no encontrado: ${cPath}`);
    }
    
    try {
      await $`clang -O2 -target bpf -c ${cPath} -o ${oPath}`.quiet();
      console.log(`✅ eBPF compilado: ${oPath}`);
      return oPath;
    } catch (error) {
      console.error('❌ Error compilando eBPF:', error);
      throw error;
    }
  }
  
  // Pin program to bpffs (para persistencia)
  static async pinProgram(pinPath: string = '/sys/fs/bpf/router_balance') {
    try {
      await $`bpftool prog pin id $(bpftool prog list | grep xdp_wan_balance | awk '{print $1}' | tr -d ':') ${pinPath}`.quiet();
      console.log(`✅ Programa pinned en ${pinPath}`);
    } catch (error) {
      console.error('❌ Error pining programa:', error);
    }
  }
  
  // Obtener estadísticas del mapa eBPF
  static async getStats() {
    try {
      const result = await $`bpftool map show`.quiet();
      return result.text();
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return '';
    }
  }
}

// Función helper para inicialización
export async function initEBPF() {
  const bpfPath = join(BPF_DIR, 'router_kern.o');
  
  // Compilar si no existe
  if (!existsSync(bpfPath)) {
    console.log('Compilando eBPF...');
    await BPFLoader.compile();
  }
  
  // Cargar en interfaces WAN
  await BPFLoader.loadXDP(bpfPath, 'eth1');
  await BPFLoader.loadXDP(bpfPath, 'eth2');
  
  console.log('✅ eBPF inicializado en ambas WAN');
}
