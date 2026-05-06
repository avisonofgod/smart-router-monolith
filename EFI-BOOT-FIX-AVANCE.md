# Fix EFI Boot - Avance

## Fecha: 6 Mayo 2026

---

## Problema Original
La ISO compilada del proyecto smart-router-monolith NO booteaba en modo UEFI/EFI desde USB.
La ISO estándar de Alpine sí booteaba.

---

## Diagnóstico

### Problema 1: Scripts de ISO sin ESP válido
Los scripts anteriores (`alpine-iso.sh` y `alpine-iso-systemd-boot.sh`) no creaban correctamente
una EFI System Partition (ESP) dentro de la ISO:

- `alpine-iso-systemd-boot.sh` intentaba usar `-eltorito-boot EFI/BOOT/BOOTX64.EFI` directamente,
  pero UEFI requiere una imagen FAT (efi.img) que contenga el bootloader
- `alpine-iso.sh` tenía un efi.img pero el GRUB dentro no tenía `grub.cfg` embebido

### Problema 2: Kernel sin CONFIG_EFI_STUB
El kernel personalizado estaba compilado con `CONFIG_EFI=not set`.
systemd-boot requiere que el kernel sea un ejecutable EFI válido (EFI stub) para cargarlo.

**Antes:**
```
# CONFIG_EFI is not set
```

**Después:**
```
CONFIG_EFI=y
CONFIG_EFI_STUB=y
CONFIG_EFI_MIXED=y
```

---

## Correcciones Realizadas

### 1. Nuevo script de ISO: `scripts/alpine-iso-systemd-boot-fixed.sh`
- Crea un ESP (efi.img) FAT32 que contiene:
  - `/EFI/BOOT/BOOTX64.EFI` — systemd-boot (bootloader)
  - `/vmlinuz` — kernel compilado
  - `/initramfs.img` — initramfs con rootfs
  - `/loader/loader.conf` — config de systemd-boot
  - `/loader/entries/alpine-router.conf` — entrada Boot
  - `/loader/entries/alpine-install.conf` — entrada Install to Disk
- BIOS boot via syslinux/isolinux (fallback)
- ISO híbrido con `isohybrid-gpt-basdat` para dd directo a USB

### 2. Kernel recompilado con EFI_STUB
```bash
cd /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21
./scripts/config --enable CONFIG_EFI
./scripts/config --enable CONFIG_EFI_STUB
./scripts/config --enable CONFIG_EFI_MIXED
./scripts/config --enable CONFIG_EFI_HANDOVER_PROTOCOL
./scripts/config --enable CONFIG_FB_EFI
./scripts/config --enable CONFIG_EFI_VARS
./scripts/config --enable CONFIG_EFIVAR_FS
make olddefconfig
make -j4 bzImage
cp arch/x86/boot/bzImage ../bzImage-n100-router
```

Verificado: el nuevo bzImage reporta `64-bit EFI handoff entry point`

---

## Estado Actual
- [x] systemd-boot aparece en pantalla con menu (verificado en N100)
- [x] Kernel recompilado con CONFIG_EFI_STUB=y
- [x] ISO regenerada con kernel EFI y grabada a USB (alpine-router-n100-20260506-2220.iso)
- [ ] **PENDIENTE**: Prueba final de boot en N100 con kernel EFI_STUB

---

## Cómo regenerar la ISO

```bash
cd /opt/smart-router-monolith/scripts
bash alpine-iso-systemd-boot-fixed.sh
# Grabar a USB:
dd if=/opt/smart-router-monolith/alpine-router-n100-FECHA.iso of=/dev/sdb bs=4M status=progress && sync
```

---

## Estructura de la USB después del dd

| Partición | Tamaño | Tipo | Contenido |
|-----------|--------|------|-----------|
| sdb1 | ~280MB | ISO9660 | Datos ISO + syslinux (BIOS) |
| sdb2 | ~81MB | EFI (FAT32) | systemd-boot + kernel + initramfs |

---

## Archivos modificados/creados
- `scripts/alpine-iso-systemd-boot-fixed.sh` — Script de generación de ISO corregido
- `alpine-build/kernel/linux-6.12.21/.config` — Kernel config con EFI habilitado
- `alpine-build/kernel/bzImage-n100-router` — Kernel recompilado con EFI stub
- `EFI-BOOT-FIX-AVANCE.md` — Este documento
