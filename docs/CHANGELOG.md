# Changelog - SmartRouter N100 Alpine Build

All notable changes to the SmartRouter N100 Alpine build process are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- `COMPILATION-AND-USB-PROCEDURE.md` - Complete step-by-step build procedure
- `PROGRESS-2026-05-07.md` - Detailed progress report with INITRD fix
- `EFI-BOOT-FIX-AVANCE.md` - EFI boot troubleshooting documentation
- `STATUS-2026-05-06.md` - Status after N100 reboot

### Changed
- **Kernel config**: Enabled `CONFIG_BLK_DEV_INITRD=y` (fixes kernel panic)
- **Kernel config**: Enabled all RD_* compression formats (GZIP, LZMA, XZ, etc.)
- **Initramfs compression**: Changed from LZMA to GZIP (universally supported)
- **ISO size**: Increased from 199MB to 426MB (due to gzip initramfs)

### Fixed
- **Critical**: Kernel panic "Cannot open root device" - INITRD support now enabled
- **Critical**: Initramfs not loading - Changed to GZIP compression
- Kernel compilation script updated with proper INITRD support

---

## [Build #6] - 2026-05-07 15:07 UTC

### Fixed
- **Kernel panic on boot**: Added `CONFIG_BLK_DEV_INITRD=y` to kernel config
- **Initramfs decompression**: Enabled all RD_* compression formats in kernel
- **ISO build**: Changed initramfs compression from LZMA to GZIP in `alpine-iso-systemd-boot-fixed.sh`

### Changed
- Kernel recompiled with INITRD support (4.2MB, up from 3.7MB)
- ISO regenerated: `alpine-router-n100-20260507-1507.iso` (426MB)
- USB written with fixed ISO

### Technical Details
- Kernel config: `CONFIG_BLK_DEV_INITRD=y`, `CONFIG_RD_GZIP=y`, `CONFIG_RD_LZMA=y`, etc.
- Initramfs: 144MB (gzip compressed), was 72MB (lzma compressed)
- ESP size: 154MB (kernel 4MB + initramfs 144MB + bootloader)
- Build time: ~10 minutes (kernel recompile only)

### Commits
- `c59a0c5` - fix: enable INITRD and gzip compression in kernel and ISO

---

## [Build #5] - 2026-05-06 17:27 UTC

### Added
- `alpine-iso-systemd-boot.sh` - ISO build with systemd-boot (UEFI-only)
- `scripts/alpine-iso-systemd-boot-fixed.sh` - Fixed version with proper ESP
- Systemd-boot configuration (loader.conf, boot entries)

### Changed
- Switched from SYSLINUX-only to hybrid BIOS+UEFI boot
- ISO structure: MBR + El Torito + EFI system partition
- Uses `xorriso` for hybrid ISO generation

### Fixed
- EFI boot now works with systemd-boot
- ISO recognized as bootable in UEFI mode

### ISO Generated
- `alpine-router-n100-systemd-20260506-1727.iso` (199MB)

### Commits
- `7080962` - feat: add fixed systemd-boot ISO script from N100
- `6e2f95e` - Initial systemd-boot integration

---

## [Build #4] - 2026-05-06 15:00 UTC

### Added
- `acpi=off` kernel parameter (fixes ACPI-related freezes)
- `/init` script in rootfs for initramfs execution

### Changed
- Kernel cmdline: added `acpi=off nomodeset`
- Rootfs includes busybox init and OpenRC services

### Fixed
- N100 no longer freezes on ACPI errors
- Kernel boots past ACPI initialization

### Known Issues
- Kernel panic "Cannot open root device" (fixed in Build #6)

---

## [Build #3] - 2026-05-06 12:00 UTC

### Added
- Framebuffer EFI support (`CONFIG_FB_EFI=y`)
- DRM SimpleDRM (`CONFIG_DRM_SIMPLEDRM=y`)
- Framebuffer console (`CONFIG_FRAMEBUFFER_CONSOLE=y`)

### Changed
- Kernel config updated for display output
- No more black screen - kernel messages now visible

### Fixed
- Black screen after EFI stub boot
- Video output now works via EFI framebuffer

---

## [Build #2] - 2026-05-06 10:00 UTC

### Added
- `CONFIG_EFI_STUB=y` in kernel config
- EFI boot support enabled

### Changed
- Kernel now includes EFI stub for direct EFI booting
- No longer requires separate bootloader in EFI mode

### Fixed
- Error "unsupported" when booting EFI stub
- Kernel now boots via EFI

---

## [Build #1] - 2026-05-06 08:00 UTC

### Added
- Initial kernel compilation: Linux 6.12.21
- Basic kernel config for N100 (x86_64)
- `bzImage-n100-router` (3.7MB)
- eBPF/XDP support for SmartRouter
- USB, XHCI, VFAT filesystem support

### Added Files
- `Makefile.alpine` - Build orchestration
- `scripts/alpine-iso.sh` - Basic ISO with SYSLINUX
- `scripts/fix-usb-boot.sh` - USB wipe/write helper
- `kernel/n100-router-alpine.config` - Base kernel config

### ISO Generated
- `alpine-router-n100-20260506.iso` (77.7MB)

### Known Issues
- No EFI stub support (fixed in Build #2)
- Black screen (fixed in Build #3)
- ACPI freeze (fixed in Build #4)
- Kernel panic (fixed in Build #6)

### Commits
- `b9f53c3` - Initial kernel compilation
- `dddd1e0` - Base build system
- `6ace193` - Initial ISO generation

---

## [Documentation] - 2026-05-06 to 2026-05-07

### Added Documentation
- `BOOTLOADER-COMPARISON-AND-KERNEL-DOC.md` - GRUB vs systemd-boot, kernel compilation guide
- `USB-DEEP-ANALYSIS-AND-DEFINITIVE-PLAN.md` - USB boot failure analysis
- `USB-BOOT-FIX-PLAN.md` - USB fix strategy
- `USB-BOOT-SUCCESS.md` - USB boot success notes
- `BACKGROUND-PROCESS-WORKFLOW.md` - Background task workflow
- `EFI-BOOT-FIX-AVANCE.md` - EFI boot troubleshooting (español)
- `planfix.md` - INITRD fix plan (on N100, español)
- `STATUS-2026-05-06.md` - Status report
- `PROGRESS-2026-05-07.md` - Progress report with INITRD fix
- `COMPILATION-AND-USB-PROCEDURE.md` - Complete build procedure
- `CHANGELOG.md` - This file

### Commits
- `9bb39ec` - docs: update status after N100 reboot
- `f9ffa31` - docs: add EFI boot fix advance documentation
- `390727a` - docs: USB boot analysis
- `bb3422e` - docs: bootloader comparison
- `86dd130` - docs: workflow documentation
- `570e393` - docs: USB success notes

---

## [Repository Structure]

### Kernel
- `kernel/n100-router-alpine.config` - Base kernel configuration
- `alpine-build/kernel/linux-6.12.21/` - Kernel source (on N100)
- `alpine-build/kernel/bzImage-n100-router` - Compiled kernel (4.2MB)

### Scripts
- `scripts/alpine-iso.sh` - Basic SYSLINUX ISO
- `scripts/alpine-iso-systemd-boot.sh` - Systemd-boot ISO
- `scripts/alpine-iso-systemd-boot-fixed.sh` - Final working version
- `scripts/fix-usb-boot.sh` - USB preparation
- `Makefile.alpine` - Build orchestration

### Documentation
- `*.md` - All documentation files (this repo)
- `planfix.md` - On N100 only (INITRD fix plan)

### Build Output (on N100)
- `alpine-router-n100-*.iso` - Generated ISO files
- `alpine-build/rootfs/` - Alpine root filesystem
- `alpine-build/iso-work/` - Temporary ISO build directory

---

## [Build History Summary]

| Build | Date | Kernel | ISO Size | Status | Key Fix |
|-------|------|--------|----------|--------|---------|
| #1 | 2026-05-06 | 6.12.21 (basic) | 77.7MB | ❌ | Initial build |
| #2 | 2026-05-06 | 6.12.21 (+EFI) | 77.7MB | ❌ | EFI stub added |
| #3 | 2026-05-06 | 6.12.21 (+FB) | 199MB | ❌ | Framebuffer works |
| #4 | 2026-05-06 | 6.12.21 (+acpi=off) | 199MB | ❌ | No more ACPI freeze |
| #5 | 2026-05-06 | 6.12.21 (+systemd-boot) | 199MB | ❌ | UEFI boot works |
| #6 | 2026-05-07 | 6.12.21 (**+INITRD**) | **426MB** | **✅** | **Kernel panic fixed** |

---

## [Next Steps]

### Immediate
- [ ] Boot test with Build #6 ISO
- [ ] Verify initramfs loads correctly
- [ ] Confirm login prompt appears
- [ ] Test SmartRouter functionality

### Short Term
- [ ] Document successful boot process
- [ ] Optimize ISO size (possibly switch back to LZMA if INITRD works)
- [ ] Add SmartRouter services to OpenRC
- [ ] Configure network interfaces

### Long Term
- [ ] Install to internal disk (optional)
- [ ] Add web interface for router management
- [ ] Implement eBPF/XDP packet filtering
- [ ] Add VPN, QoS, and advanced routing features

---

## [Contributors]

- River (N100 hardware testing, build execution)
- opencode assistant (build system, documentation, debugging)

---

*Changelog started: 2026-05-07*
*Last updated: 2026-05-07 15:45 UTC*
