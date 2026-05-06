#!/bin/bash
# Instalación completa en N100 - SmartRouter Monolith
# Ejecutar como root: sudo bash install-n100.sh

set -e

echo "🚀 Instalando SmartRouter Monolith en N100..."

# 1. Instalar dependencias
echo "1. Instalando dependencias..."
apt update
apt install -y bun redis-server accel-ppp unbound nftables iproute2 bpftool \
  clang libbpf-dev build-essential

# 2. Configurar Redis
echo "2. Configurando Redis..."
systemctl enable redis-server
systemctl start redis-server
redis-cli ping | grep -q PONG && echo "   ✅ Redis OK"

# 3. Dar capacidades de red
echo "3. Configurando capacidades..."
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/ip
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/tc
echo "   ✅ Capacidades configuradas"

# 4. Crear directorio e instalar
echo "4. Instalando SmartRouter..."
mkdir -p /opt/smart-router
cd /opt/smart-router

# Copiar archivos (asumiendo que smart-router-deployment.tar.gz está en /tmp)
if [ -f /tmp/smart-router-deployment.tar.gz ]; then
    tar xzf /tmp/smart-router-deployment.tar.gz
    echo "   ✅ Archivos extraídos"
else
    echo "   ⚠️  No se encontró el paquete de despliegue"
    echo "   Por favor copia manualmente el código a /opt/smart-router"
fi

# 5. Instalar dependencias Bun
echo "5. Instalando dependencias Bun..."
cd /opt/smart-router
bun install
echo "   ✅ Dependencias instaladas"

# 6. Montar bpffs si no está
echo "6. Verificando bpffs..."
if [ ! -d /sys/fs/bpf ]; then
    mount -t bpf bpf /sys/fs/bpf
    echo "bpf" >> /etc/fstab
    echo "   ✅ bpffs montado"
fi

# 7. Cargar eBPF
echo "7. Cargando eBPF..."
if [ -f /opt/smart-router/kernel/router_kern.o ]; then
    export PATH="$HOME/.bun/bin:$PATH"
    ip link set dev eth0 xdp obj /opt/smart-router/kernel/router_kern.o sec xdp_wan_balance 2>&1 && \
        echo "   ✅ eBPF cargado en eth0"
    ip link set dev eth1 xdp obj /opt/smart-router/kernel/router_kern.o sec xdp_wan_balance 2>&1 && \
        echo "   ✅ eBPF cargado en eth1"
else
    echo "   ⚠️  router_kern.o no encontrado"
fi

# 8. Configurar nftables
echo "8. Configurando nftables..."
if [ -f /opt/smart-router/config/nftables.conf ]; then
    nft -f /opt/smart-router/config/nftables.conf 2>&1 && echo "   ✅ nftables configurado"
fi

# 9. Iniciar SmartRouter
echo "9. Iniciando SmartRouter..."
cd /opt/smart-router
export PATH="$HOME/.bun/bin:$PATH"
nohup bun run src/index.ts > /var/log/smartrouter.log 2>&1 &
sleep 3
ps aux | grep "bun run src/index.ts" | grep -v grep && echo "   ✅ SmartRouter iniciado"

# 10. Verificar
echo "10. Verificando..."
curl -s http://localhost:3000/api/stats | head -20

echo ""
echo "✅ SmartRouter Monolith instalado y operativo en N100!"
echo "📊 Dashboard: http://$(hostname -I | awk '{print $1}'):3000"
echo "📋 Logs: tail -f /var/log/smartrouter.log"
