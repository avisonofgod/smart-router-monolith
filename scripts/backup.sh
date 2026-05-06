#!/bin/bash
# Script de respaldo para SmartRouter Monolith

BACKUP_DIR="/home/river/smart-router-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.tar.gz"

echo "📦 Creando respaldo de SmartRouter..."
echo "======================================"

# Crear directorio de respaldos
mkdir -p "$BACKUP_DIR"

# 1. Respaldar configuraciones de red
echo "[1/6] Configuraciones de red..."
mkdir -p /tmp/smartrouter_backup/network
iptables-save > /tmp/smartrouter_backup/network/iptables.rules 2>/dev/null || true
nft list ruleset > /tmp/smartrouter_backup/network/nftables.conf 2>/dev/null || true
ip addr show > /tmp/smartrouter_backup/network/ip_addr.txt 2>/dev/null || true
ip route show > /tmp/smartrouter_backup/network/ip_route.txt 2>/dev/null || true

# 2. Respaldar configuraciones de servicios
echo "[2/6] Configuraciones de servicios..."
mkdir -p /tmp/smartrouter_backup/configs
cp -r /home/river/smart-router-monolith/config/* /tmp/smartrouter_backup/configs/ 2>/dev/null || true
cp /etc/unbound/unbound.conf /tmp/smartrouter_backup/configs/unbound.conf.bak 2>/dev/null || true
cp /etc/accel-ppp.conf /tmp/smartrouter_backup/configs/accel-ppp.conf.bak 2>/dev/null || true
cp /etc/redis/redis.conf /tmp/smartrouter_backup/configs/redis.conf.bak 2>/dev/null || true

# 3. Respaldar datos de Redis
echo "[3/6] Datos de Redis..."
mkdir -p /tmp/smartrouter_backup/redis
redis-cli BGSAVE
sleep 5
cp /var/lib/redis/dump.rdb /tmp/smartrouter_backup/redis/ 2>/dev/null || true
redis-cli --rdb /tmp/smartrouter_backup/redis/dump.rdb 2>/dev/null || true

# 4. Respaldar logs
echo "[4/6] Archivos de log..."
mkdir -p /tmp/smartrouter_backup/logs
cp /var/log/unbound/unbound.log /tmp/smartrouter_backup/logs/ 2>/dev/null || true
cp /var/log/accel-ppp/accel-ppp.log /tmp/smartrouter_backup/logs/ 2>/dev/null || true
journalctl -u smartrouter > /tmp/smartrouter_backup/logs/smartrouter.log 2>/dev/null || true

# 5. Respaldar código fuente
echo "[5/6] Código fuente..."
mkdir -p /tmp/smartrouter_backup/src
cp -r /home/river/smart-router-monolith/src /tmp/smartrouter_backup/ 2>/dev/null || true
cp -r /home/river/smart-router-monolith/kernel /tmp/smartrouter_backup/ 2>/dev/null || true

# 6. Crear archivo tarball
echo "[6/6] Comprimiendo..."
cd /tmp
tar -czf "$BACKUP_FILE" smartrouter_backup/

# Limpiar temporales
rm -rf /tmp/smartrouter_backup/

# Verificar tamaño
SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo "✅ Respaldo completado exitosamente!"
echo "======================================"
echo "Archivo: $BACKUP_FILE"
echo "Tamaño: $SIZE"
echo ""
echo "Para restaurar:"
echo "  tar -xzf $BACKUP_FILE -C /"
