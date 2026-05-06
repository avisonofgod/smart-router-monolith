#!/bin/bash
# Generar ISO bootable de Alpine Router para N100

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
OUTPUT_ISO="$SCRIPT_DIR/../alpine-router-n100-$(date +%Y%m%d-%H%M).iso"

echo "=== Generando ISO Bootable Alpine Router ==="

# Verificar que existe el rootfs
if [ ! -d "$BUILD_DIR/rootfs" ]; then
    echo "Error: No existe rootfs en $BUILD_DIR/rootfs"
    echo "Ejecuta primero: ./scripts/alpine-rootfs.sh"
    exit 1
fi

# Crear directorio para ISO
ISO_DIR="$BUILD_DIR/iso-work"
rm -rf "$ISO_DIR"
mkdir -p "$ISO_DIR"/{boot,efi,live}

echo "Preparando archivos para ISO..."

# Copiar kernel (usar el compilado o el de Alpine)
if [ -f "$BUILD_DIR/kernel/bzImage-n100-router" ]; then
    cp "$BUILD_DIR/kernel/bzImage-n100-router" "$ISO_DIR/boot/vmlinuz"
    echo "Usando kernel personalizado"
else
    cp "$BUILD_DIR/rootfs/boot/vmlinuz-lts" "$ISO_DIR/boot/vmlinuz"
    echo "Usando kernel Alpine LTS"
fi

# Crear initramfs
echo "Creando initramfs..."
cd "$BUILD_DIR/rootfs"
find . | cpio -H newc -o | xz -9 --format=lzma > "$ISO_DIR/boot/initramfs.img"

# Crear squashfs de rootfs
echo "Creando squashfs..."
mksquashfs "$BUILD_DIR/rootfs" "$ISO_DIR/live/filesystem.squashfs" -comp xz

# Configurar bootloaders
mkdir -p "$ISO_DIR/boot/grub"

# GRUB config para BIOS y UEFI
cat > "$ISO_DIR/boot/grub/grub.cfg" << 'GRUB'
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

# Crear ISO híbrido (BIOS + UEFI)
echo "Generando ISO..."
sudo xorriso -as mkisofs \
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
    -isohybrid-mbr /usr/lib/ISOLINUX/isohdpfx.bin \
    -isohybrid-gpt-basdat \
    -isohybrid-apm-hfsplus \
    -o "$OUTPUT_ISO" \
    "$ISO_DIR"

echo "✅ ISO generado: $OUTPUT_ISO"
echo ""
echo "Para escribir a USB:"
echo "  dd if=$OUTPUT_ISO of=/dev/sdX bs=4M status=progress && sync"
echo ""
echo "Para probar en QEMU:"
echo "  qemu-system-x86_64 -m 512 -cdrom $OUTPUT_ISO -boot d -netdev user,id=net0 -device e1000,netdev=net0"
