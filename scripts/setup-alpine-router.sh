#!/bin/bash
# Instalador de Alpine Router para N100
# Se ejecuta después de bootear desde USB/ISO

set -e

echo "=========================================="
echo " Alpine Router - Instalador para N100"
echo "=========================================="
echo ""

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: Ejecutar como root"
    exit 1
fi

# Detectar disco de destino
echo "Discos disponibles:"
lsblk -d -o NAME,SIZE,TYPE | grep disk
echo ""
read -p "Disco de destino (ej: /dev/sda): " TARGET_DISK

if [ ! -b "$TARGET_DISK" ]; then
    echo "Error: $TARGET_DISK no es un bloque válido"
    exit 1
fi

echo ""
echo "⚠️  ADVERTENCIA: Se borrará todo el contenido de $TARGET_DISK"
read -p "¿Continuar? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelado."
    exit 0
fi

# Particionar disco
echo "Particionando $TARGET_DISK..."
fdisk "$TARGET_DISK" << FDISK
g
n
1
2048
+512M
n
2

+4G
n
3


w
FDISK

# Formatear particiones
echo "Formateando particiones..."
mkfs.vfat -F 32 "${TARGET_DISK}1"
mkswap "${TARGET_DISK}2"
mkfs.ext4 "${TARGET_DISK}3"

# Montar y copiar sistema
echo "Copiando sistema..."
mount "${TARGET_DISK}3" /mnt
mkdir -p /mnt/boot
mount "${TARGET_DISK}1" /mnt/boot

# Copiar rootfs
cp -a /media/*/live/filesystem.squashfs /tmp/
unsquashfs -f -d /mnt /tmp/filesystem.squashfs

# Configurar fstab
cat > /mnt/etc/fstab << FSTAB
${TARGET_DISK}3 / ext4 defaults 0 1
${TARGET_DISK}1 /boot vfat defaults 0 2
${TARGET_DISK}2 none swap sw 0 0
tmpfs /tmp tmpfs defaults 0 0
FSTAB

# Instalar bootloader
echo "Instalando GRUB..."
mount --bind /dev /mnt/dev
mount --bind /proc /mnt/proc
mount --bind /sys /mnt/sys
chroot /mnt grub-install "$TARGET_DISK"
chroot /mnt grub-mkconfig -o /boot/grub/grub.cfg

# Configurar red
cat > /mnt/etc/network/interfaces << NET
auto lo
iface lo inet loopback

# LAN (eth0)
auto eth0
iface eth0 inet static
    address 192.168.10.1
    netmask 255.255.255.0

# WAN1 (eth1)
auto eth1
iface eth1 inet dhcp

# WAN2 (eth2) - opcional
#auto eth2
#iface eth2 inet dhcp
NET

# Habilitar servicios
chroot /mnt rc-update add smartrouter default
chroot /mnt rc-update add redis default
chroot /mnt rc-update add unbound default

# Desmontar
umount -R /mnt

echo ""
echo "✅ Instalación completada!"
echo ""
echo "Pasos siguientes:"
echo "1. Reiniciar: reboot"
echo "2. Remover USB/ISO"
echo "3. Acceder por SSH o consola"
echo "4. Configurar interfaces WAN en /etc/network/interfaces"
echo ""
echo "Dashboard disponible en: http://192.168.10.1:3000"
