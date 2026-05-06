# FASE 2: PRUEBAS EN QEMU - ESTADO ACTUAL

## Fecha: 5 Mayo 2026

## ✅ Logros Fase 2

### 1. eBPF Compilado Exitosamente
- **Archivo**: `kernel/router_kern.o` (1.3K)
- **Compilación**: Exitosa con `vmlinux.h` y clang
- **Headers**: Usa `vmlinux.h` generado de BTF (3.4MB)
- **Makefile**: Configurado con paths correctos del kernel 6.12.21

### 2. SmartRouter TypeScript Corregido
- **network.ts**: VLANs, eBPF, nftables, checkWANHealth, switchWAN
- **hotspot.ts**: Corregido sessionChecker(), disconnectClient()
- **pppoe.ts**: Añadido checkActiveSessions(), getActiveCount()
- **dns.ts**: Unbound sin instalación automática
- **tailscale.ts**: Start() en lugar de init()
- **index.ts**: Todas las funciones conectadas correctamente

### 3. QEMU Funcionando
- **Kernel**: bzImage-n100-router (Linux 6.12.21 monolitico)
- **Acceso**: Telnet en puerto 5555
- **Shared folder**: 9p montado en `/mnt/host_code`
- **XDP registrado**: `NET: Registered PF_XDP protocol family`

### 4. Redis Funcionando
- **Versión**: Compilado desde fuente (redis-stable)
- **Estado**: Escuchando en puerto 6379
- **Conexión**: SmartRouter se conecta exitosamente

## ⚠️ Problemas Identificados

### 1. Permisos Root en Host
- **Problema**: eBPF/XDP requiere sudo para `ip link set xdp`
- **Solución**: Probar en QEMU donde somos root
- **Alternativa**: Usar `bpf_loader.ts` (necesita revisión)

### 2. iproute2 en QEMU es Minimalista
- **Problema**: BusyBox ip no soporta `xdp obj`
- **Solución**: Compilar iproute2 completo para QEMU o usar tc
- **Estado**: `tc` sí está disponible con soporte básico

### 3. Herramientas en QEMU
- ✅ ip (minimal)
- ✅ tc (básico)
- ❌ bpftool (no instalado)
- ❌ bun (no disponible)

## 🎯 Próximos Pasos

### Inmediato (Fase 2)
1. **Probar lógica de negocio sin eBPF**:
   ```bash
   export PATH="$HOME/.bun/bin:$PATH"
   cd /home/river/TRABAJO/smart-router-monolith
   bun run src/index.ts  # Ya corre sin eBPF/XDP
   ```

2. **Validar Redis + Hotspot**:
   - Crear tickets
   - Activar con MAC
   - Verificar reconexión automática

3. **Compilar iproute2 para QEMU** con soporte XDP:
   ```bash
   # Dentro de QEMU
   apk add iproute2  # o compilar desde fuente
   ```

### Mediano Plazo (Fase 3: Producción N100)
1. **Instalar en N100 real** donde sí tenemos permisos root
2. **Probar eBPF/XDP** con interfaces reales (eth0, eth1)
3. **Validar balanceo WAN** con 500+ clientes

## 📊 Comandos Clave

### Host (SmartRouter)
```bash
# Iniciar SmartRouter (sin eBPF por permisos)
export PATH="$HOME/.bun/bin:$PATH"
cd /home/river/TRABAJO/smart-router-monolith
bun run src/index.ts

# Redis
/tmp/redis/redis-stable/src/redis-server --daemonize yes
/tmp/redis/redis-stable/src/redis-cli ping
```

### QEMU
```bash
# Conectar
telnet 127.0.0.1 5555

# Dentro de QEMU (como root)
mount -t 9p -o trans=virtio host_code /mnt/host_code
cd /mnt/host_code/kernel
ls -la router_kern.o

# Verificar XDP
dmesg | grep -i xdp
ip link show
```

## 💡 Lecciones Aprendidas
1. **eBPF requiere kernel 4.18+** con soporte XDP (verificado en QEMU 6.12.21)
2. **BusyBox iproute2 es limitado** para XDP, necesita versión completa
3. **9p filesystem** funciona excelente para compartir archivos con QEMU
4. **Redis desde fuente** es la mejor opción sin sudo
5. **TypeScript con Bun** corre bien, errores eran de sintaxis (ya corregidos)

## ✅ FASE 2 EN PROGRESO
**SmartRouter lógica funcional. eBPF pendiente por permisos/tooling en QEMU.**
