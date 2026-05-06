#!/bin/sh
# Test script for eBPF/XDP inside QEMU N100 router

echo "=== SmartRouter N100 Test Suite ==="
echo "Kernel: $(uname -r)"
echo ""

# 1. Test eBPF/XDP support
echo "1. Testing eBPF/XDP support..."
if [ -f /sys/kernel/debug/tracing/events/bpf/bpf_prog_load/enable ]; then
  echo "   ✓ eBPF debugfs available"
else
  echo "   ⚠️  debugfs not mounted (try: mount -t debugfs none /sys/kernel/debug)"
fi

# Check if bpftool is available (not in busybox, but we can check kernel support)
if grep -q "CONFIG_BPF=y" /proc/config.gz 2>/dev/null || zcat /proc/config.gz 2>/dev/null | grep -q "CONFIG_BPF=y"; then
  echo "   ✓ eBPF support in kernel"
else
  echo "   ⚠️  Cannot verify eBPF config (no /proc/config.gz)"
fi

# 2. Test interfaces
echo ""
echo "2. Network interfaces:"
ip link show | grep -E "eth[0-9]|lo:" | while read line; do
  echo "   $line"
done

# 3. Test nftables
echo ""
echo "3. Testing nftables..."
if command -v nft >/dev/null 2>&1; then
  echo "   ✓ nft command available"
  nft list tables 2>&1 | head -5
else
  echo "   ⚠️  nft not installed (needs to be added to rootfs)"
fi

# 4. Test VLAN support
echo ""
echo "4. Testing VLAN support..."
if [ -d /proc/net/vlan ]; then
  echo "   ✓ VLAN proc support available"
else
  echo "   ⚠️  VLAN proc not found (check CONFIG_VLAN_8021Q)"
fi

# 5. Test traffic control (tc)
echo ""
echo "5. Testing traffic control (tc)..."
if command -v tc >/dev/null 2>&1; then
  echo "   ✓ tc command available"
else
  echo "   ⚠️  tc not installed (needs iproute2)"
fi

# 6. Test eBPF program loading (if we have the object file)
echo ""
echo "6. Testing eBPF program loading..."
if [ -f /mnt/host_code/kernel/router_kern.o ]; then
  echo "   ✓ eBPF object found: /mnt/host_code/kernel/router_kern.o"
  # Try to load XDP on eth1 (if ip link set eth1 xdp obj ...)
  # But we need iproute2 with xdp support
  if command -v ip >/dev/null 2>&1; then
    echo "   → Attempting to load XDP on eth1..."
    ip link set eth1 xdp obj /mnt/host_code/kernel/router_kern.o sec xdp_wan_balance 2>&1 | head -5
  else
    echo "   ⚠️  ip command not available"
  fi
else
  echo "   ⚠️  eBPF object not found (need to compile with BPF support)"
fi

# 7. Check kernel modules (should be none for monolithic)
echo ""
echo "7. Kernel modules:"
if [ -d /lib/modules ]; then
  echo "   Modules directory exists (unexpected for monolithic)"
  ls /lib/modules/$(uname -r) 2>/dev/null | head -3
else
  echo "   ✓ No modules directory (monolithic kernel)"
fi

echo ""
echo "=== Test Complete ==="
