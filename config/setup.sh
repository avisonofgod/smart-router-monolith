#!/bin/bash
# Script de configuración inicial de red para SmartRouter
# VLANs: 10=Hotspot, 20=PPPoE, 99=Gestión

set -e

echo "🔧 Configurando red para SmartRouter..."

# 1. Habilitar IP forwarding
echo "  1. Habilitando IP forwarding..."
sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

# 2. Crear VLANs
echo "  2. Creando VLANs..."
ip link add link eth0 name eth0.10 type vlan id 10 2>/dev/null || true
ip link add link eth0 name eth0.20 type vlan id 20 2>/dev/null || true
ip link add link eth0 name eth0.99 type vlan id 99 2>/dev/null || true

# 3. Asignar IPs a VLANs
echo "  3. Asignando IPs..."
ip addr add 192.168.10.1/24 dev eth0.10 2>/dev/null || true
ip addr add 192.168.20.1/24 dev eth0.20 2>/dev/null || true
ip addr add 10.99.0.1/24 dev eth0.99 2>/dev/null || true

# 4. Activar interfaces
echo "  4. Activando interfaces..."
ip link set eth0.10 up
ip link set eth0.20 up
ip link set eth0.99 up

# 5. Configurar NAT básico
echo "  5. Configurando NAT..."
iptables -t nat -A POSTROUTING -o eth1 -j MASQUERADE 2>/dev/null || true
iptables -t nat -A POSTROUTING -o eth2 -j MASQUERADE 2>/dev/null || true

# 6. Permitir forwarding básico
echo "  6. Configurando forwarding..."
iptables -A FORWARD -i eth0.10 -o eth1 -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i eth0.10 -o eth2 -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i eth0.20 -o eth1 -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i eth0.20 -o eth2 -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i eth0.99 -o eth1 -j ACCEPT 2>/dev/null || true
iptables -A FORWARD -i eth0.99 -o eth2 -j ACCEPT 2>/dev/null || true

echo "✅ Configuración de red completada!"
echo ""
echo "VLAN 10 (Hotspot): 192.168.10.1/24"
echo "VLAN 20 (PPPoE):   192.168.20.1/24"
echo "VLAN 99 (Gestión): 10.99.0.1/24"
