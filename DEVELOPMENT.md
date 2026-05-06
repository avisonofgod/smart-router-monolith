# SmartRouter Monolith - Guía de Desarrollo

## Entendiendo el Proyecto

### Conceptos Clave
1. **Monolítico**: Todo en kernel-space (eBPF/XDP, nftables, tc). No microkernel.
2. **Orchestrator**: `index.ts` inicia todos los servicios en orden.
3. **Redis**: Cerebro del estado (tickets, sesiones, métricas, logs).
4. **eBPF/XDP**: Balanceo WAN ultra rápido en driver-space.
5. **nftables**: Firewall stateful y NAT. Reemplaza iptables.
6. **accel-ppp**: Maneja PPPoE residencial.
7. **Unbound**: DNS seguro con DoT.

### Flujo de Datos
```
Cliente WiFi → Hotspot Manager → Redis (mac_to_ticket, shadow:*, hs:online)
Cliente PPPoE → accel-ppp → PPPoEManager → Redis (pppoe:user)
Balanceo WAN → eBPF XDP → mapas wan_status, wan_stats
Dashboard → API REST (puerto 3000) → Redis → respuestas JSON
SystemMonitor → Colección de logs → Redis (logs:system:*, failures:*)
```

## Correcciones Realizadas (Session 2026-05-05)

### 1. Eliminado Hardcodes
- `network.ts`: Gateway WAN se obtiene vía `ip route show` (no hardcoded).
- `hotspot.ts`: Strings `'null'` → `''` (vacío real).
- `types.ts`: Configuración base (no datos falsos).

### 2. Redis Connections
- Eliminado top-level `await redis.connect()` en módulos.
- Ahora usan `ensureRedisConnected()` en cada método estático.
- Una sola conexión por módulo (singleton pattern).

### 3. eBPF Loading
- **Error**: Cargaba en `eth0` (LAN), no en WAN interfaces.
- **Corrección**: Carga en `eth1` y `eth2` (WAN1 y WAN2).

### 4. Firewall
- Eliminado `iptables` de `setupNAT()`.
- Todo el firewall vía `nftables` (cargado desde `config/nftables.conf`).

### 5. Session Checker
- **Error**: `sessionChecker()` nunca se ejecutaba en el loop de monitoreo.
- **Corrección**: Agregado a `startMonitoring()` en `index.ts`.

### 6. System Monitor
- Nuevo archivo: `src/utils/monitor.ts`.
- Colección automática cada 30s: eBPF, nftables, accel-ppp, Unbound, Tailscale, Redis.
- Detecta fallas y guarda en Redis (`failures:recent`).
- **Nota**: Aún no integrado completamente (en desarrollo).

## Kernel N100 para QEMU

### Decisión: Monolítico sobre Microkernel
| Criterio | Microkernel | Monolítico |
|-----------|--------------|-------------|
| eBPF/XDP | ❌ No funciona | ✅ Nativo en kernel |
| Rendimiento | ❌ IPC overhead | ✅ 1M+ pps en XDP |
| nftables/tc | ❌ Requiere reescritura | ✅ Kernel nativo |
| Para Router | ❌ No viable | ✅ Única opción |

### Kernel Compilado
- **Versión**: 6.12.21 LTS (compatible con GCC 15, C23).
- **Configuración**: Monolítico (`CONFIG_MODULES is not set`).
- **Soporte**: eBPF/XDP, nftables, tc htb, virtio, VLAN 8021Q.
- **Archivo**: `/home/river/TRABAJO/qemu-n100-router/kernel/bzImage-n100-router`.

### QEMU Environment
- **Scripts creados**:
  - `scripts/download-kernel.sh`: Descarga kernel 6.12.21.
  - `scripts/configure-kernel.sh`: Configura para router.
  - `scripts/compile-kernel.sh`: Compila bzImage.
  - `scripts/create-rootfs.sh`: Crea rootfs mínimo.
  - `scripts/run-qemu.sh`: Ejecuta QEMU con 3 interfaces WAN simuladas.
- **Estado**: QEMU corre en background, pero interacción pendiente (detalles de consola serial).

## Tareas Pendientes

### Código
- [ ] Integrar `SystemMonitor` completamente (falta probar).
- [ ] Completar dashboard HTML (gráficos, métricas en tiempo real).
- [ ] Probar eBPF/XDP en QEMU (cargar `router_kern.o` en eth1/eth2).
- [ ] Validar nftables con conjuntos (sets) para hotspot y PPPoE.
- [ ] Implementar corte de morosos (día 1 y 5 de cada mes).

### QEMU
- [ ] Solucionar interacción con consola serial (screen/socat/expect).
- [ ] Probar carga de programa eBPF dentro de QEMU.
- [ ] Validar que nftables y tc funcionen en el entorno simulado.

### Documentación
- [x] README.md actualizado.
- [x] PROJECT-DOCS.md creado.
- [ ] Documentar API endpoints completos.
- [ ] Crear diagramas de flujo (hotspot perfil pausado vs corrido).

## Cómo Desarrollar

### 1. Ejecutar Local (Host)
```bash
cd /home/river/TRABAJO/smart-router-monolith
bun run start
```

### 2. Ejecutar en QEMU
```bash
cd /home/river/TRABAJO/qemu-n100-router
./scripts/run-qemu.sh
# Luego conectar vía: screen -r qemu
```

### 3. Probar eBPF
Dentro de QEMU (si logramos consola):
```bash
# Verificar soporte eBPF
cat /proc/kallsyms | grep bpf

# Cargar programa XDP (desde /mnt/host_code/kernel/router_kern.o)
ip link set dev eth1 xdp obj /mnt/host_code/kernel/router_kern.o sec xdp_wan_balance

# Ver estadísticas
bpftool net show
bpftool map show
```

### 4. Probar nftables
```bash
# Listar tablas
nft list tables

# Cargar configuración
nft -f /mnt/host_code/config/nftables.conf
```

## Notas Importantes
- **Redis**: Siempre usar `ensureRedisConnected()` antes de operaciones.
- **Hotspot**: La clave es MAC + Ticket, no IP (IPs cambian por DHCP).
- **PPPoE**: Usa accel-ppp, validación vía Redis, shaper vía tc htb.
- **Balanceo WAN**: eBPF XDP es sticky por IP origen, no rompe sesiones.
- **QEMU**: Usar kernel monolitico, no microkernel. Microkernel no soporta eBPF/XDP.
