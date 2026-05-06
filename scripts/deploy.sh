#!/bin/bash
# Script de despliegue para SmartRouter Monolith

set -e

echo "🚀 Desplegando SmartRouter Monolith..."
echo "======================================"

# 1. Verificar dependencias
echo "[1/8] Verificando dependencias..."

command -v bun >/dev/null 2>&1 || {
    echo "Instalando Bun..."
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
}

command -v redis-server >/dev/null 2>&1 || {
    echo "Instalando Redis..."
    apt update && apt install -y redis-server
}

command -v accel-pppd >/dev/null 2>&1 || {
    echo "Instalando accel-ppp..."
    apt update && apt install -y accel-ppp
}

command -v unbound >/dev/null 2>&1 || {
    echo "Instalando Unbound..."
    apt update && apt install -y unbound
}

command -v nft >/dev/null 2>&1 || {
    echo "Instalando nftables..."
    apt update && apt install -y nftables
}

command -v tailscale >/dev/null 2>&1 || {
    echo "Instalando Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
}

# 2. Configurar Redis
echo "[2/8] Configurando Redis..."
cat > /etc/redis/redis.conf <<EOF
bind 127.0.0.1
port 6379
appendonly yes
appendfsync everysec
maxmemory 256mb
maxmemory-policy allkeys-lru
EOF
systemctl restart redis-server

# 3. Configurar VLANs
echo "[3/8] Configurando VLANs..."
source /home/river/smart-router-monolith/config/setup.sh

# 4. Cargar nftables
echo "[4/8] Cargando reglas nftables..."
nft -f /home/river/smart-router-monolith/config/nftables.conf

# 5. Configurar accel-ppp
echo "[5/8] Configurando PPPoE..."
cp /home/river/smart-router-monolith/config/accel-ppp.conf /etc/accel-ppp.conf
systemctl restart accel-ppp || accel-pppd -c /etc/accel-ppp.conf -d

# 6. Configurar Unbound
echo "[6/8] Configurando DNS..."
cp /home/river/smart-router-monolith/config/unbound.conf /etc/unbound/unbound.conf
systemctl restart unbound

# 7. Compilar eBPF
echo "[7/8] Compilando eBPF..."
cd /home/river/smart-router-monolith/kernel
make clean && make
make load || echo "⚠️  Error cargando eBPF (revisar manualmente)"

# 8. Iniciar SmartRouter
echo "[8/8] Iniciando SmartRouter Monolith..."
cd /home/river/smart-router-monolith
bun install
chmod +x src/*.ts

# Crear servicio systemd
cat > /etc/systemd/system/smartrouter.service <<EOF
[Unit]
Description=SmartRouter Monolith
After=network.target redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/home/river/smart-router-monolith
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable smartrouter
systemctl start smartrouter

echo ""
echo "✅ SmartRouter Monolith desplegado exitosamente!"
echo "======================================"
echo "Dashboard: http://10.99.0.1:3000"
echo "API: http://10.99.0.1:3000/api/metrics"
echo ""
echo "Ver logs: journalctl -u smartrouter -f"
