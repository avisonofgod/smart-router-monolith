# SmartRouter Monolith — Plan de Proyecto

## Información Orgánizada (de las ideas proporcionadas)

### 1. Arquitectura Monolítica (Kernel + Userspace)
```
SmartRouter Monolith = Bun (Userspace) + eBPF/XDP (Kernel)
                                    ↓
              Todo centralizado en un solo binario
                                    ↓
         No microservicios, no dependencias externas (excepto accel-ppp, Unbound)
```

### 2. Entorno de Desarrollo (Nativo Ubuntu)
- **NO Mininet** (demasiado abstracto)
- **SÍ veth pairs + bridges** (control total del kernel)
- **SÍ eBPF XDP nativo** (verdadero rendimiento)
- **SÍ comandos iproute2 directos** (sin capas intermedias)

### 3. Lógica de Tickets (de ruteros legacy)
- **Pausado**: tiempo SOLO corre cuando WiFi = ON. Al desconectar → guarda TTL en `shadow:{id}`
- **Corrido**: tiempo corre SIEMPRE desde primera conexión. No se pausa nunca.

### 4. Test Suites (Bun)
- `scripts/dev-setup-v2.sh` → Entorno simulado (veth + bridges)
- `scripts/test-suite.ts` → Verificación completa (100+ tests)
- `scripts/perf-test.ts` → Rendimiento (iperf3, latencia)

### 5. Dependencias Críticas
- **Bun** (runtime TypeScript, más rápido que Node.js)
- **Redis** (cerebro, AOF + RDB persistence)
- **eBPF/XDP** (balanceo WAN en kernel-space, 10M+ paquetes/seg)
- **nftables** (firewall stateful, NAT, aislamiento)
- **tc htb** (traffic shaping per-cliente)
- **accel-ppp** (PPPoE server, 500+ clientes)
- **Unbound** (DNS-over-TLS, blocklists)
- **Tailscale** (VPN mesh, aislamiento ACLs)

---

## Lo Faltante (Missing Pieces)

### 1. Portal Cautivo HTML/CSS/JS Completo
- Archivos estáticos en `src/portal/`
- Interfaz responsive para login de tickets
- Vista previa en tiempo real

### 2. systemd Service File para Producción
- `config/smartrouter.service`
- Auto-start, restart always, root (necesario para eBPF)

### 3. Integración Real eBPF ↔ nftables
- `kernel/bpf_loader.ts` debe cargar eBPF y actualizar mapas
- Comunicación kernel-userspace vía **BPF maps** (no archivos)

### 4. Scripts de Despliegue Producción
- `scripts/deploy-prod.sh` (instalación limpia en Ubuntu)
- Verificación de hardware (interfaces, RAM, CPU)

### 5. Documentación Técnica
- `docs/ARCHITECTURE.md` (cómo fluye el paquete)
- `docs/TROUBLESHOOTING.md` (diagnóstico paso a paso)

### 6. Ejemplos de Configuración
- `config/examples/` (tickets, PPPoE clients, WAN setups)

---

## Estructura Final del Proyecto

```
smart-router-monolith/
├── .opencode/                    # Configuración IA (opencode.ai)
│   ├── opencode.jsonc          # Proyecto + skills + cron
│   └── instructions.md         # Senior expertise (YA COMPLETADO)
├── src/                           # Código fuente Bun/TypeScript
│   ├── index.ts                # Orchestrator (punto de entrada)
│   ├── dashboard.ts            # API REST + Portal (puerto 3000/8080)
│   ├── network.ts              # VLANs, nftables, eBPF, WAN health
│   ├── hotspot.ts              # Tickets (pausado/corrido), Redis
│   ├── pppoe.ts               # accel-ppp integration, sessions
│   ├── tailscale.ts           # VPN mesh, ACLs, isolated access
│   ├── dns.ts                 # Unbound, blocklists, DoT
│   ├── types.ts               # TypeScript definitions
│   ├── portal/                # ★ NUEVO: Portal cautivo HTML/CSS/JS
│   │   ├── index.html
│   │   ├── style.css
│   │   └── app.js
│   └── utils/                 # ★ NUEVO: Utilidades compartidas
│       ├── redis.ts            # Redis helpers
│       └── logger.ts          # Logging centralizado
├── kernel/                        # Código kernel eBPF
│   ├── router_kern.c          # XDP program (WAN balance)
│   ├── Makefile               # Compilación (clang -target bpf)
│   ├── bpf_loader.ts         # ★ MEJORADO: Carga eBPF desde Bun
│   └── bpf_maps.h            # ★ NUEVO: Definiciones de mapas BPF
├── config/                        # Configuraciones de producción
│   ├── unbound.conf           # DNS-over-TLS, blocklists
│   ├── accel-ppp.conf        # PPPoE server
│   ├── nftables.conf          # Firewall, NAT, aislamiento
│   ├── setup.sh               # Inicialización VLANs/NAT
│   ├── smartrouter.service    # ★ NUEVO: systemd service
│   └── examples/              # ★ NUEVO: Ejemplos config
├── scripts/                       # Scripts de operación
│   ├── deploy.sh              # Despliegue completo (YA EXITENTE)
│   ├── deploy-prod.sh         # ★ NUEVO: Producción limpia
│   ├── backup.sh              # Respaldar configuraciones
│   ├── monitor.sh             # Monitoreo en tiempo real
│   ├── dev-setup-v2.sh       # Entorno dev (veth + bridges)
│   ├── dev-cleanup.sh         # Limpieza entorno dev
│   ├── test-suite.ts         # Test suite completo (100+ tests)
│   ├── perf-test.ts           # Performance (iperf3)
│   └── load-test-pppoe.ts    # Simulación 100 clientes PPPoE
├── docs/                          # ★ NUEVO: Documentación
│   ├── ARCHITECTURE.md       # Flujo de paquetes completo
│   ├── TROUBLESHOOTING.md    # Diagnóstico paso a paso
│   └── DEPLOYMENT.md         # Guía de instalación
├── package.json                    # Bun dependencies
├── tsconfig.json                  # ★ NUEVO: TypeScript config
└── README.md                      # Documentación principal
```

---

## Siguiente Paso: Crear lo Faltante

Voy a crear los archivos marcados con ★ NUEVO para completar el proyecto.