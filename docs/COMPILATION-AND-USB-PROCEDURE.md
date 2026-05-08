# SmartRouter N100 - Compilation and USB Procedure

## Overview
This document describes the step-by-step process to compile the custom kernel, build the bootable ISO, and prepare the USB stick for booting the N100 router.

---

## Prerequisites on N100 (Alpine Linux)

```bash
# Update repositories and install required packages
apk update
apk add build-base ncurses-dev bison flex openssl-dev \
        xz lz4 zstd bzip2 gzip \
        xorriso syslinux systemd mtools \
        squashfs-tools cpio
```

---

## 1. Kernel Compilation

### 1.1 Kernel Source and Config
- Kernel source: `/opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21`
- Base config: `/opt/smart-router-monolith/kernel/n100-router-alpine.config`

### 1.2 Apply Configuration
```bash
cd /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21
cp /opt/smart-router-monolith/kernel/n100-router-alpine.config .config
make olddefconfig
```

### 1.3 Verify Essential Options
```bash
grep CONFIG_EFI_STUB .config                # Should be =y
grep CONFIG_BLK_DEV_INITRD .config          # Should be =y
grep CONFIG_RD_GZIP .config                # Should be =y
grep CONFIG_SQUASHFS .config               # Should be =y
grep CONFIG_LOOP .config                   # Should be =y
grep CONFIG_USB .config                    # Should be =y
grep CONFIG_USB_XHCI_HCD .config          # Should be =y
grep CONFIG_VFAT_FS .config               # Should be =y
```

### 1.4 Enable INITRD and Compression (if missing)
```bash
cd /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21
./scripts/config --enable CONFIG_BLK_DEV_INITRD
./scripts/config --enable CONFIG_RD_GZIP
./scripts/config --enable CONFIG_RD_BZIP2
./scripts/config --enable CONFIG_RD_LZMA
./scripts/config --enable CONFIG_RD_XZ
./scripts/config --enable CONFIG_RD_LZO
./scripts/config --enable CONFIG_RD_LZ4
./scripts/config --enable CONFIG_RD_ZSTD
make olddefconfig
```

### 1.5 Compile Kernel
```bash
cd /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21
make -j4 bzImage
```
- Expected time: ~60 minutes on N100 with `make -j4`
- Output: `arch/x86/boot/bzImage`

### 1.6 Install Kernel
```bash
cp /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21/arch/x86/boot/bzImage \
   /opt/smart-router-monolith/alpine-build/kernel/bzImage-n100-router
```

---

## 2. Build Rootfs and SmartRouter

### 2.1 Prepare Alpine Rootfs
```bash
cd /opt/smart-router-monolith/alpine-build
# (Assuming rootfs already exists, otherwise create with Alpine minirootfs)
# Install packages inside rootfs (if not done):
chroot rootfs /bin/sh -c "apk add openrc busybox-suid e2fsprogs util-linux usbutils pciutils"
```

### 2.2 Compile SmartRouter
```bash
cd /opt/smart-router-monolith
# (Assuming SmartRouter is already compiled and placed in rootfs)
# If not, compile and copy:
# ... (compile steps)
```

### 2.3 Create Init Script
Ensure `/init` script exists in rootfs (see repository for example).

### 2.4 Create Initramfs (inside rootfs)
```bash
cd /opt/smart-router-monolith/alpine-build/rootfs
find . | cpio -H newc -o 2>/dev/null | gzip -9 > /tmp/initramfs.img
```

---

## 3. ISO Generation

### 3.1 Use the Build Script
Script: `/opt/smart-router-monolith/scripts/alpine-iso-systemd-boot-fixed.sh`

```bash
cd /opt/smart-router-monolith/scripts
bash alpine-iso-systemd-boot-fixed.sh
```

### 3.2 What the Script Does
1. Copies kernel to `iso-work/boot/vmlinuz`
2. Creates initramfs (gzip compressed) to `iso-work/boot/initramfs.img`
3. Creates squashfs from rootfs to `iso-work/live/filesystem.squashfs`
4. Sets up BIOS boot (syslinux) in `iso-work/boot/syslinux/`
5. Creates EFI system partition image (`efi.img`) with:
   - systemd-boot as `EFI/BOOT/BOOTX64.EFI`
   - Kernel and initramfs copied into ESP
   - systemd-boot configuration (`loader.conf`, boot entries)
6. Generates hybrid ISO with `xorriso`:
   - MBR boot code (isohdpfx.bin)
   - El Torito boot catalog
   - EFI boot image (efi.img)
   - ISO 9660 filesystem

### 3.3 Output
- ISO file: `/opt/smart-router-monolith/alpine-router-n100-YYYYMMDD-HHMM.iso`
- Size: ~426MB (with gzip initramfs)

---

## 4. USB Preparation

### 4.1 Identify USB Device
```bash
fdisk -l
# Look for USB stick, e.g., /dev/sdb (NOT /dev/sda or other disks!)
```

**WARNING**: Double-check the device name. Writing to the wrong disk will destroy data.

### 4.2 Wipe USB (Optional but Recommended)
```bash
# Wipe beginning (MBR and partition table)
dd if=/dev/zero of=/dev/sdb bs=1M count=10
sync

# Wipe backup GPT at end of disk (if any)
# Calculate last sectors (optional, dd may fail if disk smaller)
# Simpler: wipe entire disk (takes longer)
# dd if=/dev/zero of=/dev/sdb bs=1M status=progress
```

### 4.3 Write ISO to USB
```bash
dd if=/opt/smart-router-monolith/alpine-router-n100-YYYYMMDD-HHMM.iso of=/dev/sdb bs=4M
sync
echo "USB written successfully"
```

### 4.4 Verify USB
```bash
fdisk -l /dev/sdb
# Should show:
# - Disk /dev/sdb: ... bytes, ... sectors
# - Device     Boot Start... Type
#   /dev/sdb1  *       ... Empty (or EFI)
#   /dev/sdb2          ... EFI (FAT-12/16/32)
```

---

## 5. N100 BIOS/UEFI Configuration

1. Power on N100, press `Del` or `F2` to enter BIOS.
2. Go to **Boot** tab:
   - Set **Boot Mode** to `UEFI Only` (disable Legacy/CSM).
   - Disable **Secure Boot**.
   - Enable **USB Boot**.
   - Disable **Fast Boot** (optional, for debugging).
3. Save and exit (`F10`).

---

## 6. Boot from USB

1. Insert USB stick into N100.
2. Power on, press `F12` (or `Esc`) to show boot menu.
3. Select the USB device (may appear as "UEFI: USB Storage" or similar).
4. Systemd-boot menu should appear with options:
   - `Alpine Router N100 - Boot`
   - `Alpine Router N100 - Install to Disk`
5. Select first option, press Enter.
6. Kernel should load, initramfs unpack, and eventually show login prompt:
   ```
   alpine-router login:
   ```

---

## 7. Troubleshooting

### 7.1 Kernel Panic "Cannot open root device"
- Ensure `CONFIG_BLK_DEV_INITRD=y` is set in kernel config.
- Ensure initramfs is gzip compressed (not LZMA if kernel lacks CONFIG_RD_LZMA).
- Verify initramfs is included in the ISO (check `iso-work/boot/initramfs.img`).

### 7.2 USB Not Recognized in BIOS
- Verify ISO written correctly (check with `fdisk -l /dev/sdb`).
- Try different USB port (USB 2.0 vs 3.0).
- Re‑create ISO with `xorriso` ensuring `-isohybrid-gpt-basdat` flag.
- Test with standard Alpine ISO to rule out hardware issues.

### 7.3 Black Screen After Boot
- Add `nomodeset` to kernel cmdline (already in script).
- Ensure `CONFIG_FB_EFI=y` and `CONFIG_DRM_SIMPLEDRM=y` in kernel.
- Try `acpi=off` if ACPI errors occur (already in script).

---

## 8. Files and Locations

| File | Location | Description |
|------|----------|-------------|
| Kernel source | `/opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21/` | Kernel 6.12.21 source |
| Kernel config | `/opt/smart-router-monolith/kernel/n100-router-alpine.config` | Base kernel config |
| Compiled kernel | `/opt/smart-router-monolith/alpine-build/kernel/bzImage-n100-router` | bzImage for ISO |
| Rootfs | `/opt/smart-router-monolith/alpine-build/rootfs/` | Alpine root filesystem |
| ISO script | `/opt/smart-router-monolith/scripts/alpine-iso-systemd-boot-fixed.sh` | ISO build script |
| Output ISO | `/opt/smart-router-monolith/alpine-router-n100-*.iso` | Bootable ISO |
| Documentation | `/home/river/smart-router-monolith/*.md` | All docs in repo |

---

## 9. Quick Reference Commands

```bash
# Kernel compile
cd /opt/smart-router-monolith/alpine-build/kernel/linux-6.12.21 && make -j4 bzImage

# Copy kernel
cp arch/x86/boot/bzImage ../bzImage-n100-router

# Build ISO
cd /opt/smart-router-monolith/scripts && bash alpine-iso-systemd-boot-fixed.sh

# Write to USB
dd if=/opt/smart-router-monolith/alpine-router-n100-*.iso of=/dev/sdb bs=4M && sync

# Check USB
fdisk -l /dev/sdb
```

---

## 10. Reproducibility Notes

- All steps are executed on N100 (Alpine Linux) unless noted.
- Local repo (`/home/river/smart-router-monolith`) is synced via GitHub.
- Use `sshpass -p 'rivera' ssh root@192.168.1.209` to connect to N100.
- Kernel compilation takes ~60 min; ISO generation ~5 min; USB write ~1 min.
- Document any deviations or new issues in `STATUS-*.md` files.

---

*Created: 2026-05-07*
*Based on successful build #6 (INITRD fix applied)*
