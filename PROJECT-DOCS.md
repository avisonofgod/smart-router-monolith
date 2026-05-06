# SmartRouter Monolith - Documentación Técnica Completa

## Visión General
Router de producción para ISP basado en Linux monolitico con kernel 6.12 LTS.
Gestiona 500+ clientes via VLANs hotspot/PPPoE con balanceo WAN dual eBPF/XDP.

## Arquitectura del Sistema

### 1. Kernel Monolítico (N100 Router)
- **Tipo**: Monolítico (no microkernel)
- **Razón**: eBPF/XDP requiere acceso directo a kernel-space
- **Ventaja**: procesamiento de paquetes en driver-space sin IPC overhead
- **Rendimiento**: 1M+ pps (paquetes por segundo) en XDP

### 2. Componentes Principales

```
SmartRouter Monolith (Bun + TypeScript)
├── index.ts (Orchestrator)
├── network.ts (VLANs, nftables, eBPF, tc htb)
├── hotspot.ts (Tickets, perfiles pausado/corrido, MAC auth)
├── pppoe.ts (accel-ppp, planes residenciales)
├── dns.ts (Unbound con DoT y filtrado)
├── tailscale.ts (VPN mesh para gestión)
├── dashboard.ts (API REST + Portal Cautivo)
└── utils/
    ├── redis.ts (Singleton Redis)
    ├── monitor.ts (SystemMonitor con logs)
    └── logger.ts (Logging con niveles)
```

## Flujos Críticos

### Hotspot - Perfil Pausado
1. Cliente WiFi → DHCP IP → nftables redirige a portal
2. Portal detecta MAC via ARP → busca `mac_to_ticket:{mac}` en Redis
3. Si existe: reconexión automática sin login
4. Si no: login con ticket → asocia MAC → crea `shadow:{ticketId}`
5. Al desconectar: guarda saldo en `remaining_ms`, cambia a `paused:true`
6. Al reconectar: restaura saldo desde Redis

### Hotspot - Perfil Corrido
- Timer corre SIEMPRE desde primera activación
- No se pausa al desconectar
- `shadow:{ticketId}` con TTL = tiempo restante
- Se expira automáticamente vía Redis

### Balanceo WAN con eBPF/XDP
```
eth1/eth2 → XDP program → hash IP origen → sticky session
                ↓
         eBPF map (wan_status, wan_stats)
                ↓
         Redirige a WAN online (failover automático)
```

## Correcciones Aplicadas (Session 2026-05-05)

### 1. Paths Hardcodeados → Dinámicos
- `network.ts`: Gateway WAN se obtiene via `ip route show`
- Eliminados strings `'null'` → usando `''` (vacío real)

### 2. Top-level await eliminado
- `hotspot.ts`, `pppoe.ts`, `dns.ts`, `tailscale.ts`, `dashboard.ts`
- Ahora usan `ensureRedisConnected()` en cada método estático

### 3. eBPF cargado en interfaces correctas
- Antes: `ip link set dev eth0 xdp ...` (INCORRECTO)
- Ahora: `ip link set dev eth1 xdp ...` y `dev eth2` (CORRECTO)

### 4. iptables eliminado → 100% nftables
- `setupNAT()` ahora solo habilita ip_forward
- Todo el firewall/nat via nftables (`config/nftables.conf`)

### 5. SessionChecker agregado al loop de monitoreo
- `index.ts`: Ahora ejecuta `HotspotManager.sessionChecker()` cada 5s
- Detecta clientes desconectados y aplica lógica por perfil

### 6. SystemMonitor implementado
- `utils/monitor.ts`: Colección de logs cada 30s
- Detecta fallas en eBPF, nftables, servicios
- Guarda en Redis: `logs:system:*` y `failures:recent`

## Kernel N100 - Monolítico vs Microkernel

### Decisión: Monolítico Linux 6.12
| Aspecto | Microkernel | Monolítico |
|---------|--------------|-------------|
| eBPF/XDP | NO funciona | ✅ Nativo |
| Rendimiento | IPC overhead alto | ✅ Driver-space |
| nftables/tc | Requiere reescritura | ✅ Kernel nativo |
| Aislamiento | ✅ Alto | ⚠️ Menor |
| Para Router | �️ No viable | ✅ Única opción |

## QEMU Development Environment

### Scripts creados en `/home/river/TRABAJO/qemu-n100-router/`:
1. `scripts/download-kernel.sh` - Descarga kernel 6.12.21 LTS
2. `scripts/configure-kernel.sh` - Configura para router monolitico
3. `scripts/compile-kernel.sh` - Compila bzImage
4. `scripts/create-rootfs.sh` - Crea rootfs mínimo
5. `scripts/run-qemu.sh` - Ejecuta con 3 interfaces WAN simuladas

### Kernel Config Highlights:
```
CONFIG_BPF=y, CONFIG_BPF_SYSCALL=y, CONFIG_XDP_SOCKETS=y
CONFIG_NF_TABLES=y, CONFIG_NFT_MASQ=y, CONFIG_NFT_NAT=y
CONFIG_NET_SCH_HTB=y, CONFIG_NET_CLS=y
CONFIG_VIRTIO_NET=y, CONFIG_VIRTIO_PCI=y
CONFIG_MODULES is not set (monolitico)
```

## Próximos Pasos
1. ✅ Corregir código TypeScript (hecho)
2. ✅ Configurar SystemMonitor (hecho)
3. ⏳ Completar pruebas en QEMU (en progreso)
4. ⏳ Implementar dashboard HTML completo
5. ⏳ Desplegar en N100 real con Tailscale

## Notas de Desarrollo
- Redis: Usar `ensureRedisConnected()` antes de operaciones
- nftables: Todo el firewall vía conjuntos (sets), no reglas individuales
- eBPF: Compilar con `make -C kernel/` y cargar con `ip link set ... xdp obj ...`
- Hotspot: La clave es MAC + Ticket, no IP (IPs cambian por DHCP)
- PPPoE: Usa accel-ppp, validación via Redis, shaper via tc htb
