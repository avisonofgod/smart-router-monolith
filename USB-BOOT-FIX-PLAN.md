# USB Boot Failure Analysis & Fix Plan

## Goal
Analyze why the USB with ISO doesn't appear in N100 BIOS and doesn't boot, then provide a step-by-step fix plan.

## 1. Problem Analysis

### Symptoms
- ❌ USB doesn't appear in N100 BIOS boot menu
- ❌ If boots, GRUB drops to command line
- ❌ systemd-boot ISO also doesn't appear

### Root Causes Identified

| Issue | Description | Status |
|-------|-------------|--------|
| **1. ISO Detection** | `file` shows "DOS/MBR boot sector" but BIOS may not detect | ❌ |
| **2. USB Write Method** | Writing ISO to `/dev/sdb` with partitions still visible | ❌ |
| **3. EFI Structure** | `/EFI/BOOT/` missing or incorrect in ISO | ❌ |
| **4. MBR Mismatch** | Our MBR differs from standard Alpine until manually copied | ❌ |
| **5. BIOS Settings** | N100 might be in CSM/Legacy mode, not UEFI | ⚠️ Unknown |

---

## 2. Detailed Analysis

### Issue #1: ISO Boot Structure
Our ISO: `alpine-router-n100-systemd-20260506-1727.iso (199MB)`
- ✅ MBR present (first 512 bytes)
- ✅ Boot signature `0x55AA` at byte 510-511
- ✅ El Torito boot catalog present
- ✅ `EFI/BOOT/BOOTX64.EFI` included (systemd-boot)
- ❌ BIOS still doesn't detect

**Comparison with Standard Alpine ISO:**
| Attribute | Standard Alpine | Our ISO |
|------------|------------------|---------|
| MBR MD5 | `ffe23fa5...` | `ffe23fa5...` (after fix) |
| Boot signature | `0x55AA` | ✅ `0x55AA` |
| EFI directory | `/EFI/BOOT/` | ✅ Included |
| BIOS boot | ✅ Appears in BIOS | ❌ Doesn't appear |

### Issue #2: USB Write Problems
**Wrong method:**
```bash
# This creates partitions on USB (WRONG)
fdisk -l /dev/sdb shows:
  /dev/sdb1 *  0,0,1  208,63,32  0   428032  209M  0 Empty
  /dev/sdb2    1023,254,63 1023,254,63  308  3187  2880K ef EFI (FAT-12/16/32)
```

**Correct method:**
```bash
# Write ISO directly to USB (no partitions)
dd if=alpine-router-n100-systemd-20260506-1727.iso of=/dev/sdb bs=4M
sync
# Now fdisk should show NO partitions (pure ISO)
```

### Issue #3: N100 BIOS Settings
Common problems:
1. **CSM/Legacy mode enabled** → Disable it, use pure UEFI
2. **Secure Boot enabled** → Disable for custom ISO
3. **USB boot disabled** → Enable in BIOS
4. **Fast Boot enabled** → Disable (skips USB detection)

---

## 3. Fix Plan (Step-by-Step)

### Step 1: Verify Hardware & BIOS Settings on N100
```bash
# On N100 (after booting from any media):
cat /sys/firmware/efi  # If exists → UEFI mode
# If not → Legacy BIOS mode

# Check BIOS settings (reboot, press F2/Del):
- Boot → Boot Mode: Select "UEFI Only" (not "Legacy" or "CSM")
- Security → Secure Boot: Disable (for custom ISO)
- Boot → USB Boot: Enable
- Boot → Fast Boot: Disable
- Save & Exit (F10)
```

### Step 2: Create Proper Bootable USB (3 Options)

#### Option A: Use Standard Alpine ISO (Test Hardware First)
```bash
# On N100:
wget https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-standard-3.20.2-x86_64.iso
dd if=alpine-standard-3.20.2-x86_64.iso of=/dev/sdb bs=4M
sync
# Test if THIS appears in BIOS → confirms hardware works
```

#### Option B: Fix Our ISO (MBR + EFI + syslinux)
```bash
# On N100:
cd /opt/smart-router-monolith

# 1. Extract standard Alpine MBR
dd if=alpine-standard.iso of=/tmp/std-mbr.bin bs=512 count=1

# 2. Copy MBR to our ISO
dd if=/tmp/std-mbr.bin of=alpine-router-n100-20260506-1727.iso bs=1 count=446 conv=notrunc

# 3. Verify MBR matches
dd if=alpine-router-n100-20260506-1727.iso bs=512 count=1 | md5sum
# Should match: ffe23fa5...

# 4. Write to USB (COMPLETELY wipe first)
dd if=/dev/zero of=/dev/sdb bs=1M count=10  # Wipe start
dd if=alpine-router-n100-20260506-1727.iso of=/dev/sdb bs=4M
sync
```

#### Option C: Use syslinux Directly (Simplest for Legacy BIOS)
```bash
# On N100:
apk add syslinux

# Format USB as FAT32 with boot flag
fdisk /dev/sdb  # Create partition 1, type FAT32, set boot flag
mkfs.vfat /dev/sdb1
mount /dev/sdb1 /mnt/usb

# Copy Alpine files
mkdir -p /mnt/usb/boot/syslinux
cp /boot/vmlinuz-lts /mnt/usb/boot/
cp /boot/initramfs-lts /mnt/usb/boot/
cp /usr/share/syslinux/isolinux.bin /mnt/usb/boot/syslinux/
cp /usr/share/syslinux/ldlinux.c32 /mnt/usb/boot/syslinux/
# Create syslinux.cfg
cat > /mnt/usb/boot/syslinux/syslinux.cfg << 'EOF'
DEFAULT lts
LABEL lts
  KERNEL /boot/vmlinuz-lts
  INITRD /boot/initramfs-lts
  APPEND modules=loop,squashfs quiet
EOF
# Install syslinux MBR
syslinux /dev/sdb1
dd if=/usr/share/syslinux/mbr.bin of=/dev/sdb
umount /mnt/usb
```

---

## 4. Recommended Approach (For N100)

### Since N100 is UEFI-only, use **systemd-boot** with UKI:

```bash
# 1. Create Unified Kernel Image (UKI)
objcopy \
    --add-section .linux="/boot/vmlinuz-n100-router" \
    --add-section .initrd="/boot/initramfs.img" \
    --add-section .cmdline="root=/dev/sda2 modules=loop,squashfs quiet" \
    /usr/lib/systemd/boot/efi/systemd-bootx64.efi \
    /boot/EFI/Linux/alpine-router-n100.efi

# 2. Install systemd-boot to ESP
systemctl-boot install --path=/boot

# 3. Create entry (auto-detected)
# systemd-boot will auto-detect /boot/EFI/Linux/*.efi

# 4. For USB: Create FAT32 partition with systemd-boot
mkfs.vfat /dev/sdb1
mount /dev/sdb1 /mnt/usb
mkdir -p /mnt/usb/EFI/BOOT
cp /usr/lib/systemd/boot/efi/systemd-bootx64.efi /mnt/usb/EFI/BOOT/BOOTX64.EFI
cp /boot/vmlinuz-n100-router /mnt/usb/
cp /boot/initramfs.img /mnt/usb/
cat > /mnt/usb/loader/entries/alpine.conf << 'EOF'
title Alpine Router N100
linux /vmlinuz-n100-router
initrd /initramfs.img
options modules=loop,squashfs quiet
EOF
umount /mnt/usb
```

---

## 5. Next Steps (Execute Now)

### Immediate Actions:
1. **Check N100 BIOS settings** (reboot → F2):
   - Set "UEFI Only"
   - Disable Secure Boot
   - Enable USB Boot

2. **Test with standard Alpine ISO** to verify hardware works

3. **If standard works**, replicate its exact structure for our ISO

4. **If still fails**, use Option C (syslinux on FAT32 partition)

---

## 6. Summary of Current State

| Item | Status | Notes |
|------|--------|-------|
| ISO generated | ✅ | Multiple versions, latest: 1727 |
| systemd-boot included | ✅ | `/EFI/BOOT/BOOTX64.EFI` |
| MBR fixed | ✅ | Matches standard Alpine |
| USB written | ✅ | But doesn't appear in BIOS |
| BIOS settings | ⚠️ | Need to check N100 settings |
| Hardware test | ⚠️ | Test with standard Alpine ISO |

**Most likely cause**: N100 BIOS settings (CSM/Legacy mode) or USB write still has partition table.

**Quick fix**: Reboot N100 → Enter BIOS → Set UEFI Only → Disable Secure Boot → Test again.