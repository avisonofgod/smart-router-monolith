#!/bin/bash
# Preparar entorno de build para Alpine Router

set -e

echo "=== Preparando entorno Alpine Router ==="

# Instalar dependencias en host Ubuntu
echo "Instalando dependencias..."
sudo apt update
sudo apt install -y \
    xorriso \
    xz-utils \
    syslinux \
    mtools \
    dosfstools \
    genisoimage \
    squashfs-tools \
    grub-pc-bin \
    grub-efi-amd64-bin \
    wget \
    curl \
    build-essential \
    libncurses-dev \
    bison \
    flex \
    libssl-dev \
    libelf-dev

# Crear directorios de build
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/../alpine-build"
mkdir -p "$BUILD_DIR"/{iso,rootfs,kernel,work,output}

echo "Directorios creados en: $BUILD_DIR"

# Verificar ISO base
ISO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/alpine-standard-3.23.4-x86_64.iso"
if [ ! -f "$ISO_PATH" ]; then
    echo "Error: No se encuentra $ISO_PATH"
    exit 1
fi

echo "✅ Entorno preparado correctamente"
echo "Siguiente paso: ./alpine-router-build.sh kernel"
