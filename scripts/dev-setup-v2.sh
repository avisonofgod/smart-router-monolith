#!/bin/bash
# Entorno de Desarrollo NATIVO (veth + bridges) para SmartRouter
# Basado en recomendación: Ubuntu nativo > Mininet para eBPF/XDP

set -e

echo "🔧 Configurando laboratorio NATIVO para SmartRouter..."
echo "================================================"

# 1. Crear veth pairs (simulan CABLES entre dispositivos)
echo "[1/5] Creando veth pairs (cables virtuales)..."

# === WAN1: Simula modem/ISP #1 ===
sudo ip link add wan1-modem type veth peer name wan1-router 2>/dev/null || true
sudo ip addr add 10.1.1.1/24 dev wan1-modem 2>/dev/null || true
sudo ip link set wan1-modem up
sudo ip link set wan1-router up
echo "  ✅ wan1-modem (10.1.1.1) ↔ wan1-router"

# === WAN2: Simula modem/ISP #2 ===
sudo ip link add wan2-modem type veth peer name wan2-router 2>/dev/null || true
sudo ip addr add 10.2.2.1/24 dev wan2-modem 2>/dev/null || true
sudo ip link set wan2-modem up
sudo ip link set wan2-router up
echo "  ✅ wan2-modem (10.2.2.1) ↔ wan2-router"

# === LAN Client: Simula PC cliente ===
sudo ip link add lan-client type veth peer name lan-router 2>/dev/null || true
sudo ip addr add 192.168.100.1/24 dev lan-client 2>/dev/null || true
sudo ip link set lan-client up
sudo ip link set lan-router up
echo "  ✅ lan-client (192.168.100.1) ↔ lan-router"

# 2. Crear Bridges (simulan SWITCHES)
echo ""
echo "[2/5] Creando bridges (switches virtuales)..."

# Bridge para Hotspot (VLAN 10)
sudo ip link add br-hotspot type bridge 2>/dev/null || true
sudo ip link set lan-router master br-hotspot 2>/dev/null || true
sudo ip addr add 192.168.10.1/24 dev br-hotspot 2>/dev/null || true
sudo ip link set br-hotspot up
echo "  ✅ br-hotspot (192.168.10.1) → Hotspot switch"

# Bridge para PPPoE (VLAN 20) - en producción sería VLAN taggeada
sudo ip link add br-pppoe type bridge 2>/dev/null || true
sudo ip link set lan-router master br-pppoe 2>/dev/null || true
sudo ip addr add 192.168.20.1/24 dev br-pppoe 2>/dev/null || true
sudo ip link set br-pppoe up
echo "  ✅ br-pppoe (192.168.20.1) → PPPoE switch"

# Bridge para Gestión (VLAN 99)
sudo ip link add br-mgmt type bridge 2>/dev/null || true
sudo ip link set lan-router master br-mgmt 2>/dev/null || true
sudo ip addr add 10.99.0.1/24 dev br-mgmt 2>/dev/null || true
sudo ip link set br-mgmt up
echo "  ✅ br-mgmt (10.99.0.1) → Management switch"

# 3. Configurar IPs en interfaces del router
echo ""
echo "[3/5] Configurando IPs en interfaces del router..."

# WANs (lado router de los veth pairs)
sudo ip addr add 10.1.1.2/24 dev wan1-router 2>/dev/null || true
sudo ip addr add 10.2.2.2/24 dev wan2-router 2>/dev/null || true
echo "  ✅ wan1-router: 10.1.1.2 (WAN1)"
echo "  ✅ wan2-router: 10.2.2.2 (WAN2)"

# 4. Habilitar IP forwarding y reglas básicas
echo ""
echo "[4/5] Configurando forwarding y NAT básico..."

sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
sudo iptables -t nat -A POSTROUTING -o wan1-router -j MASQUERADE 2>/dev/null || true
sudo iptables -t nat -A POSTROUTING -o wan2-router -j MASQUERADE 2>/dev/null || true
sudo iptables -A FORWARD -i br-hotspot -o wan1-router -j ACCEPT 2>/dev/null || true
sudo iptables -A FORWARD -i br-pppoe -o wan2-router -j ACCEPT 2>/dev/null || true
echo "  ✅ NAT y forwarding configurados"

# 5. Iniciar Redis en Docker (entorno dev)
echo ""
echo "[5/5] Iniciando Redis para desarrollo..."

if ! docker ps | grep -q redis-dev; then
  docker run -d --name redis-dev -p 6379:6379 redis:alpine 2>/dev/null || true
  echo "  ✅ Redis iniciado en Docker (localhost:6379)"
else
  echo "  ✅ Redis ya está corriendo"
fi

# Resumen
echo ""
echo "✅ LABORATORIO NATIVO LISTO!"
echo "================================================"
echo ""
echo "📡 Topología creada:"
echo "   [Internet Simulado]"
echo "        ↓              ↓"
echo "   wan1-modem     wan2-modem"
echo "   (10.1.1.1)    (10.2.2.1)"
echo "        ↓              ↓"
echo "   wan1-router    wan2-router"
echo "   (10.1.1.2)     (10.2.2.2)  ← SmartRouter aquí"
echo "        ↓              ↓"
echo "   └────── br-hotspot (192.168.10.1) ← Hotspot"
echo "        └───── br-pppoe (192.168.20.1) ← PPPoE"
echo "         └──── br-mgmt (10.99.0.1) ← Gestión"
echo "                ↓"
echo "           lan-client (192.168.100.1)"
echo ""
echo "🚀 Para iniciar SmartRouter:"
echo "   cd /home/river/smart-router-monolith"
echo "   bun run src/index.ts"
echo ""
echo "🧪 Para probar desde lan-client:"
echo "   sudo ip netns exec ns-client ping 192.168.10.1"
echo ""
echo "🧹 Limpieza:"
echo "   ./scripts/dev-cleanup-v2.sh"
