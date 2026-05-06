#!/bin/bash
# alpine-iso-systemd-boot-fixed.sh
# ISO hibrido BIOS (syslinux) + UEFI (systemd-boot) para N100
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
OUTPUT_ISO="$SCRIPT_DIR/../alpine-router-n100-$(date +%Y%m%d-%H%M).iso"

echo "============================================"
echo "  Alpine Router ISO - systemd-boot UEFI"
echo "============================================"

ISO_DIR="$BUILD_DIR/iso-work"
rm -rf "$ISO_DIR"
mkdir -p "$ISO_DIR"/{boot/syslinux,live}

# ========== 1. Kernel ==========
echo "[1/7] Copiando kernel..."
if [ -f "$BUILD_DIR/kernel/bzImage-n100-router" ]; then
    cp "$BUILD_DIR/kernel/bzImage-n100-router" "$ISO_DIR/boot/vmlinuz"
else
    cp "$BUILD_DIR/rootfs/boot/vmlinuz-lts" "$ISO_DIR/boot/vmlinuz"
fi

# ========== 2. Initramfs ==========
echo "[2/7] Creando initramfs..."
cd "$BUILD_DIR/rootfs"
find . | cpio -H newc -o 2>/dev/null | xz -9 --format=lzma > "$ISO_DIR/boot/initramfs.img"

# ========== 3. Squashfs ==========
echo "[3/7] Creando squashfs..."
rm -f "$ISO_DIR/live/filesystem.squashfs"
mksquashfs "$BUILD_DIR/rootfs" "$ISO_DIR/live/filesystem.squashfs" -comp xz -noappend

# ========== 4. BIOS boot (syslinux) ==========
echo "[4/7] Configurando BIOS boot (syslinux)..."
cp /usr/share/syslinux/isolinux.bin "$ISO_DIR/boot/syslinux/"
cp /usr/share/syslinux/ldlinux.c32  "$ISO_DIR/boot/syslinux/"
for f in menu.c32 libutil.c32; do
    [ -f "/usr/share/syslinux/$f" ] && cp "/usr/share/syslinux/$f" "$ISO_DIR/boot/syslinux/"
done

cat > "$ISO_DIR/boot/syslinux/syslinux.cfg" << 'SYSLINUX'
PROMPT 1
TIMEOUT 50
DEFAULT boot

LABEL boot
    MENU LABEL Alpine Router N100 - Boot
    KERNEL /boot/vmlinuz
    APPEND initrd=/boot/initramfs.img modules=loop,squashfs quiet nomodeset

LABEL install
    MENU LABEL Alpine Router N100 - Install to Disk
    KERNEL /boot/vmlinuz
    APPEND initrd=/boot/initramfs.img modules=loop,squashfs quiet nomodeset alpine_dev=UUID=BOOT live_ram
SYSLINUX

# ========== 5. Crear efi.img con systemd-boot ==========
echo "[5/7] Creando ESP (efi.img) con systemd-boot..."

# Calcular tamano necesario: kernel + initramfs + bootloader + configs + margen
VMLINUZ_SIZE=$(stat -c%s "$ISO_DIR/boot/vmlinuz")
INITRAMFS_SIZE=$(stat -c%s "$ISO_DIR/boot/initramfs.img")
BOOTLOADER_SIZE=$(stat -c%s /usr/lib/systemd/boot/efi/systemd-bootx64.efi)
# Sumar todo + 5MB de margen para FAT overhead
TOTAL_BYTES=$((VMLINUZ_SIZE + INITRAMFS_SIZE + BOOTLOADER_SIZE + 5*1024*1024))
# Redondear a MB
EFI_IMG_MB=$(( (TOTAL_BYTES / 1048576) + 1 ))

echo "   Kernel:     $((VMLINUZ_SIZE/1024/1024))MB"
echo "   Initramfs:  $((INITRAMFS_SIZE/1024/1024))MB"
echo "   ESP total:  ${EFI_IMG_MB}MB"

dd if=/dev/zero of="$ISO_DIR/efi.img" bs=1M count=$EFI_IMG_MB 2>/dev/null
mkfs.fat -F 32 -n "EFISYS" "$ISO_DIR/efi.img" >/dev/null 2>&1

# Crear estructura de directorios en la imagen FAT
mmd -i "$ISO_DIR/efi.img" ::/EFI
mmd -i "$ISO_DIR/efi.img" ::/EFI/BOOT
mmd -i "$ISO_DIR/efi.img" ::/loader
mmd -i "$ISO_DIR/efi.img" ::/loader/entries

# Copiar systemd-boot como bootloader EFI por defecto
mcopy -i "$ISO_DIR/efi.img" /usr/lib/systemd/boot/efi/systemd-bootx64.efi ::/EFI/BOOT/BOOTX64.EFI

# Copiar kernel e initramfs al ESP
mcopy -i "$ISO_DIR/efi.img" "$ISO_DIR/boot/vmlinuz" ::/vmlinuz
mcopy -i "$ISO_DIR/efi.img" "$ISO_DIR/boot/initramfs.img" ::/initramfs.img

# ========== 6. Configuracion systemd-boot ==========
echo "[6/7] Escribiendo configuracion systemd-boot..."

# loader.conf
cat > /tmp/loader.conf << 'LOADER'
timeout 5
default alpine-router.conf
editor no
LOADER
mcopy -i "$ISO_DIR/efi.img" /tmp/loader.conf ::/loader/loader.conf

# Entry: Boot
cat > /tmp/alpine-router.conf << 'ENTRY'
title   Alpine Router N100 - Boot
linux   /vmlinuz
initrd  /initramfs.img
options modules=loop,squashfs quiet nomodeset
ENTRY
mcopy -i "$ISO_DIR/efi.img" /tmp/alpine-router.conf ::/loader/entries/alpine-router.conf

# Entry: Install
cat > /tmp/alpine-install.conf << 'ENTRY2'
title   Alpine Router N100 - Install to Disk
linux   /vmlinuz
initrd  /initramfs.img
options modules=loop,squashfs quiet nomodeset alpine_dev=UUID=BOOT live_ram
ENTRY2
mcopy -i "$ISO_DIR/efi.img" /tmp/alpine-install.conf ::/loader/entries/alpine-install.conf

echo "   systemd-boot configurado en ESP"

# Verificar contenido del ESP
echo "   Contenido del ESP:"
mdir -i "$ISO_DIR/efi.img" ::/EFI/BOOT/
mdir -i "$ISO_DIR/efi.img" ::/loader/entries/

# ========== 7. Generar ISO hibrido ==========
echo "[7/7] Generando ISO hibrido (BIOS + UEFI)..."
xorriso -as mkisofs \
    -iso-level 3 \
    -full-iso9660-filenames \
    -volid "ALPINE-ROUTER" \
    -isohybrid-mbr /usr/share/syslinux/isohdpfx.bin \
    -eltorito-boot boot/syslinux/isolinux.bin \
    -eltorito-catalog boot/syslinux/boot.cat \
    -no-emul-boot \
    -boot-load-size 4 \
    -boot-info-table \
    -eltorito-alt-boot \
    -e efi.img \
    -no-emul-boot \
    -isohybrid-gpt-basdat \
    -output "$OUTPUT_ISO" \
    "$ISO_DIR"

echo ""
echo "============================================"
echo "  ISO generada exitosamente!"
echo "============================================"
echo "  Archivo: $OUTPUT_ISO"
echo "  Tamano:  $(ls -lh "$OUTPUT_ISO" | awk '{print $5}')"
echo ""
echo "  Boot soportado:"
echo "    BIOS  -> syslinux/isolinux"
echo "    UEFI  -> systemd-boot (ESP embebido)"
echo "    USB   -> isohybrid (dd directo)"
echo ""
echo "  Para grabar a USB:"
echo "    dd if=$OUTPUT_ISO of=/dev/sdX bs=4M status=progress && sync"
echo "============================================"
