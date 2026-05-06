#!/bin/bash
# Script de monitoreo en tiempo real para SmartRouter

echo "📊 SmartRouter Monitoreo"
echo "======================"
echo "Presiona Ctrl+C para salir"
echo ""

while true; do
  clear
  echo "📊 SmartRouter Monitoreo - $(date)"
  echo "======================================"
  echo ""
  
  # 1. Estado del servicio SmartRouter
  echo "🚀 Estado del Servicio:"
  if systemctl is-active --quiet smartrouter; then
    echo "  ✅ SmartRouter: ACTIVO"
  else
    echo "  ❌ SmartRouter: INACTIVO"
  fi
  echo ""
  
  # 2. Uso de recursos
  echo "💾 Recursos del Sistema:"
  echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')%"
  echo "  RAM: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
  echo "  Disco: $(df -h / | grep / | awk '{print $3 "/" $2}')"
  echo ""
  
  # 3. Estado de WANs
  echo "🌐 Estado de WANs:"
  
  # WAN1
  if ping -c 1 -W 1 8.8.8.8 -I eth1 >/dev/null 2>&1; then
    LATENCY1=$(ping -c 1 -W 1 8.8.8.8 -I eth1 | grep 'time=' | awk '{print $7}')
    echo "  ✅ WAN1 (eth1): ONLINE - $LATENCY1"
  else
    echo "  ❌ WAN1 (eth1): OFFLINE"
  fi
  
  # WAN2
  if ping -c 1 -W 1 8.8.8.8 -I eth2 >/dev/null 2>&1; then
    LATENCY2=$(ping -c 1 -W 1 8.8.8.8 -I eth2 | grep 'time=' | awk '{print $7}')
    echo "  ✅ WAN2 (eth2): ONLINE - $LATENCY2"
  else
    echo "  ❌ WAN2 (eth2): OFFLINE"
  fi
  echo ""
  
  # 4. Clientes activos
  echo "👥 Clientes Activos:"
  
  # Hotspot
  HOTSPOT_COUNT=$(redis-cli SMEMBERS hotspot_tickets 2>/dev/null | wc -l)
  echo "  🔥 Hotspot: $HOTSPOT_COUNT clientes"
  
  # PPPoE
  PPPOE_COUNT=$(redis-cli SMEMBERS pppoe_sessions 2>/dev/null | wc -l)
  echo "  📡 PPPoE: $PPPOE_COUNT clientes"
  echo ""
  
  # 5. Tráfico de red (simple)
  echo "📈 Tráfico de Red (últimos 5 seg):"
  rx1=$(cat /sys/class/net/eth0/statistics/rx_bytes)
  tx1=$(cat /sys/class/net/eth0/statistics/tx_bytes)
  sleep 5
  rx2=$(cat /sys/class/net/eth0/statistics/rx_bytes)
  tx2=$(cat /sys/class/net/eth0/statistics/tx_bytes)
  
  rx_rate=$(( (rx2 - rx1) / 5 / 1024 ))
  tx_rate=$(( (tx2 - tx1) / 5 / 1024 ))
  
  echo "  ↓ Descarga: ${rx_rate} KB/s"
  echo "  ↑ Subida: ${tx_rate} KB/s"
  echo ""
  
  # 6. Reglas nftables activas
  echo "🛡️  Firewall (nftables):"
  nft list sets 2>/dev/null | grep -E "hotspot|pppoe" | wc -l | awk '{print "  Reglas activas: " $1}'
  echo ""
  
  # 7. Servicios relacionados
  echo "🔧 Servicios:"
  systemctl is-active --quiet redis-server && echo "  ✅ Redis" || echo "  ❌ Redis"
  systemctl is-active --quiet unbound && echo "  ✅ Unbound" || echo "  ❌ Unbound"
  systemctl is-active --quiet accel-ppp && echo "  ✅ accel-ppp" || echo "  ❌ accel-ppp"
  tailscale status >/dev/null 2>&1 && echo "  ✅ Tailscale" || echo "  ❌ Tailscale"
  echo ""
  
  # 8. Últimos logs
  echo "📋 Últimos eventos (SmartRouter):"
  journalctl -u smartrouter -n 3 --no-pager 2>/dev/null | tail -3 | sed 's/^/  /'
  echo ""
  
  echo "======================================"
  echo "Actualizando en 5 segundos..."
  sleep 5
done
