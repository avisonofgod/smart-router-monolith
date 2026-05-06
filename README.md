# SmartRouter Monolith

Router monolítico para ISP construido con Bun + TypeScript.

## ✅ Estado Actual (Sesión 2026-05-05)

### Correcciones Aplicadas
1. **Redis**: Eliminado top-level await, usando `ensureRedisConnected()` en cada método
2. **Hardcodes**: Gateway WAN dinámico vía `ip route`, no hardcoded
3. **eBPF**: Cargado en eth1/eth2 (WAN), no en eth0 (LAN)
4. **Firewall**: Eliminado iptables, 100% nftables
5. **SessionChecker**: Integrado al loop de monitoreo (cada 5s)
6. **SystemMonitor**: Nuevo `utils/monitor.ts` para detección de fallas
7. **Strings nulos**: Eliminado `'null'`, usando `''` (vacío real)

## Características

- ✅ **Balanceo WAN Dual** con eBPF XDP (kernel-space, 1M+ pps)
- ✅ **Hotspot WiFi** con portal cautivo, tickets pausados/corridos, auth por MAC
- ✅ **PPPoE Residencial** vía accel-ppp con validación Redis
- ✅ **Unbound DNS** con DNS-over-TLS y filtrado de dominios
- ✅ **Tailscale** para gestión remota aislada
- ✅ **Dashboard** en tiempo real (puerto 3000) con métricas
- ✅ **SystemMonitor** con logs automáticos y detección de fallas

## Inicio Rápido

```bash
# Instalar dependencias
bun install

# Configurar entorno (VLANs, nftables, etc.)
bun run setup

# Iniciar SmartRouter
bun run start
```

## Estructura del Proyecto

```
smart-router-monolith/
├── src/
│   ├── index.ts          # Orchestrator principal (v1.0)
│   ├── network.ts        # VLANs, nftables, eBPF, tc htb
│   ├── hotspot.ts        # Gestión hotspot tickets (pausado/corrido, MAC auth)
│   ├── pppoe.ts          # Gestión PPPoE via accel-ppp
│   ├── dns.ts            # Unbound DNS con DoT
│   ├── tailscale.ts      # VPN mesh para gestión
│   ├── dashboard.ts      # API REST + Portal Cautivo (puerto 3000)
│   ├── types.ts          # Definiciones TypeScript
│   └── utils/
│       ├── logger.ts      # Sistema de logging
│       ├── redis.ts       # Singleton Redis
│       └── monitor.ts     # SystemMonitor (NUEVO)
├── kernel/                  # eBPF XDP programs (router_kern.c)
│   ├── bpf_loader.ts       # Cargador eBPF desde Bun
│   ├── bpf_maps.h         # Definiciones de mapas BPF
│   └── Makefile           # Compilación eBPF
├── config/                  # Configuraciones
│   ├── nftables.conf       # Firewall nftables
│   ├── accel-ppp.conf      # Configuración PPPoE
│   ├── unbound.conf        # DNS con DoT
│   └── setup.sh            # Script de inicialización
├── scripts/                 # Scripts de prueba y desarrollo
│   ├── test-suite.ts        # Suite de pruebas
│   ├── perf-test.ts         # Pruebas de rendimiento
│   ├── load-test-pppoe.ts  # Simulación 100 clientes PPPoE
│   └── qemu-test.sh        # Pruebas en QEMU (NUEVO)
├── docs/                    # Documentación técnica
│   ├── ARCHITECTURE.md     # Arquitectura del sistema
│   ├── DEPLOYMENT.md       # Guía de despliegue
│   └── TROUBLESHOOTING.md  # Diagnóstico de fallas
└── qemu-n100-router/         # Entorno QEMU (NUEVO)
    ├── kernel/                # Kernel Linux 6.12.21 monolitico
    ├── rootfs.img            # Root filesystem mínimo
    ├── scripts/               # Scripts de kernel/QEMU
    └── README.md             # Documentación QEMU
```

## QEMU Development Environment (NUEVO)

Se ha preparado un entorno QEMU con kernel monolitico para desarrollo:

### Kernel N100 Router
- **Versión**: Linux 6.12.21 LTS (compatible con GCC 15/C23)
- **Tipo**: Monolítico (`CONFIG_MODULES is not set`)
- **Soporte**: eBPF/XDP, nftables, tc htb, virtio, VLAN 8021Q
- **Archivo**: `/home/river/TRABAJO/qemu-n100-router/kernel/bzImage-n100-router`

### Scripts Disponibles
```bash
cd /home/river/TRABAJO/qemu-n100-router/

# Descargar y compilar kernel (ya hecho)
./scripts/download-kernel.sh
./scripts/configure-kernel.sh
./scripts/compile-kernel.sh

# Ejecutar QEMU
./scripts/run-qemu.sh

# Conectar a consola serial
screen -r qemu
```

## Documentación Adicional (NUEVO)

- **DEVELOPMENT.md**: Guía completa de desarrollo, flujos, correcciones
- **PROJECT-DOCS.md**: Documentación técnica detallada
- **instructions.md**: Instrucciones para Senior Expert (10+ años ISP)

## Kernel Monolítico vs Microkernel

### Decisión: Monolítico para Router
| Aspecto | Microkernel | Monolítico |
|---------|--------------|-------------|
| eBPF/XDP | ❌ No funciona | ✅ Nativo |
| Rendimiento | ❌ IPC overhead | ✅ 1M+ pps en XDP |
| nftables/tc | ❌ Requiere reescritura | ✅ Kernel nativo |
| Para Router | ❌ No viable | ✅ Única opción |

**Conclusión**: Microkernel no soporta eBPF/XDP, monolitico es la única opción real.

## API Endpoints

| Endpoint | Método | Descripción |
|-----------|---------|-------------|
| `/api/hotspot/create` | POST | Crear ticket Hotspot |
| `/api/hotspot/check-auto` | POST | Reconexión automática por MAC |
| `/api/hotspot/activate` | POST | Activar ticket (login manual) |
| `/api/hotspot/ticket/:id` | PATCH | Pausar/Reanudar ticket |
| `/api/pppoe/create` | POST | Crear sesión PPPoE |
| `/api/metrics` | GET | Métricas del sistema |

## Monitoreo

```bash
# Ver logs del servicio
journalctl -u smartrouter -f

# Ver métricas
curl http://10.99.0.1:3000/api/metrics | jq .

# Ver tickets activos en Redis
redis-cli SMEMBERS hotspot_tickets

# Ver sesiones PPPoE
redis-cli SMEMBERS pppoe_sessions

# Ver estado WAN
redis-cli HGETALL wan:eth1

# Ver logs del sistema (SystemMonitor)
redis-cli LRANGE logs:system:recent 0 9

# Ver fallas detectadas
redis-cli LRANGE failures:recent 0 9
```

## Compilación a Binario

```bash
cd /home/river/TRABAJO/smart-router-monolith
bun build ./src/index.ts --compile --outfile smart-router
sudo ./smart-router
```

## Licencia

MIT
