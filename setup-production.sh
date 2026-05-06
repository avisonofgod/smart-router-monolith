#!/bin/bash
# Script para configurar SmartRouter para producción
# Ejecutar con: sudo bash setup-production.sh

echo "🚀 Configurando SmartRouter para producción..."

# 1. Dar capacidades a ip y tc
echo "1. Configurando capacidades de red..."
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/ip 2>/dev/null
setcap cap_net_admin,cap_sys_admin+ep /usr/sbin/tc 2>/dev/null
echo "   ✅ Capacidades configuradas"

# 2. Montar bpffs si no está
if [ ! -d /sys/fs/bpf ]; then
    echo "2. Montando bpffs..."
    mount -t bpf bpf /sys/fs/bpf 2>/dev/null
    echo "   ✅ bpffs montado"
fi

# 3. Verificar soporte XDP
echo "3. Verificando soporte XDP..."
if [ -f /proc/config.gz ]; then
    zcat /proc/config.gz | grep -q "CONFIG_XDP_SOCKETS=y" && echo "   ✅ XDP soportado" || echo "   ⚠️  XDP puede no estar soportado"
else
    echo "   ⚠️  No se puede verificar config del kernel"
fi

# 4. Verificar interfaces WAN
echo "4. Verificando interfaces..."
ip link show | grep -E "eth[0-9]:" | head -5

# 5. Configurar sudoers si es necesario
if [ -n "$SUDO_USER" ]; then
    echo "5. Configurando sudoers para $SUDO_USER..."
    echo "$SUDO_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/smartrouter
    chmod 440 /etc/sudoers.d/smartrouter
    echo "   ✅ Sudoers configurado"
fi

echo ""
echo "✅ Configuración completada!"
echo "Ahora puedes ejecutar: bun run src/index.ts"
