#!/bin/bash
# Alpine Router Build Script - SmartRouter Monolith
# Builds complete Alpine-based router ISO with custom kernel for N100

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/alpine-build"
ISO_INPUT="$SCRIPT_DIR/alpine-standard-3.23.4-x86_64.iso"
 ISO_OUTPUT="$SCRIPT_DIR/alpine-router-n100-$(date +%Y%m%d).iso"

echo "=========================================="
echo "Alpine Router Build - SmartRouter Monolith"
echo "=========================================="
echo ""

# Función para mostrar ayuda
show_help() {
    cat << EOF
Uso: $0 [OPCION]

Opciones:
  all         - Ejecutar todas las fases (completo)
  prepare     - Fase 1: Preparar entorno de build
  kernel      - Fase 2: Compilar kernel personalizado
  rootfs      - Fase 3: Crear rootfs Alpine personalizado
  iso         - Fase 4: Generar ISO bootable
  qemu        - Fase 5: Probar en QEMU
  help        - Mostrar esta ayuda

Ejemplo:
  $0 all      # Build completo
  $0 kernel   # Solo compilar kernel
EOF
}

# Fase 1: Preparar entorno
phase_prepare() {
    echo "=== FASE 1: Preparando entorno de build ==="
    
    # Crear directorios
    mkdir -p "$BUILD_DIR"/{iso,rootfs,kernel,work}
    
    # Verificar dependencias
    DEPS="xorriso xz-utils syslinux mtools dosfstools"
    MISSING=""
    
    for dep in $DEPS; do
        if ! command -v $dep &> /dev/null; then
            MISSING="$MISSING $dep"
        fi
    done
    
    if [ -n "$MISSING" ]; then
        echo "Instalando dependencias: $MISSING"
        sudo apt update
        sudo apt install -y $MISSING
    fi
    
    # Extraer ISO base
    if [ ! -f "$BUILD_DIR/iso/extracted" ]; then
        echo "Extrayendo Alpine ISO base..."
        mkdir -p "$BUILD_DIR/iso/mount"
        sudo mount -o loop "$ISO_INPUT" "$BUILD_DIR/iso/mount"
        sudo cp -a "$BUILD_DIR/iso/mount/"* "$BUILD_DIR/iso/"
        sudo umount "$BUILD_DIR/iso/mount"
        touch "$BUILD_DIR/iso/extracted"
    fi
    
    echo "✅ Fase 1 completada"
}

# Fase 2: Compilar kernel
phase_kernel() {
    echo "=== FASE 2: Compilando kernel personalizado ==="
    
    cd "$BUILD_DIR/kernel"
    
    # Descargar kernel si no existe
    if [ ! -f "linux-6.12.21.tar.xz" ]; then
        echo "Descargando kernel 6.12.21..."
        wget https://cdn.kernel.org/pub/linux/kernel/v6.x/linux-6.12.21.tar.xz
    fi
    
    # Extraer
    if [ ! -d "linux-6.12.21" ]; then
        tar xf linux-6.12.21.tar.xz
    fi
    
    cd linux-6.12.21
    
    # Copiar configuración personalizada
    if [ -f "$SCRIPT_DIR/kernel/n100-router-alpine.config" ]; then
        cp "$SCRIPT_DIR/kernel/n100-router-alpine.config" .config
    else
        echo "Usando config básica para N100..."
        make defconfig
        # Activar opciones necesarias para router
        ./scripts/config --enable CONFIG_BPF
        ./scripts/config --enable CONFIG_BPF_SYSCALL
        ./scripts/config --enable CONFIG_XDP_SOCKETS
        ./scripts/config --enable CONFIG_NET_CLS_BPF
        ./scripts/config --enable CONFIG_NET_ACT_BPF
        ./scripts/config --enable CONFIG_NFTABLES
        ./scripts/config --enable CONFIG_NF_TABLES
        ./scripts/config --enable CONFIG_IP_NF_NAT
        ./scripts/config --enable CONFIG_VLAN_8021Q
        ./scripts/config --enable CONFIG_NET_SCH_HTB
        ./scripts/config --enable CONFIG_VIRTIO
        ./scripts/config --enable CONFIG_VIRTIO_NET
        ./scripts/config --enable CONFIG_9P_FS
    fi
    
    # Compilar
    echo "Compilando kernel (esto tomará ~60 min)..."
    make -j$(nproc) bzImage
    make -j$(nproc) modules
    
    # Instalar módulos en rootfs temporal
    make modules_install INSTALL_MOD_PATH="$BUILD_DIR/rootfs"
    
    # Copiar kernel
    cp arch/x86/boot/bzImage "$BUILD_DIR/kernel/bzImage-n100-router"
    
    echo "✅ Fase 2 completada: Kernel en $BUILD_DIR/kernel/bzImage-n100-router"
}

# Fase 3: Crear rootfs
phase_rootfs() {
    echo "=== FASE 3: Creando rootfs Alpine personalizado ==="
    
    # TODO: Implementar creación de rootfs con paquetes
    echo "Generando rootfs con paquetes preinstalados..."
    
    # Por ahora, usar alpine chroot o similar
    echo "⚠️ Fase 3 pendiente de implementación completa"
}

# Fase 4: Generar ISO
phase_iso() {
    echo "=== FASE 4: Generando ISO bootable ==="
    
    # Copiar kernel a ISO
    cp "$BUILD_DIR/kernel/bzImage-n100-router" "$BUILD_DIR/iso/boot/vmlinuz-lts"
    
    # Crear ISO
    echo "Creando ISO..."
    xorriso -as mkisofs \
        -o "$ISO_OUTPUT" \
        -isohybrid-mbr /usr/lib/ISOLINUX/isohdpfx.bin \
        -c boot/syslinux/boot.cat \
        -b boot/syslinux/isolinux.bin \
        -no-emul-boot \
        -boot-load-size 4 \
        -boot-info-table \
        "$BUILD_DIR/iso"
    
    echo "✅ ISO generado: $ISO_OUTPUT"
}

# Fase 5: Probar en QEMU
phase_qemu() {
    echo "=== FASE 5: Probando en QEMU ==="
    
    if ! command -v qemu-system-x86_64 &> /dev/null; then
        sudo apt install -y qemu-system-x86
    fi
    
    echo "Iniciando QEMU con ISO..."
    sudo qemu-system-x86_64 \
        -m 512 \
        -cdrom "$ISO_OUTPUT" \
        -boot d \
        -netdev user,id=net0 \
        -device e1000,netdev=net0 \
        -nographic
}

# Main
case "${1:-help}" in
    all)
        phase_prepare
        phase_kernel
        phase_rootfs
        phase_iso
        echo "✅ Build completo finalizado"
        ;;
    prepare) phase_prepare ;;
    kernel) phase_kernel ;;
    rootfs) phase_rootfs ;;
    iso) phase_iso ;;
    qemu) phase_qemu ;;
    help|*) show_help ;;
esac
