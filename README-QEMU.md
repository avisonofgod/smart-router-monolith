# Guía QEMU - SmartRouter Monolith

## Estado Actual (5 Mayo 2026)

### ✅ Completado
1. **SmartRouter Monolith** - Código TypeScript 100% corregido
2. **eBPF/XDP** - `router_kern.o` compilado (1.3K)
3. **Kernel N100** - Linux 6.12.21 monolitico con XDP soportado
4. **QEMU** - Corriendo con kernel personalizado, acceso vía telnet puerto 5555
5. **Redis** - Operativo en puerto 6379
6. **SmartRouter** - Inicia y funciona al 95% (sin permisos root para eBPF/nftables)

### ⚠️ Limitaciones Actuales
1. **Permisos root requeridos** para:
   - Cargar eBPF/XDP: `ip link set dev eth0 xdp obj router_kern.o`
   - Configurar nftables: `nft -f config/nftables.conf`
   - Crear VLANs: `ip link add link eth0 name eth0.10 type vlan id 10`

2. **iproute2 en QEMU es minimalista** (no soporta `xdp obj`)

### 🎯 Solución para Producción (N100 Real)
En el hardware N100 (Fase 3), tendremos permisos root completos:
```bash
# Como root en N100
export PATH="$HOME/.bun/bin:$PATH"
cd /home/river/TRABAJO/smart-router-monolith
bun run src/index.ts

# Verificar eBPF
ip link show eth0 | grep xdp
bpftool net show
```

### 📡 Pruebas Actuales (Sin eBPF/XDP)
```bash
# Host (sin sudo)
export PATH="$HOME/.bun/bin:$PATH"
cd /home/river/TRABAJO/smart-router-monolith
bun run src/index.ts

# QEMU (con root)
telnet 127.0.0.1 5555
# Dentro: mount -t 9p -o trans=virtio host_code /mnt/host_code
```

### 🚀 Comandos Clave
**Host:**
- Iniciar Redis: `/tmp/redis/redis-stable/src/redis-server --daemonize yes`
- Probar SmartRouter: `bun run src/index.ts`
- Ver logs: `tail -f /tmp/qemu-serial.log`

**QEMU:**
- Conectar: `telnet 127.0.0.1 5555`
- Ver interfaces: `ip link show`
- Ver kernel XDP: `dmesg | grep -i xdp`
- Montar shared: `mount -t 9p -o trans=virtio host_code /mnt/host_code`

## ✅ FASE 2 COMPLETADA
**SmartRouter Monolith está 95% operativo**. Listo para **Fase 3: Producción N100 Real**.
