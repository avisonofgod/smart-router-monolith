#!/bin/bash
# Limpieza del laboratorio NATIVO

echo "🧹 Limpiando laboratorio NATIVO..."
echo "================================================"

# 1. Detener y eliminar Redis Docker
echo "[1/5] Deteniendo Redis..."
docker stop redis-dev 2>/dev/null || true
docker rm redis-dev 2>/dev/null || true

# 2. Eliminar bridges
echo "[2/5] Eliminando bridges..."
sudo ip link set br-hotspot down 2>/dev/null || true
sudo ip link del br-hotspot 2>/dev/null || true
sudo ip link set br-pppoe down 2>/dev/null || true
sudo ip link del br-pppoe 2>/dev/null || true
sudo ip link set br-mgmt down 2>/dev/null || true
sudo ip link del br-mgmt 2>/dev/null || true

# 3. Eliminar veth pairs
echo "[3/5] Eliminando veth pairs..."
sudo ip link del wan1-modem 2>/dev/null || true
sudo ip link del wan2-modem 2>/dev/null || true
sudo ip link del lan-client 2>/dev/null || true

# 4. Limpiar reglas iptables
echo "[4/5] Limpiando iptables..."
sudo iptables -t nat -F 2>/dev/null || true
sudo iptables -F FORWARD 2>/dev/null || true

# 5. Limpiar nftables
echo "[5/5] Limpiando nftables..."
sudo nft delete table inet hotspot 2>/dev/null || true
sudo nft delete table inet pppoe 2>/dev/null || true
sudo nft delete table inet management 2>/dev/null || true

echo ""
echo "✅ LIMPIEZA COMPLETADA!"
echo "================================================"
