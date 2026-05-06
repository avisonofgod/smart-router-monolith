#!/bin/bash
# Limpieza del entorno de desarrollo simulado

echo "🧹 Limpiando entorno de DESARROLLO..."
echo "=============================================="

# 1. Detener y eliminar Redis Docker
echo "[1/4] Deteniendo Redis..."
docker stop redis-dev 2>/dev/null || true
docker rm redis-dev 2>/dev/null || true

# 2. Eliminar namespaces
echo "[2/4] Eliminando namespaces..."
sudo ip netns del ns-cliente1 2>/dev/null || true
sudo ip netns del ns-cliente2 2>/dev/null || true

# 3. Eliminar interfaces veth
echo "[3/4] Eliminando interfaces virtuales..."
sudo ip link del veth10 2>/dev/null || true
sudo ip link del veth20 2>/dev/null || true
sudo ip link del veth99 2>/dev/null || true

# 4. Limpiar configuraciones nftables de desarrollo
echo "[4/4] Limpiando reglas nftables..."
sudo nft delete table inet hotspot 2>/dev/null || true
sudo nft delete table inet pppoe 2>/dev/null || true
sudo nft delete table inet management 2>/dev/null || true

echo ""
echo "✅ Limpieza completada!"
echo "=============================================="
