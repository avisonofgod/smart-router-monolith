#!/bin/bash
# Entorno de Desarrollo Simulado para SmartRouter
# Crea interfaces virtuales (veth) para probar sin riesgo a la red real

set -e

echo "🔧 Configurando entorno de DESARROLLO para SmartRouter..."
echo "=============================================="

# 1. Crear interfaces veth para simular VLANs
echo "[1/5] Creando interfaces virtuales..."

# veth para Hotspot (VLAN 10)
sudo ip link add veth10 type veth peer name veth10-peer 2>/dev/null || true
sudo ip addr add 192.168.10.1/24 dev veth10 2>/dev/null || true
sudo ip link set veth10 up
sudo ip link set veth10-peer up

# veth para PPPoE (VLAN 20)
sudo ip link add veth20 type veth peer name veth20-peer 2>/dev/null || true
sudo ip addr add 192.168.20.1/24 dev veth20 2>/dev/null || true
sudo ip link set veth20 up
sudo ip link set veth20-peer up

# veth para Gestión (VLAN 99)
sudo ip link add veth99 type veth peer name veth99-peer 2>/dev/null || true
sudo ip addr add 10.99.0.1/24 dev veth99 2>/dev/null || true
sudo ip link set veth99 up
sudo ip link set veth99-peer up

echo "  ✅ Interfaces veth creadas:"
echo "     - veth10 (Hotspot): 192.168.10.1/24"
echo "     - veth20 (PPPoE): 192.168.20.1/24"
echo "     - veth99 (Gestión): 10.99.0.1/24"

# 2. Crear namespaces para simular clientes
echo ""
echo "[2/5] Creando network namespaces..."

sudo ip netns add ns-cliente1 2>/dev/null || true
sudo ip netns add ns-cliente2 2>/dev/null || true

# Conectar namespaces a veth-peers
sudo ip link set veth10-peer netns ns-cliente1 2>/dev/null || true
sudo ip link set veth20-peer netns ns-cliente2 2>/dev/null || true

# Configurar IPs en namespaces
sudo ip netns exec ns-cliente1 ip addr add 192.168.10.100/24 dev veth10-peer 2>/dev/null || true
sudo ip netns exec ns-cliente1 ip link set veth10-peer up
sudo ip netns exec ns-cliente1 ip route add default via 192.168.10.1

sudo ip netns exec ns-cliente2 ip addr add 192.168.20.100/24 dev veth20-peer 2>/dev/null || true
sudo ip netns exec ns-cliente2 ip link set veth20-peer up
sudo ip netns exec ns-cliente2 ip route add default via 192.168.20.1

echo "  ✅ Namespaces creados:"
echo "     - ns-cliente1 (Hotspot): 192.168.10.100"
echo "     - ns-cliente2 (PPPoE): 192.168.20.100"

# 3. Configurar Redis en Docker (desarrollo)
echo ""
echo "[3/5] Iniciando Redis para desarrollo..."

if ! docker ps | grep -q redis-dev; then
  docker run -d --name redis-dev -p 6379:6379 redis:alpine 2>/dev/null || true
  echo "  ✅ Redis iniciado en Docker (localhost:6379)"
else
  echo "  ✅ Redis ya está corriendo"
fi

# 4. Crear archivo de configuración de desarrollo
echo ""
echo "[4/5] Creando configuración de desarrollo..."

cat > /home/river/smart-router-monolith/config/dev.env <<EOF
# Entorno de Desarrollo (Simulado)
REDIS_URL=redis://localhost:6379
HOTSPOT_IFACE=veth10
PPPOE_IFACE=veth20
MGMT_IFACE=veth99
WAN1_IFACE=veth-wan1
WAN2_IFACE=veth-wan2
LOG_LEVEL=debug
EOF

echo "  ✅ Archivo config/dev.env creado"

# 5. Script de inicio con watch para desarrollo
echo ""
echo "[5/5] Creando script de desarrollo con auto-reload..."

cat > /home/river/smart-router-monolith/scripts/dev-watch.sh <<'EOF'
#!/bin/bash
# Desarrollo con recarga automática
cd /home/river/smart-router-monolith
echo "🔥 Iniciando SmartRouter en modo DESARROLLO (watch)..."
echo "   Edita archivos .ts y se recargarán automáticamente"
echo "   Presiona Ctrl+C para detener"
echo ""
bun --watch src/index.ts
EOF

chmod +x /home/river/smart-router-monolith/scripts/dev-watch.sh

echo ""
echo "✅ Entorno de desarrollo configurado!"
echo "=============================================="
echo ""
echo "📋 Siguientes pasos:"
echo "  1. Iniciar Redis: docker start redis-dev"
echo "  2. Iniciar SmartRouter: ./scripts/dev-watch.sh"
echo "  3. Probar desde namespace: sudo ip netns exec ns-cliente1 ping 192.168.10.1"
echo "  4. Ver logs: tail -f /var/log/unbound/unbound.log"
echo ""
echo "🧹 Limpieza (cuando termines):"
echo "  ./scripts/dev-cleanup.sh"
