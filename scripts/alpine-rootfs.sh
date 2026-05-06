#!/bin/bash
# Crear rootfs Alpine personalizado con todos los paquetes preinstalados

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
ROOTFS="$BUILD_DIR/rootfs"

echo "=== Creando Alpine Rootfs Personalizado ==="

# Crear directorio rootfs
mkdir -p "$ROOTFS"

# Descargar alpine-chroot-install si no existe
if [ ! -f "$BUILD_DIR/alpine-chroot-install" ]; then
    wget -O "$BUILD_DIR/alpine-chroot-install" \
        https://raw.githubusercontent.com/alpinelinux/alpine-chroot-install/master/alpine-chroot-install
    chmod +x "$BUILD_DIR/alpine-chroot-install"
fi

# Crear script de instalación dentro del chroot
cat > "$BUILD_DIR/setup-rootfs.sh" << 'EOF'
#!/bin/sh
# Este script se ejecuta dentro del chroot Alpine

# Configurar repositorios
cat > /etc/apk/repositories << REPOS
https://dl-cdn.alpinelinux.org/alpine/v3.23/main
https://dl-cdn.alpinelinux.org/alpine/v3.23/community
REPOS

# Actualizar e instalar paquetes base
apk update

# Paquetes esenciales para router
apk add \
    alpine-base \
    openrc \
    busybox \
    busybox-initscripts \
    syslinux \
    grub \
    grub-efi \
    linux-lts \
    linux-firmware-none \
    tzdata \
    nano \
    bash \
    curl \
    wget

# Paquetes de red y routing
apk add \
    iproute2 \
    iproute2-tc \
    nftables \
    iptables \
    ip6tables \
    wireguard-tools \
    dhcp-server \
    dhcpcd \
    dnsmasq \
    hostapd

# PPPoE y accel-ppp
apk add \
    ppp \
    ppp-chat \
    rp-pppoe

# DNS y seguridad
apk add \
    unbound \
    bind-tools \
    openssl \
    ca-certificates

# Redis y base de datos
apk add \
    redis

# Utilidades
apk add \
    logrotate \
    cron \
    dcron \
    rsync \
    tar \
    xz \
    zip \
    unzip

# Tailscale (instalar desde script oficial)
curl -fsSL https://tailscale.com/install.sh | sh

# Bun (runtime para SmartRouter)
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# Crear directorio para SmartRouter
mkdir -p /opt/smart-router

# Copiar código desde host (se hará fuera del chroot)
echo "Rootfs base preparado. Copiar SmartRouter manualmente."

# Limpiar caché
rm -rf /var/cache/apk/*

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
rc-update add unbound default

echo "✅ Rootfs configurado"
EOF

chmod +x "$BUILD_DIR/setup-rootfs.sh"

# Crear rootfs usando alpine-chroot-install
"$BUILD_DIR/alpine-chroot-install" \
    -d "$ROOTFS" \
    -s "$BUILD_DIR/setup-rootfs.sh" \
    -m v3.23 \
    -a x86_64

echo "✅ Rootfs creado en $ROOTFS"
echo "Siguiente paso: Copiar SmartRouter a $ROOTFS/opt/smart-router"
