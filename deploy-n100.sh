#!/bin/bash
# Script de despliegue para N100 real (Fase 3)
# Ejecutar como root en el hardware N100

set -e

echo "🚀 Desplegando SmartRouter Monolith en N100..."

# 1. Verificar kernel
echo "1. Verificando kernel..."
uname -a
cat /proc/version | grep "6.12.21" && echo "✅ Kernel correcto" || echo "⚠️  Kernel puede no ser el compilado"

# 2. Instalar dependencias
echo "2. Instalando dependencias..."
apt update
apt install -y bun redis-server accel-ppp unbound nftables iproute2 bpftool

# 3. Configurar Redis
echo "3. Configurando Redis..."
systemctl enable redis-server
systemctl start redis-server
redis-cli ping | grep PONG && echo "✅ Redis OK"

# 4. Copiar código
echo "4. Copiando código..."
mkdir -p /opt/smart-router
cp -r /home/river/TRABAJO/smart-router-monolith/* /opt/smart-router/

# 5. Configurar capacidades
echo "5. Configurando capacidades..."
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/ip
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/tc

# 6. Cargar eBPF
echo "6. Cargando eBPF..."
cd /opt/smart-router
export PATH="$HOME/.bun/bin:$PATH"
if [ -f kernel/router_kern.o ]; then
    ip link set dev eth0 xdp obj kernel/router_kern.o sec xdp_wan_balance 2>&1 && echo "✅ eBPF cargado"
    ip link show eth0 | grep xdp
fi

# 7. Iniciar SmartRouter
echo "7. Iniciando SmartRouter..."
cd /opt/smart-router
nohup bun run src/index.ts > /var/log/smartrouter.log 2>&1 &
sleep 5
ps aux | grep "bun run src/index.ts" | grep -v grep && echo "✅ SmartRouter iniciado"

# 8. Verificar
echo "8. Verificando..."
curl -s http://localhost:3000/api/stats | head -20

echo ""
echo "✅ SmartRouter Monolith desplegado exitosamente en N100!"
echo "📊 Dashboard: http://$(hostname -I | awk '{print $1}'):3000"
