# Guía Completa: Alpine Router para N100
## Proceso Paso a Paso para Boot Perfecto

---

## RESUMEN DEL PROCESO

```
1. Preparar entorno de build (Ubuntu host)
2. Extraer Alpine ISO base
3. Compilar kernel personalizado (eBPF/XDP, nftables, tc htb)
4. Crear rootfs con todos los paquetes
5. Integrar SmartRouter Monolith
6. Generar ISO híbrido (BIOS + UEFI)
7. Probar en QEMU
8. Grabar a USB
9. Boot en N100
10. Configurar y disfrutar
```

---

## FASE 1: Preparar Host (Ubuntu)

```bash
cd /home/river/smart-router-monolith

# Dar permisos de ejecución a scripts
chmod +x alpine-router-build.sh
chmod +x scripts/*.sh
chmod +x overlay/etc/init.d/smartrouter

# Ejecutar preparación
./scripts/alpine-prepare.sh
```

**Esto instala**: xorriso, syslinux, mtools, squashfs-tools, grub-efi, compiladores

---

## FASE 2: Compilar Kernel Personalizado

```bash
# Compilar kernel (toma ~60 min en N100, ~30 min en host potente)
./alpine-router-build.sh kernel
```

**Kernel configurado con**:
- ✅ eBPF/XDP para balanceo WAN (1M+ pps)
- ✅ nftables para firewall stateful
- ✅ tc htb para traffic shaping
- ✅ VLAN 8021Q para aislamiento
- ✅ WireGuard para Tailscale
- ✅ virtio y 9p para QEMU
- ✅ Soporte PPPoE completo
- ✅ Monolítico (no modules) para rendimiento

**Resultado**: `alpine-build/kernel/bzImage-n100-router`

---

## FASE 3: Crear Rootfs Alpine

```bash
# Crear rootfs con paquetes preinstalados
./alpine-router-build.sh rootfs
```

**Paquetes incluidos**:
- **Sistema base**: alpine-base, openrc, bash, tzdata
- **Red**: iproute2, nftables, iptables, wireguard-tools, dhcp-server, dnsmasq, hostapd
- **PPPoE**: ppp, rp-pppoe, accel-ppp (desde repos o compilado)
- **DNS**: unbound, bind-tools
- **Runtime**: redis, bun (JavaScript/TypeScript)
- **VPN**: tailscale
- **Utilidades**: curl, wget, rsync, nano, logrotate

**Directorio**: `alpine-build/rootfs/`

---

## FASE 4: Integrar SmartRouter Monolith

```bash
# Copiar código fuente a rootfs
cp -r src alpine-build/rootfs/opt/smart-router/
cp package.json tsconfig.json alpine-build/rootfs/opt/smart-router/
cp -r config alpine-build/rootfs/opt/smart-router/
cp -r kernel alpine-build/rootfs/opt/smart-router/

# Copiar init script
cp overlay/etc/init.d/smartrouter alpine-build/rootfs/etc/init.d/
chmod +x alpine-build/rootfs/etc/init.d/smartrouter

# Compilar SmartRouter dentro del rootfs
chroot alpine-build/rootfs /bin/bash -c "cd /opt/smart-router && bun install && bun build ./src/index.ts --compile --outfile smart-router"
```

---

## FASE 5: Generar ISO Bootable

```bash
./alpine-router-build.sh iso
```

**Características del ISO**:
- ✅ Híbrido: Boot BIOS (syslinux) + UEFI (GRUB)
- ✅ Kernel personalizado integrado
- ✅ Rootfs squashfs comprimido
- ✅ Detecta automáticamente N100 hardware
- ✅ Boot en 5-10 segundos

**Archivo generado**: `alpine-router-n100-YYYYMMDD.iso`

---

## FASE 6: Probar en QEMU

```bash
./alpine-router-build.sh qemu
```

**Verificaciones en QEMU**:
```bash
# Verificar kernel
uname -a
cat /proc/kallsyms | grep bpf

# Verificar eBPF
ip link show
tc qdisc show

# Verificar nftables
nft list tables

# Iniciar SmartRouter
rc-service smartrouter start
curl http://localhost:3000/api/metrics
```

---

## FASE 7: Grabar a USB

```bash
# Identificar USB
lsblk

# Grabar ISO (ASEGÚRATE de usar el dispositivo correcto)
sudo dd if=alpine-router-n100-YYYYMMDD.iso of=/dev/sdX bs=4M status=progress && sync

# También puedes usar:
# sudo cp alpine-router-n100-YYYYMMDD.iso /dev/sdX
```

---

## FASE 8: Boot en N100 Real

1. Insertar USB en N100
2. Encender y entrar a BIOS (F2 o Del)
3. Desactivar Secure Boot
4. Boot desde USB
5. Alpine Router inicia en ~10 segundos

**Primer boot**:
```bash
# Login: root (sin password)

# Ejecutar instalador
setup-alpine-router.sh

# O instalar manualmente:
setup-alpine  # Wizard interactivo
```

---

## FASE 9: Configuración Inicial en N100

```bash
# Configurar interfaces WAN/LAN
nano /etc/network/interfaces

# Ejemplo:
# auto eth0 (LAN - Hotspot/PPPoE)
# auto eth1 (WAN1)
# auto eth2 (WAN2 - opcional)

# Configurar nftables
nft -f /opt/smart-router/config/nftables.conf

# Iniciar servicios
rc-service redis start
rc-service smartrouter start

# Habilitar auto-start
rc-update add smartrouter default
rc-update add redis default
```

---

## FASE 10: Verificación Final

```bash
# Estado de SmartRouter
rc-service smartrouter status

# Métricas
curl http://192.168.10.1:3000/api/metrics

# Portal cautivo
# Conectar dispositivo a LAN (WiFi o ethernet)
# Navegar a cualquier URL → Redirige a portal

# eBPF XDP
ip link show eth1 | grep xdp
bpftool net show

# PPPoE
accel-cmd show sessions

# Logs
tail -f /var/log/smartrouter/stderr.log
```

---

## ESTRUCTURA FINAL DEL SISTEMA

```
N100 Hardware
├── boot/
│   ├── vmlinuz (kernel 6.12.21 personalizado)
│   ├── initramfs.img
│   └── grub/
│       └── grub.cfg
├── etc/
│   ├── init.d/smartrouter (OpenRC script)
│   ├── network/interfaces
│   └── smart-router/ (configs)
├── opt/
│   └── smart-router/
│       ├── smart-router (binario compilado)
│       ├── config/
│       └── kernel/ (eBPF programs)
└── var/
    ├── lib/redis/
    └── log/smartrouter/
```

---

## SOLUCIÓN DE PROBLEMAS

### No bootea desde USB
- Verificar que USB es bootable: `fdisk -l /dev/sdX` (debe tener *boot flag*)
- Desactivar Secure Boot en BIOS
- Cambiar modo SATA a AHCI en BIOS

### SmartRouter no inicia
```bash
# Verificar logs
cat /var/log/smartrouter/stderr.log

# Verificar Redis
redis-cli ping

# Verificar permisos
chmod +x /opt/smart-router/smart-router
```

### eBPF no carga
```bash
# Verificar soporte kernel
cat /proc/kallsyms | grep bpf
ls -la /sys/fs/bpf

# Cargar manualmente
ip link set dev eth1 xdp obj /opt/smart-router/kernel/router_kern.o sec xdp_wan_balance
```

---

## RESUMEN DE COMANDOS ÚTILES

```bash
# Build completo (todo en uno)
./alpine-router-build.sh all

# Solo kernel
./alpine-router-build.sh kernel

# Probar en QEMU
./scripts/alpine-qemu-test.sh

# Instalar en N100
setup-alpine-router.sh

# Servicios
rc-service smartrouter start/stop/restart
rc-update add smartrouter default

# Monitoreo
curl http://192.168.10.1:3000/api/metrics | jq .
redis-cli SMEMBERS hotspot_tickets
```

---

## ✅ CHECKLIST FINAL

- [ ] ISO generado correctamente
- [ ] Boot en QEMU exitoso
- [ ] eBPF/XDP funcionando (`bpftool prog list`)
- [ ] nftables cargado (`nft list tables`)
- [ ] Redis operativo (`redis-cli ping`)
- [ ] SmartRouter inicia (`rc-service smartrouter start`)
- [ ] Portal cautivo responde (puerto 3000)
- [ ] Balanceo WAN activo (ver `ip route`)
- [ ] PPPoE sesiones conectan (accel-ppp)
- [ ] Boot en N100 real exitoso
- [ ] Todas las interfaces configuradas

---

**¡Felicidades! Tienes un router ISP completo corriendo Alpine Linux con kernel personalizado y SmartRouter Monolith.**
