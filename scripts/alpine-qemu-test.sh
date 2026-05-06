#!/bin/bash
# Probar Alpine Router ISO en QEMU con configuración N100 simulada

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
ISO_LATEST=$(ls -t "$SCRIPT_DIR"/../alpine-router-n100-*.iso 2>/dev/null | head -1)

if [ -z "$ISO_LATEST" ]; then
    echo "Error: No se encontró ISO de Alpine Router"
    echo "Ejecuta primero: ./alpine-router-build.sh iso"
    exit 1
fi

echo "=== Iniciando QEMU con Alpine Router ==="
echo "ISO: $ISO_LATEST"
echo ""
echo "Configuración de hardware simulado:"
echo "  - CPU: 4 cores (similar a N100)"
echo "  - RAM: 2GB"
echo "  - NICs: 3 tarjetas (eth0 LAN, eth1 WAN1, eth2 WAN2)"
echo "  - Boot: Desde ISO (CD-ROM)"
echo ""
echo "Para salir: Ctrl+A luego X"
echo "Para consola serial: Ctrl+A luego C"
echo ""

# Crear imagen de disco virtual para "instalación"
DISK_IMG="$BUILD_DIR/test-disk.qcow2"
if [ ! -f "$DISK_IMG" ]; then
    qemu-img create -f qcow2 "$DISK_IMG" 8G
fi

# Iniciar QEMU con hardware similar a N100
sudo qemu-system-x86_64 \
    -name "Alpine Router N100 Test" \
    -machine accel=kvm:tcg \
    -cpu host \
    -smp 4 \
    -m 2048 \
    -drive file="$DISK_IMG",format=qcow2,if=virtio \
    -cdrom "$ISO_LATEST" \
    -boot d \
    -netdev user,id=net0,hostfwd=tcp::3000-:3000 \
    -device e1000,netdev=net0,id=eth0 \
    -netdev user,id=net1 \
    -device e1000,netdev=net1,id=eth1 \
    -netdev user,id=net2 \
    -device e1000,netdev=net2,id=eth2 \
    -nographic \
    -serial mon:stdio \
    -vga none \
    -display none \
    2>&1 | tee "$BUILD_DIR/qemu-console.log"

# Nota: Para conectar después:
#   screen -r qemu-alpine
# O conectar con:
#   telnet localhost 5555
