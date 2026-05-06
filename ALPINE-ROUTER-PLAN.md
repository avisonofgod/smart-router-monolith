# SmartRouter Alpine - Plan Completo

## Objetivo
Crear un sistema router completo basado en **Alpine Linux** con kernel personalizado para N100, que bootee perfectamente e incluya todo el software necesario integrado.

---

## FASES DEL PROCESO

### FASE 1: Preparación del Entorno de Build
**Objetivo**: Configurar entorno para compilar kernel y crear sistema Alpine personalizado.

**Pasos**:
1. Instalar dependencias en host (Ubuntu):
   - `apk` tools, `qemu-img`, `xorriso`, `cdrkit`, `syslinux`
   - Compiladores: `gcc`, `clang`, `llvm`, `make`
   - Kernel deps: `ncurses-dev`, `openssl-dev`, `elfutils-dev`

2. Extraer Alpine ISO base
3. Configurar entorno de compilación

---

### FASE 2: Compilación del Kernel Personalizado
**Objetivo**: Kernel Linux con soporte completo para router ISP.

**Características necesarias**:
- ✅ eBPF/XDP (kernel-space, 1M+ pps)
- ✅ nftables (firewall stateful)
- ✅ tc htb (traffic shaping)
- ✅ VLAN 8021Q
- ✅ virtio (para QEMU/testing)
- ✅ 9p (compartir archivos con host)
- ✅ Soporte para 500+ conexiones PPPoE
- ✅ DNS-over-TLS (Unbound)
- ✅ WireGuard (para Tailscale)

**Archivo**: `kernel/n100-router-alpine.config` - Configuración del kernel

---

### FASE 3: Crear Rootfs Alpine Personalizado
**Objetivo**: Sistema de archivos con todos los paquetes preinstalados.

**Paquetes incluidos**:
- `bun` (runtime TypeScript)
- `redis` (cerebro del sistema)
- `accel-ppp` (PPPoE server)
- `unbound` (DNS con DoT)
- `nftables` (firewall)
- `iproute2` (con soporte XDP)
- `bpftool` (gestión eBPF)
- `iptables` (legacy, por si acaso)
- `dhcp-server` (para hotspot)
- `hostapd` (WiFi AP, opcional)
- `tailscale` (VPN mesh)
- `babeld` (routing, opcional)
- `bird` (BGP, opcional)

**Integración SmartRouter**:
- Código en `/opt/smart-router/`
- Init script OpenRC en `/etc/init.d/smartrouter`
- Configuraciones en `/etc/smart-router/`

---

### FASE 4: Generar Imagen Bootable
**Objetivo**: Crear ISO o imagen disk para N100.

**Opciones**:
1. **ISO híbrido** (CD/USB) - Para instalación
2. **Imagen raw** (para dd a USB/SSD)
3. **QEMU image** (para pruebas)

**Archivos de arranque**:
- `syslinux` (legacy BIOS)
- `grub-efi` (UEFI, para N100)

---

### FASE 5: Pruebas en QEMU
**Objetivo**: Verificar que bootea y funciona antes de usar en N100 real.

**Pruebas**:
1. Boot desde ISO/IMG
2. Verificar kernel XDP support: `cat /proc/kallsyms | grep bpf`
3. Probar eBPF: `ip link set dev eth1 xdp obj router_kern.o`
4. Verificar nftables: `nft list tables`
5. Iniciar SmartRouter: `/etc/init.d/smartrouter start`
6. Probar portal cautivo: `curl http://192.168.10.1:3000`

---

### FASE 6: Despliegue en N100 Real
**Objetivo**: Instalar en hardware N100.

**Pasos**:
1. Boot desde USB con Alpine Router ISO
2. Ejecutar script de instalación: `setup-alpine-router`
3. Configurar interfaces WAN/LAN
4. Reboot y verificar arranque automático

---

## Estructura de Archivos a Crear

```
smart-router-monolith/
├── alpine-router-build.sh          # ★ Script principal de build
├── ALPINE-ROUTER-PLAN.md          # ★ Este archivo
├── kernel/
│   ├── n100-router-alpine.config   # ★ Config kernel para Alpine
│   └── Makefile.alpine            # ★ Makefile para compilar en Alpine
├── scripts/
│   ├── alpine-prepare.sh          # ★ Preparar entorno build
│   ├── alpine-kernel.sh           # ★ Compilar kernel
│   ├── alpine-rootfs.sh           # ★ Crear rootfs
│   ├── alpine-iso.sh              # ★ Generar ISO
│   ├── alpine-qemu-test.sh        # ★ Probar en QEMU
│   └── setup-alpine-router.sh     # ★ Instalador para N100
├── config/alpine/
│   ├── mkinitfs.conf              # Config initramfs
│   ├── nftables.conf              # Firewall
│   ├── unbound.conf               # DNS
│   └── accel-ppp.conf             # PPPoE
└── overlay/
    ├── etc/init.d/smartrouter     # ★ OpenRC init script
    ├── opt/smart-router/          # Código compilado
    └── usr/local/bin/             # Utilidades
```

---

## Tiempo Estimado

| Fase | Descripción | Tiempo |
|------|-------------|--------|
| 1 | Preparación | 30 min |
| 2 | Kernel compile | 45-60 min (N100 host) |
| 3 | Rootfs creation | 30 min |
| 4 | ISO generation | 15 min |
| 5 | QEMU testing | 30 min |
| 6 | N100 deploy | 15 min |

**Total**: ~3 horas

---

## Próximo Paso

Voy a crear todos los scripts necesarios, empezando con:
1. `alpine-router-build.sh` - Orquestador principal
2. `scripts/alpine-prepare.sh` - Preparar entorno
3. `kernel/n100-router-alpine.config` - Configuración kernel

¿Procedo a crear todos los archivos?
