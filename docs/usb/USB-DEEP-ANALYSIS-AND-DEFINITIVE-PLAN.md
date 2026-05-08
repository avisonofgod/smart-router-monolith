# Análisis Profundo: USB No Bootea - Plan Definitivo

## Goal
Resolver definitivamente que el USB con ISO Alpine Router N100 **no apareca en BIOS** y **no bootee**, identificando que el kernel mantiene cache de tabla de particiones vieja.

## 1. Diagnóstico Profundo

### 🔴 Problema Raíz
| Síntoma | Causa Raíz | Evidencia |
|---------|-------------|----------|
| USB no aparece en BIOS | Kernel cachea tabla de particiones vieja (dos) | `fdisk -l` muestra sdb1/sdb2 aunque escribimos ISO |
| `partprobe` no funciona | Device bloqueado por kernel | `blockdev --rereadpt` no limpia cache |
| `dd if=/dev/zero` no borra tabla | Metadatos en inicio/final del disco | MBR viejo persiste |
| BIOS ve "dos partition" | No ve ISO 9660 puro | `file -s /dev/sdb` dice ISO, pero BIOS no |

### 🔍 Por qué pasa esto?
1. **USB fue particionado anteriormente** (sdb1: 199M, sdb2: 196K EFI)
2. **Kernel cachea la tabla de particiones** en memoria
3. **Aunque escribamos ISO** (`dd if=ISO of=/dev/sdb`), el kernel sigue reportando las particiones viejas
4. **BIOS del N100** lee el inicio del USB → ve tabla "dos" → no reconoce ISO 9660

### 📊 Estado Actual del USB
```
Device  Boot StartCHS    EndCHS        StartLBA     EndLBA    Sectors  Size Id Type
/dev/sdb1 *  0,0,1       198,63,32            0     407551     407552  199M  0 Empty
/dev/sdb2    1023,254,63 1023,254,63        136        528        393  196K ef EFI (FAT-12/16/32)
```
Aunque `file -s /dev/sdb` diga "ISO 9660 CD-ROM", **la BIOS no lee el file command, lee el sector 0**.

---

## 2. Verificación de Kernel Config (EFI Stub, USB, FS)

### ✅ Configuraciones Requeridas para Boot UEFI + USB
| Config | Propósito | Status |
|--------|----------|--------|
| `CONFIG_EFI_STUB=y` | Kernel puede bootear directo como EFI app | ✅ Requerido |
| `CONFIG_EFI_STUB_CMDLINE=y` | Kernel acepta cmdline en EFI stub | ✅ Requerido |
| `CONFIG_EFI=y` | Soporte UEFI general | ✅ Requerido |
| `CONFIG_EFI_VARS=y` | Variables UEFI | ✅ Requerido |
| `CONFIG_EFI_PARAMS=y` | Parámetros UEFI | ✅ Requerido |
| `CONFIG_USB=y` | Soporte USB core | ✅ Requerido |
| `CONFIG_USB_XHCI_HCD=y` | Host controller xHCI (USB 3.0) | ✅ Requerido |
| `CONFIG_USB_EHCI_HCD=y` | Host controller eHCI (USB 2.0) | ✅ Requerido |
| `CONFIG_SCSI=y` | SCSI support (USB storage) | ✅ Requerido |
| `CONFIG_BLK_DEV_SD=y` | SCSI disk support | ✅ Requerido |
| `CONFIG_VFAT_FS=y` | FAT32 para EFI partition | ✅ Requerido |
| `CONFIG_FAT_FS=y` | FAT base | ✅ Requerido |
| `CONFIG_NLS_CODEPAGE_437=y` | Codepage para FAT | ✅ Requerido |
| `CONFIG_SECURE_BOOT=y` | Secure Boot (opcional) | ⚠️ No requerido |

### 📋 Comandos para verificar en N100 después de boot:
```bash
# Ver si kernel tiene EFI stub
zcat /proc/config.gz | grep CONFIG_EFI_STUB

# Ver si USB bootea
dmesg | grep -i "usb\|xhci\|ehci\|scsi"

# Ver particiones reales (después de reboot)
cat /proc/partitions
```

---

## 3. Plan Definitivo (3 Pasos)

### **Paso 1: Reiniciar N100 para liberar USB** 🔄
```bash
# En N100:
reboot
# Esperar que reinicie, SSH de nuevo
```

**Por qué?** El kernel tiene el device `/dev/sdb` en uso/cache. Solo un reboot libera completamente.

---

### **Paso 2: Escribir ISO con método "nuclear"** 💣
```bash
# Después de reboot, en N100:

# 1. Verificar que USB está limpio (sin particiones)
fdisk -l /dev/sdb
# Debería mostrar solo "Disk /dev/sdb" SIN particiones

# 2. Si AÚN tiene particiones, limpiar con wipefs
wipefs -a /dev/sdb  # Limpia metadatos de filesystems
dd if=/dev/zero of=/dev/sdb bs=1M count=1  # Limpia MBR
sync

# 3. Verificar que NO hay particiones
fdisk -l /dev/sdb | grep sdb[0-9]  # No debería mostrar nada

# 4. Escribir ISO FINAL (la que tiene systemd-boot)
dd if=/opt/smart-router-monolith/alpine-router-n100-systemd-20260506-1727.iso of=/dev/sdb bs=4M status=progress
sync

# 5. VERIFICACIÓN CRÍTICA:
# A) Ver que MBR es de ISO (no particionado)
dd if=/dev/sdb bs=512 count=1 2>/dev/null | od -A x -t x1 | head -1
# Debería mostrar: 000000 33 ed 90 90 ... (MBR de ISO)

# B) Ver que NO hay particiones
fdisk -l /dev/sdb | grep sdb[0-9]  # NO debería mostrar sdb1/sdb2

# C) Ver que ISO es bootable
file -s /dev/sdb  # Debería decir "ISO 9660 CD-ROM filesystem data (DOS/MBR boot sector)"
```

---

### **Paso 3: Si AÚN no aparece en BIOS → Usar Standard Alpine ISO** 📥
**Estrategia de respaldo**: Si nuestra ISO no funciona, usar la ISO estándar de Alpine para verificar que el **hardware SÍ funciona**.

```bash
# Descargar Alpine estándar
cd /tmp
wget https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-standard-3.20.2-x86_64.iso

# Escribir a USB
dd if=alpine-standard-3.20.2-x86_64.iso of=/dev/sdb bs=4M
sync

# Probar en BIOS
# Si ESTA ISO APARECE → Nuestra ISO tiene problema de estructura
# Si ESTA ISO NO APARECE → Problema de hardware/BIOS
```

---

## 4. Comparación: Nuestra ISO vs Standard Alpine

| Característica | Standard Alpine ISO | Nuestra ISO (systemd-1727) |
|----------------|----------------------|---------------------------|
| **MBR** | ✅ `33 ed 90 90 ...` (isohdpfx.bin) | ✅ Igual |
| **Boot signature** | ✅ `0x55AA` en byte 510 | ✅ Igual |
| **El Torito** | ✅ Boot catalog presente | ✅ Presente |
| **EFI/BOOT/** | ✅ `/EFI/BOOT/BOOTX64.EFI` | ✅ Presente |
| **SYSLINUX** | ✅ `/boot/syslinux/` | ✅ Presente |
| **Filesystem** | ISO 9660 + RockRidge | ISO 9660 + RockRidge |
| **BIOS Detection** | ✅ Aparece en BIOS | ❌ NO aparece |

**Diferencia crítica**: ⚠️ **Standard Alpine ISO se escribe SIN particiones previas**. Nuestra ISO se escribe SOBRE una tabla de particiones vieja.

---

## 5. Solución Final: Reinicio + Wipe + Write

### 📝 Script de ejecución (después de reboot):
```bash
#!/bin/bash
# cleanup-and-write.sh

echo "=== PASO 1: Limpiar USB completamente ==="
wipefs -a /dev/sdb 2>/dev/null
dd if=/dev/zero of=/dev/sdb bs=1M count=10 2>&1
sync

echo "=== PASO 2: Verificar que NO hay particiones ==="
fdisk -l /dev/sdb | grep sdb[0-9] && echo "ERROR: Aún hay particiones" || echo "✅ USB limpio"

echo "=== PASO 3: Escribir ISO FINAL ==="
dd if=/opt/smart-router-monolith/alpine-router-n100-systemd-20260506-1727.iso of=/dev/sdb bs=4M status=progress
sync

echo "=== PASO 4: Verificación ==="
echo "1. MBR:"
dd if=/dev/sdb bs=512 count=1 2>/dev/null | od -A x -t x1 | head -1
echo "2. Particiones (debería estar vacío):"
fdisk -l /dev/sdb | grep sdb[0-9] || echo "✅ Sin particiones"
echo "3. ISO type:"
file -s /dev/sdb

echo "=== LISTO PARA BOOTEAR EN N100 ==="
```

---

## 6. Documentación de Kernel (EFI Stub, USB, Boot)

### EFI Stub Boot (Kernel como EFI application)
```
CONFIG_EFI_STUB=y
- Permite que el kernel bootee directamente como una EFI application
- No requiere bootloader (GRUB/systemd-boot) técnicamente
- Se usa junto con UKI (Unified Kernel Image)

Uso en systemd-boot:
  /EFI/Linux/alpine-router-n100.efi (UKI = kernel + initramfs + cmdline)
```

### USB Boot Support
```
CONFIG_USB=y                    # USB core
CONFIG_USB_XHCI_HCD=y           # xHCI (USB 3.0) - común en N100
CONFIG_USB_EHCI_HCD=y           # eHCI (USB 2.0)
CONFIG_USB_STORAGE=y             # USB mass storage
CONFIG_SCSI=y                   # SCSI support
CONFIG_BLK_DEV_SD=y             # SCSI disk support
```

### Filesystem para EFI
```
CONFIG_FAT_FS=y                  # FAT base
CONFIG_VFAT_FS=y                 # VFAT (FAT32) para EFI partition
CONFIG_NLS_CODEPAGE_437=y        # CP437 para FAT
CONFIG_NLS_ISO8859_1=y          # Latin1
```

### Flat Boot (sin initramfs)
```
CONFIG_BLK_DEV_INITRD=y          # initramfs support
CONFIG_RD_GZIP=y                 # gzip initramfs
CONFIG_RD_XZ=y                   # xz initramfs (nuestro caso)
```

---

## 7. Next Steps (Ejecutar Ahora)

1. ✅ **Commit y push** de toda la documentación
2. 🔄 **Reiniciar N100** para liberar USB
3. 💣 **Limpiar USB** con `wipefs -a` + `dd if=/dev/zero`
4. 📥 **Escribir ISO** `alpine-router-n100-systemd-20260506-1727.iso`
5. ✅ **Verificar** que NO hay particiones (`fdisk -l /dev/sdb`)
6. 🔍 **Probar en BIOS** - debería aparecer
7. ⚠️ **Si falla** → `wget alpine-standard.iso` y probar ISO estándar

---

## 8. Estado Final

| Item | Status | Notas |
|------|--------|-------|
| **Kernel config** | ✅ Listo | EFI stub, USB, VFAT, etc. |
| **ISO generada** | ✅ | `systemd-20260506-1727.iso` (199MB) |
| **USB escrito** | ❌ | Kernel cachea tabla vieja |
| **BIOS aparece** | ❌ | Requiere reboot + wipe |
| **Doc completa** | ✅ | Todo documentado aquí |
| **GitHub push** | ⚠️ Pendiente | Commit después de reboot |

**Siguiente paso**: Reiniciar N100 → Limpiar USB → Escribir ISO → Verificar que NO hay particiones → Boot!