# Bootloader Comparison, Alpine Boot Process & Kernel Compilation Guide

## Goal
Document the best bootloader choice for Alpine Router N100, explain the complete boot process, and detail the kernel 6.12 compilation with eBPF/XDP support for Intel N100.

## 1. Bootloader Comparison: GRUB vs systemd-boot

### Quick Decision Matrix

| Feature | GRUB | systemd-boot |
|---------|------|--------------|
| **Firmware Support** | BIOS + UEFI | UEFI only |
| **Complexity** | High (complex codebase) | Low (simple, minimal) |
| **Speed** | Slower (loads own drivers) | Faster (uses UEFI services) |
| **Full Disk Encryption** | ✅ Encrypted `/boot` supported | ❌ `/boot` must be unencrypted |
| **Multi-boot** | ✅ Excellent (os-prober) | ⚠️ Manual entry files |
| **Secure Boot** | ✅ Shim-based (Microsoft keys) | ✅ Custom keys + UKI |
| **UEFI quirks (MSI boards)** | ❌ Issues common | ✅ Works reliably |
| **Maintenance** | Complex config (grub.cfg) | Simple (drop-in files) |

### **Recommendation for Alpine Router N100:**

**Use systemd-boot** if:
- ✅ N100 board has UEFI (most modern boards do)
- ✅ Single OS (no multi-boot)
- ✅ Want simple, auditable boot process
- ✅ Want faster boot times
- ✅ MSI board (UEFI quirks with GRUB)

**Use GRUB** if:
- Need BIOS/Legacy support
- Need encrypted `/boot` partition
- Multi-boot with Windows/Linux
- Want mature, widely-tested bootloader

### **Our Choice: systemd-boot (for N100)**
Since N100 is a modern Intel board with UEFI, and we're building a single-purpose router:
- **systemd-boot** is simpler, faster, more reliable
- We'll use **Unified Kernel Images (UKI)** for Secure Boot
- No need for complex multi-boot or encrypted `/boot`

---

## 2. Alpine Linux Boot Process (Detailed)

### Boot Sequence (UEFI + systemd-boot)
```
1. Hardware Power-On
   ↓
2. UEFI Firmware initializes
   ↓
3. UEFI loads systemd-boot from ESP (EFI/BOOT/BOOTX64.EFI)
   ↓
4. systemd-boot reads configuration:
   - /loader/loader.conf (timeout, default entry)
   - /EFI/Linux/*.efi (UKI files auto-detected)
   - /loader/entries/*.conf (manual entries)
   ↓
5. User selects entry (or default boots)
   ↓
6. systemd-boot loads UKI (kernel + initramfs + cmdline in one file)
   ↓
7. Kernel initializes (6.12.21 for N100)
   ↓
8. Initramfs loads (init script from Alpine)
   ↓
9. nlplug-findfs searches for apkovls/media/sda1/boot/)
   ↓
10. Rootfs mounts (squashfs or disk install)
    ↓
11. OpenRC init starts
    ↓
12. SmartRouter service starts (rc-update add smartrouter default)
```

### Key Files in Alpine Boot
| File | Location | Purpose |
|------|----------|---------|
| BOOTX64.EFI | /EFI/BOOT/ | systemd-boot binary |
| loader.conf | /boot/loader/ | systemd-boot config (timeout, etc.) |
| *.conf | /boot/loader/entries/ | Boot entry files |
| vmlinuz | /boot/ | Kernel (bzImage-n100-router) |
| initramfs.img | /boot/ | Initial RAM filesystem |
| filesystem.squashfs | /live/ | Compressed rootfs (live boot) |

### Our ISO Boot Structure (Fixed)
```
ISO Root:
├── boot/
│   ├── grub/
│   │   ├── grub.cfg          # GRUB config (fallback)
│   │   └── efi.img          # EFI image for GRUB
│   ├── syslinux/
│   │   ├── syslinux.cfg     # SYSLINUX config (BIOS boot)
│   │   ├── isolinux.bin
│   │   └── *.c32
│   ├── vmlinuz            # Kernel
│   └── initramfs.img      # Initramfs
├── EFI/
│   └── BOOT/
│       ├── BOOTX64.EFI     # systemd-boot binary
│       └── grub.cfg        # Points to /boot/grub/grub.cfg
├── live/
│   └── filesystem.squashfs # Rootfs
└── [System Area: MBR + isohdpfx.bin]
```

---

## 3. Kernel 6.12 Compilation for N100 (eBPF/XDP Support)

### N100 Processor Details
- **Architecture**: x86_64 (Intel Alder Lake-N)
- **Features**: eBPF, XDP, AES-NI, AVX2, etc.
- **Target**: Optimize for N100 with `CONFIG_MNATIVE` or `CONFIG_INTEL_N100`

### Required Kernel Config for eBPF/XDP
```bash
# eBPF Core
CONFIG_BPF=y
CONFIG_BPF_SYSCALL=y
CONFIG_BPF_JIT=y
CONFIG_BPF_JIT_ALWAYS_ON=y
CONFIG_HAVE_EBPF_JIT=y

# XDP (eXpress Data Path)
CONFIG_XDP_SOCKETS=y
CONFIG_XDP_SOCKETS_DIAG=y

# eBPF offload (Intel NICs)
CONFIG_NET_CLS_BPF=m
CONFIG_NET_ACT_BPF=m
CONFIG_BPF_EVENTS=y
CONFIG_BPF_KPROBE_OVRIDE is not set

# Intel Ethernet drivers with XDP support
CONFIG_E1000=y         # Intel PRO/1000
CONFIG_E1000E=y        # Intel Gigabit Ethernet
CONFIG_IGB=y            # Intel I210/I211 (common in N100 boards)
CONFIG_IGC=y            # Intel I225/I226 (2.5GbE in N100)

# NFTables (for SmartRouter firewall)
CONFIG_NETFILTER=y
CONFIG_NF_TABLES=y
CONFIG_NF_TABLES_INET=y
CONFIG_NFT_CT=y
CONFIG_NFT_NAT=y

# Traffic Control (TC) for eBPF classifiers
CONFIG_NET_CLS_BPF=m
CONFIG_NET_ACT_BPF=m

# Optional: XDP hardware offload
CONFIG_NETDEVICES=y
CONFIG_VXLAN=y
```

### Kernel Compilation Steps (N100, 4-core, `make -j4`)
```bash
# 1. Download kernel 6.12 (LTS)
cd /usr/src
wget https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.21.tar.xz
tar xf linux-6.12.21.tar.xz
cd linux-6.12.21

# 2. Copy our N100 config
cp /opt/smart-router-monolith/kernel/n100-router-alpine.config .config

# 3. Update config (menuconfig optional)
make menuconfig  # Enable eBPF, XDP, N100 optimizations

# 4. Compile kernel (N100 4-core, ~60 min)
make -j4 bzImage modules
# Output: arch/x86/boot/bzImage

# 5. Install modules
make modules_install

# 6. Copy kernel to Alpine build
cp arch/x86/boot/bzImage /opt/smart-router-monolith/alpine-build/kernel/bzImage-n100-router
```

### Optimizations for N100
```bash
# In kernel config or make menuconfig:
CONFIG_MNATIVE=y                    # Optimize for local CPU (N100)
# OR specifically:
CONFIG_GENERIC_CPU=y                 # Generic x86_64 (works on all)
CONFIG_X86_INTEL_LPSS=y             # Intel Low Power Subsystem (N100)
CONFIG_INTEL_IDLE=y                 # Intel idle driver
CONFIG_PROCESSOR_SELECT=y
CONFIG_CPU_SUP_INTEL=y

# Networking optimizations
CONFIG_NET_RX_BUSY_POLL=y
CONFIG_BQL=y                         # Byte Queue Limits
CONFIG_NET_SCHED=y                    # Queueing disciplines
CONFIG_NET_SCH_HTB=y                 # Hierarchical Token Bucket (for QoS)
```

---

## 4. Fixing Our ISO Boot Issue (GRUB drops to command line)

### Root Cause
GRUB can't find `grub.cfg` because:
1. EFI directory structure is incomplete (`/EFI/BOOT/` missing or wrong)
2. `grub.cfg` not in expected location
3. System might be booting in UEFI mode but GRUB expects different path

### Solution: Use systemd-boot instead of GRUB
Since our N100 is UEFI-only, let's switch to systemd-boot for simplicity:

```bash
# On N100 after booting Alpine successfully:
apk add systemd-boot efibootmgr

# Install systemd-boot to ESP
systemctl-boot install --path=/boot

# Create UKI (Unified Kernel Image)
# Kernel + initramfs + cmdline in one .efi file
mkdir -p /boot/EFI/Linux/
objcopy \
    --add-section .linux=/boot/vmlinuz \
    --add-section .initrd=/boot/initramfs.img \
    --add-section .cmdline="root=/dev/sda2 modules=loop,squashfs quiet" \
    /usr/lib/systemd/boot/efi/systemd-bootx64.efi \
    /boot/EFI/Linux/alpine-router-n100.efi

# Reboot - systemd-boot will auto-detect alpine-router-n100.efi
```

### Alternative: Fix GRUB EFI Structure
If we keep GRUB, ensure ISO has:
```
/EFI/BOOT/BOOTX64.EFI          # GRUB EFI binary
/EFI/BOOT/grub.cfg             # Points to /boot/grub/grub.cfg
/boot/grub/grub.cfg            # Main GRUB config
```
Our current ISO has this, but GRUB still drops to command line.

---

## 5. Next Steps for N100 Boot

### Option A: Fix Current ISO (GRUB)
1. Verify USB written correctly:
   ```bash
   dd if=/opt/smart-router-monolith/alpine-router-n100-20260506-1720.iso of=/dev/sdb bs=4M
   sync
   ```
2. Boot N100 from USB
3. If GRUB command line appears, manually boot:
   ```
   grub> set root=(hd0,msdos1)
   grub> linux /boot/vmlinuz modules=loop,squashfs quiet
   grub> initrd /boot/initramfs.img
   grub> boot
   ```

### Option B: Switch to systemd-boot (Recommended)
1. Rebuild ISO with systemd-boot instead of GRUB
2. Use UKI (Unified Kernel Image)
3. Simpler, faster, more reliable for UEFI-only N100

---

## 6. Summary of Current Status

| Item | Status | Notes |
|------|--------|-------|
| ISO Generated | ✅ Multiple versions (1622, 1639, 1644, 1705, 1720) | Latest: 1720 |
| MBR Fixed | ✅ Matches standard Alpine | Using isohdpfx.bin |
| SYSLINUX (BIOS) | ✅ Included | Works for legacy BIOS |
| GRUB (UEFI) | ⚠️ Drops to command line | Missing /EFI/BOOT/ structure? |
| systemd-boot | ❌ Not yet implemented | Recommended for N100 |
| Kernel 6.12 | ✅ Compiled | bzImage-n100-router (3.7MB) |
| eBPF/XDP | ✅ Configured | Ready for SmartRouter |
| USB Boot Test | ⚠️ In progress | BIOS recognizes, GRUB fails |

### Recommendation
**Switch to systemd-boot** for UEFI boot on N100. It's simpler, faster, and more reliable for our single-purpose router use case.
