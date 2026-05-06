# Comandos para Build Alpine Router N100
## Fecha: 6 Mayo 2026
## Objetivo: Crear ISO bootable Alpine Router con Kernel personalizado

---

## FASE 1: Preparar entorno (En N100 Alpine)

```bash
# Instalar dependencias base
apk add --no-cache \
    xorisso \
    xz \
    syslinux \
    mtools \
    dosfstools \
    grub \
    grub-efi \
    grub-bios \
    squashfs-tools \
    wget \
    curl \
    build-base \
    ncurses-dev \
    bison \
    flex \
    openssl-dev \
    elfutils-dev \
    linux-headers

# Crear directorios
mkdir -p /opt/smart-router-monolith/alpine-build/{iso,rootfs,kernel,work,output}
```

---

## FASE 2: Compilar Kernel (En N100 Alpine)

```bash
# Entrar a directorio kernel
cd /opt/smart-router-monolith/alpine-build/kernel

# Descargar kernel (si no existe)
if [ ! -f linux-6.12.21.tar.xz ]; then
    wget https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.21.tar.xz
fi

# Extraer
if [ ! -d linux-6.12.21 ]; then
    tar xf linux-6.12.21.tar.xz
fi

# Configurar kernel
cd linux-6.12.21
cp /opt/smart-router-monolith/kernel/n100-router-alpine.config .config
make olddefconfig 2>/dev/null || make oldconfig < /dev/null

# Compilar bzImage (usar -j4 para N100)
echo "Compilando kernel bzImage..."
make -j4 bzImage

# Compilar módulos
echo "Compilando módulos..."
make -j4 modules

# Copiar kernel compilado
cp arch/x86/boot/bzImage ../bzImage-n100-router
echo "✅ Kernel compilado: alpine-build/kernel/bzImage-n100-router"

# Instalar módulos en rootfs
make -j4 modules_install INSTALL_MOD_PATH=/opt/smart-router-monolith/alpine-build/rootfs
```

---

## FASE 3: Crear Rootfs Alpine (En N100 Alpine)

### 3.1: Crear Alpine base con alpine-chroot-install

```bash
# Descargar alpine-chroot-install
cd /opt/smart-router-monolith/alpine-build
wget -O alpine-chroot-install \
    https://raw.githubusercontent.com/alpinelinux/alpine-chroot-install/master/alpine-chroot-install
chmod +x alpine-chroot-install

# Crear script de configuración dentro del chroot
cat > /opt/smart-router-monolith/alpine-build/setup-rootfs.sh << 'EOF'
#!/bin/sh
# Este script se ejecuta dentro del chroot Alpine

# Configurar repositorios
echo "https://dl-cdn.alpinelinux.org/alpine/v3.23/main" > /etc/apk/repositories
echo "https://dl-cdn.alpinelinux.org/alpine/v3.23/community" >> /etc/apk/repositories

# Actualizar e instalar paquetes base
apk update

# Paquetes esenciales para router
apk add alpine-base openrc bash curl wget nano

# Paquetes de red y routing
apk add iproute2 iproute2-tc nftables iptables wireguard-tools

# PPPoE y accel-ppp
apk add ppp ppp-chat rp-pppoe

# DNS y seguridad
apk add unbound bind-tools openssl ca-certificates

# Redis y base de datos
apk add redis

# Utilidades
apk add logrotate dcron rsync tar xz

# Tailscale (instalar desde script oficial)
curl -fsSL https://tailscale.com/install.sh | sh

# Bun (runtime para SmartRouter)
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Crear directorio para SmartRouter
mkdir -p /opt/smart-router

# Configurar red básica
cat > /etc/network/interfaces << NET
auto lo
iface lo inet loopback

auto eth0
iface eth0 inet dhcp
NET

# Configurar hostname
echo "alpine-router" > /etc/hostname

# Configurar OpenRC
rc-update add networking boot
rc-update add urandom boot
rc-update add redis default

# Limpiar caché
rm -rf /var/cache/apk/*

echo "✅ Rootfs configurado"
EOF

chmod +x /opt/smart-router-monolith/alpine-build/setup-rootfs.sh

# Crear rootfs usando alpine-chroot-install
/opt/smart-router-monolith/alpine-build/alpine-chroot-install \
    -d /opt/smart-router-monolith/alpine-build/rootfs \
    -s /opt/smart-router-monolith/alpine-build/setup-rootfs.sh \
    -m v3.23 \
    -a x86_64
```

### 3.2: Copiar SmartRouter a rootfs

```bash
# Copiar código fuente a rootfs
mkdir -p /opt/smart-router-monolith/alpine-build/rootfs/opt/smart-router
cp -r /opt/smart-router-monolith/src \
      /opt/smart-router-monolith/package.json \
      /opt/smart-router-monolith/tsconfig.json \
      /opt/smart-router-monolith/config \
      /opt/smart-router-monolith/kernel \
      /opt/smart-router-monolith/alpine-build/rootfs/opt/smart-router/

# Compilar SmartRouter dentro del chroot
chroot /opt/smart-router-monolith/alpine-build/rootfs /bin/sh -c \
    'export PATH=$PATH:/root/.bun/bin && cd /opt/smart-router && bun install && bun build ./src/index.ts --compile --outfile smart-router'

echo "✅ Rootfs creado con SmartRouter"
```

---

## FASE 4: Generar ISO Bootable (En N100 Alpine)

```bash
# Crear directorio para ISO
mkdir -p /opt/smart-router-monolith/alpine-build/iso-work/{boot,efi,live}

# Copiar kernel a ISO
cp /opt/smart-router-monolith/alpine-build/kernel/bzImage-n100-router \
   /opt/smart-router-monolith/alpine-build/iso-work/boot/vmlinuz

# Crear initramfs (opcional, para boot)
cd /opt/smart-router-monolith/alpine-build/rootfs
find . | cpio -H newc -o | xz -9 --format=lzma > \
    /opt/smart-router-monolith/alpine-build/iso-work/boot/initramfs.img

# Crear squashfs de rootfs
mksquashfs /opt/smart-router-monolith/alpine-build/rootfs \
    /opt/smart-router-monolith/alpine-build/iso-work/live/filesystem.squashfs \
    -comp xz

# Configurar GRUB
cat > /opt/smart-router-monolith/alpine-build/iso-work/boot/grub/grub.cfg << 'GRUB'
set timeout=5
set default=0

menuentry "Alpine Router N100 - Boot" {
    linux /boot/vmlinuz modules=loop,squashfs quiet nomodeset
    initrd /boot/initramfs.img
}

menuentry "Alpine Router N100 - Install" {
    linux /boot/vmlinuz modules=loop,squashfs quiet nomodeset alpine_dev=UUID=BOOT live_ram
    initrd /boot/initramfs.img
}
GRUB

# Generar ISO híbrido (BIOS + UEFI)
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "ALPINE-ROUTER" \
    -eltorito-boot boot/grub/eltorito.img \
    -eltorito-catalog boot/grub/boot.cat \
    -no-emul-boot \
    -boot-load-size 4 \
    -boot-info-table \
    -eltorito-alt-boot \
    -e boot/efi/bootx64.efi \
    -no-emul-boot \
    -isohybrid-mbr /usr/lib/ISOLINUX/isohdpx.bin \
    -isohybrid-gpt-basdat \
    -isohybrid-apm-hfsplus \
    -o /opt/smart-router-monolith/alpine-router-n100-$(date +%Y%m%d).iso \
    /opt/smart-router-monolith/alpine-build/iso-work

echo "✅ ISO generado: /opt/smart-router-monolith/alpine-router-n100-*.iso"
```

---

## FASE 5: Grabar a USB e Instalar en N100

```bash
# Identificar USB
lsblk

# Grabar ISO a USB (ASEGÚRATE de usar el dispositivo correcto)
dd if=/opt/smart-router-monolith/alpine-router-n100-*.iso \
   of=/dev/sdX bs=4M status=progress && sync

# Boot desde USB en N100
# En el primer boot, ejecutar:
setup-alpine  # Wizard interactivo

# O instalación manual:
setup-disk -m sys /dev/sda  # Instalar a disco

# Configurar servicios
rc-update add smartrouter default
rc-update add redis default
rc-update add unbound default

# Reboot y disfrutar
reboot
```

---

## NOTAS IMPORTANTES

1. **No usar scripts** - Ejecutar comandos individualmente
2. **Si falla un comando**, revisar:
   - `apk` lock: `rm -f /opt/smart-router-monolith/alpine-build/rootfs/var/lib/apk/db.solck`
   - `chroot` issues: Verificar que `/proc`, `/sys`, `/dev` estén montados
3. **Tiempo estimado**:
   - Kernel: ~60 min
   - Rootfs: ~30 min
   - ISO: ~15 min

---

## COMANDOS DE VERIFICACIÓN

```bash
# Verificar kernel compilado
ls -lh /opt/smart-router-monolith/alpine-build/kernel/bzImage-n100-router

# Verificar rootfs
ls -la /opt/smart-router-monolith/alpine-build/rootfs/opt/smart-router/

# Verificar ISO
ls -lh /opt/smart-router-monolith/alpine-router-n100-*.iso

# Ver procesos activos
ps aux | grep -E 'make|gcc|apk'

# Ver logs
tail -50 /tmp/build.log
tail -50 /tmp/kernel-build.log
```

---

**Fin del documento de referencia**
