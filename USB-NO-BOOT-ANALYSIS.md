# Análisis: USB no aparece en BIOS - Plan de Corrección

## Goal
Analizar por qué el USB con la ISO Alpine Router N100 no aparece en el BIOS y no bootea. Crear plan paso a paso para corregirlo.

## 1. Diagnóstico Actual

### ✅ Lo que SÍ funciona:
- ISO generada: `alpine-router-n100-systemd-20260506-1727.iso` (199MB)
- `file` muestra: "ISO 9660 CD-ROM filesystem data (DOS/MBR boot sector) 'ALPINE-ROUTER' (bootable)"
- MBR tiene firma `0x55AA` ✅
- El Torito boot catalog presente ✅
- `/EFI/BOOT/BOOTX64.EFI` incluido ✅

### ❌ Lo que NO funciona:
- USB **no aparece** en BIOS boot menu
- Si bootea, **no arranca** (GRUB cae a línea de comandos)
- `fdisk -l /dev/sdb` muestra particiones viejas (de ISO anterior)

---

## 2. Análisis de Causa Raíz

### Problema #1: La BIOS del N100 puede estar en modo **Legacy/CSM**
Nuestra ISO está optimizada para **UEFI-only** (systemd-boot). Si la BIOS está en modo Legacy, no detectará el USB.

**Evidencia**:
```bash
# En N100 (actual):
cat /sys/firmware/efi  # Si existe → UEFI mode
# Si no existe → Legacy BIOS mode
```

### Problema #2: El USB tiene tabla de particiones vieja
`fdisk` muestra:
```
Device  Boot StartCHS    EndCHS        StartLBA     EndLBA    Sectors  Size Id Type
/dev/sdb1 *  0,0,1       208,63,32            0     407551     407552  199M  0 Empty
/dev/sdb2    1023,254,63 1023,254,63        136        528        393  196K ef EFI (FAT-12/16/32)
```
Esto indica que el USB **no se escribió correctamente** o el sistema está cacheando la tabla de particiones vieja.

### Problema #3: Falta soporte híbrido BIOS+UEFI
La ISO tiene `MBR isohybrid cyl-align-on GPT`, pero puede que no sea compatible con BIOS Legacy.

---

## 3. Plan de Corrección (3 Opcciones)

### Opción A: Verificar BIOS y Crear ISO Híbrida (Recomendada)

#### Paso 1: Verificar configuración de BIOS en N100
```
1. Reiniciar N100
2. Entrar a BIOS (F2 o Del)
3. Boot → Boot Mode: Cambiar a "UEFI Only" (no "Legacy" ni "CSM")
4. Security → Secure Boot: Disabled
5. Boot → USB Boot: Enabled
6. Boot → Fast Boot: Disabled
7. Save & Exit (F10)
```

#### Paso 2: Crear ISO verdaderamente híbrida (BIOS + UEFI)
```bash
# En N100, recrear ISO con soporte para AMBOS modos:
cat > /opt/smart-router-monolith/scripts/alpine-iso-hybrid.sh << 'EOF'
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
OUTPUT_ISO="$SCRIPT_DIR/../alpine-router-hybrid-$(date +%Y%m%d-%H%M).iso"

ISO_DIR="$BUILD_DIR/iso-work"
rm -rf "$ISO_DIR"
mkdir -p "$ISO_DIR"/{boot/grub,boot/syslinux,live,EFI/BOOT}

# Kernel
[ -f "$BUILD_DIR/kernel/bzImage-n100-router" ] && cp "$BUILD_DIR/kernel/bzImage-n100-router" "$ISO_DIR/boot/vmlinuz" || cp "$BUILD_DIR/rootfs/boot/vmlinuz-lts" "$ISO_DIR/boot/vmlinuz"

# Initramfs y squashfs
cd "$BUILD_DIR/rootfs"
find . | cpio -H newc -o | xz -9 --format=lzma > "$ISO_DIR/boot/initramfs.img"
mksquashfs "$BUILD_DIR/rootfs" "$ISO_DIR/live/filesystem.squashfs" -comp xz

# SYSLINUX (para BIOS Legacy)
cp /usr/share/syslinux/isolinux.bin "$ISO_DIR/boot/syslinux/"
cp /usr/share/syslinux/ldlinux.c32 "$ISO_DIR/boot/syslinux/"
cp /usr/share/syslinux/menu.c32 "$ISO_DIR/boot/syslinux/"
cp /usr/share/syslinux/libutil.c32 "$ISO_DIR/boot/syslinux/"
cat > "$ISO_DIR/boot/syslinux/syslinux.cfg" << 'SYSLINUX'
UI menu.c32
PROMPT 0
TIMEOUT 50
MENU TITLE Alpine Router N100
LABEL boot
    MENU LABEL Boot Alpine Router
    KERNEL /boot/vmlinuz
    APPEND initrd=/boot/initramfs.img modules=loop,squashfs quiet nomodeset
LABEL install
    MENU LABEL Install to Disk
    KERNEL /boot/vmlinuz
    APPEND initrd=/boot/initramfs.img modules=loop,squashfs alpine_dev=UUID=BOOT live_ram
SYSLINUX

# GRUB (para UEFI)
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

# EFI boot (systemd-boot o GRUB EFI)
mkdir -p "$ISO_DIR/EFI/BOOT"
cp /usr/lib/systemd/boot/efi/systemd-bootx64.efi "$ISO_DIR/EFI/BOOT/BOOTX64.EFI" 2>/dev/null || \
cp /usr/share/syslinux/efi64/syslinux.efi "$ISO_DIR/EFI/BOOT/BOOTX64.EFI" 2>/dev/null || true
echo "configfile /boot/grub/grub.cfg" > "$ISO_DIR/EFI/BOOT/grub.cfg"

# Crear imagen EFI para El Torito
dd if=/dev/zero of=/tmp/efi.img bs=1M count=4 2>/dev/null
mkfs.vfat /tmp/efi.img 2>/dev/null
mkdir -p /tmp/efi-mount
mount -o loop /tmp/efi.img /tmp/efi-mount 2>/dev/null
mkdir -p /tmp/efi-mount/EFI/BOOT
cp "$ISO_DIR/EFI/BOOT/BOOTX64.EFI" /tmp/efi-mount/EFI/BOOT/ 2>/dev/null || true
cp "$ISO_DIR/EFI/BOOT/grub.cfg" /tmp/efi-mount/EFI/BOOT/ 2>/dev/null || true
umount /tmp/efi-mount 2>/dev/null || true
cp /tmp/efi.img "$ISO_DIR/boot/grub/efi.img"

echo "Generando ISO híbrida (BIOS + UEFI)..."
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
    -e boot/grub/efi.img \
    -no-emul-boot \
    -isohybrid-gpt-basdat \
    -output "$OUTPUT_ISO" \
    "$ISO_DIR"

echo "=== ISO generada: $OUTPUT_ISO ==="
ls -lh "$OUTPUT_ISO"
EOF
chmod +x /opt/smart-router-monolith/scripts/alpine-iso-hybrid.sh
```

#### Paso 3: Escribir USB correctamente (limpiar primero)
```bash
# Limpiar los primeros 1MB del USB (eliminar tabla de particiones vieja)
dd if=/dev/zero of=/dev/sdb bs=1M count=1 2>&1
sync

# Escribir nueva ISO
dd if=/opt/smart-router-monolith/alpine-router-hybrid-*.iso of=/dev/sdb bs=4M 2>&1
sync

# Verificar que NO hay particiones
fdisk -l /dev/sdb  # Debería mostrar solo "Disk /dev/sdb" sin particiones
```

---

### Opción B: Usar Standard Alpine ISO (Probar hardware)

```bash
# Descargar ISO estándar de Alpine
cd /tmp
wget https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-standard-3.20.2-x86_64.iso

# Escribir a USB
dd if=alpine-standard-3.20.2-x86_64.iso of=/dev/sdb bs=4M
sync

# Probar si APARECE EN BIOS
# Si aparece → El hardware funciona, nuestro ISO tiene el problema
# Si NO aparece → Problema de BIOS o hardware
```

---

### Opción C: Crear USB booteable manualmente (FAT32 + syslinux)

```bash
# 1. Crear partición bootable en USB
fdisk /dev/sdb  # Crear partición 1, tipo FAT32, flag boot
mkfs.vfat /dev/sdb1
mount /dev/sdb1 /mnt/usb

# 2. Copiar kernel e initramfs
mkdir -p /mnt/usb/boot/syslinux
cp /boot/vmlinuz-n100-router /mnt/usb/boot/
cp /boot/initramfs.img /mnt/usb/boot/

# 3. Instalar syslinux
cp /usr/share/syslinux/isolinux.bin /mnt/usb/boot/syslinux/
cp /usr/share/syslinux/ldlinux.c32 /mnt/usb/boot/syslinux/
cat > /mnt/usb/boot/syslinux/syslinux.cfg << 'EOF'
DEFAULT lts
LABEL lts
  KERNEL /boot/vmlinuz-n100-router
  INITRD /boot/initramfs.img
  APPEND modules=loop,squashfs quiet nomodeset
EOF

# 4. Instalar MBR
syslinux /dev/sdb1
dd if=/usr/share/syslinux/mbr.bin of=/dev/sdb

umount /mnt/usb
# Este USB debería aparecer en BIOS Legacy
```

---

## 4. Ejecución (Inmediata)

Voy a ejecutar **Opción A** (crear ISO híbrida) y **Opción B** (probar con Alpine estándar).

### Paso 1: Crear ISO híbrida completa
```bash
cd /opt/smart-router-monolith
bash scripts/alpine-iso-hybrid.sh
```

### Paso 2: Limpiar y escribir USB
```bash
dd if=/dev/zero of=/dev/sdb bs=1M count=1
dd if=alpine-router-hybrid-*.iso of=/dev/sdb bs=4M
sync
fdisk -l /dev/sdb  # Verificar que no hay particiones viejas
```

### Paso 3: Probar con Alpine estándar (si lo anterior falla)
```bash
wget https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-standard-3.20.2-x86_64.iso -O /tmp/alpine-std.iso
dd if=/tmp/alpine-std.iso of=/dev/sdb bs=4M
sync
# Reiniciar N100 y ver si aparece en BIOS
```

---

## 5. Resumen

| Problema | Causa Probable | Solución |
|---------|-------------------|----------|
| USB no aparece en BIOS | BIOS en modo Legacy, ISO es UEFI-only | Cambiar BIOS a "UEFI Only" |
| USB no bootea | Falta soporte híbrido BIOS+UEFI | Crear ISO con `-eltorito-boot boot/syslinux/isolinux.bin` |
| Tabla de particiones vieja | `dd` no sobreescribió el inicio | Limpiar con `dd if=/dev/zero of=/dev/sdb bs=1M count=1` |
| GRUB cae a línea de comandos | Falta `/boot/grub/grub.cfg` o `/EFI/BOOT/BOOTX64.EFI` | Verificar EFI structure |

**Siguiente paso**: Ejecutar Opción A y verificar.