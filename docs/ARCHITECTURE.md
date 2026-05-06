# SmartRouter Monolith — Arquitectura Técnica#

## Flujo de un Paquete (WiFi Hotspot)

```
1. Cliente (192.168.10.50) → eth0.10 (VLAN 10)
         ↓
2. nftables (tabla hotspot)
   ├─ ¿IP en active_clients? → SÍ → permitir
   └─ NO → redirigir a 192.168.10.1:8080 (portal)
         ↓ (si autenticado)
3. eBPF XDP en eth0
   ├─ Hash(src_ip) % 2 = 0 → WAN1 (eth1)
   └─ Hash(src_ip) % 2 = 1 → WAN2 (eth2)
         ↓
4. Routing table (FIB)
   ├─ WAN1 seleccionada → ip route via 192.168.1.1 dev eth1
   └─ WAN2 seleccionada → ip route via 192.168.2.1 dev eth2
         ↓
5. NAT (nftables nat table)
   ├─ WAN1: snat to 192.168.1.209 (DHCP IP)
   └─ WAN2: snat to 192.168.2.210 (DHCP IP)
         ↓
6. Internet (8.8.8.8 responde)
         ↓
7. Paquete vuelve por WAN1/WAN2
         ↓
8. De-NAT: 192.168.1.209 → 192.168.10.50
         ↓
9. eBPF XDP (ingress) → redirige a eth0.10
         ↓
10. nftables: conntrack permite (estado ESTABLISHED)
         ↓
11. tc htb shaper (eth0.10)
    Limita a 10Mbps (según plan del ticket)
         ↓
12. Cliente recibe respuesta ✅
```

---

## Flujo PPPoE (Residencial)

```
1. Cliente Router → VLAN 20 (eth0.20, PPPoE Discovery)
         ↓
2. accel-ppp (daemon en puerto 2001)
   ├─ Recibe PADI (Discovery) → envía PADO (Offer)
   └─ Recibe PADR (Request) → envía PADS (Session Confirmation)
         ↓
3. accel-ppp ejecuta pppoe_auth.py
   ├─ Lee pppoe:client:{user} de Redis
   ├─ Verifica password (CHAP/PAP)
   └─ Responde SUCCESS + FRAMED_IP_ADDRESS (192.168.20.50)
         ↓
4. accel-ppp ejecuta pppoe_up.py
   ├─ Lee speed:group:{id} de Redis (velocidad)
   ├─ Crea pipes tc htb (si no existen)
   ├─ Agrega IP a nftables active_clients (VLAN 20)
   ├─ Asigna FIB (sticky session: hash(src_ip) % 2)
   └─ Marca en Redis: status=online, fib={0,1}
         ↓
5. Tráfico fluye como Hotspot (pasos 3-12 anteriores)
```

---

## Redis: El Cerebro

### Keyspace Design

```
# === HOTSPOT ===
ticket:{id}          → Hash: {id, username, password, plan, profile (pausado|corrido), 
                            created_at, expires_at, start_time, remaining_ms, 
                            paused, paused_at, total_paused_ms, status}
shadow:{id}         → String: "1" con TTL = remaining_seconds
ex:session:{IP}      → String: "shadow:{id}" con TTL = remaining_seconds
metadata:{IP}        → Hash: {username, mac, start_time, profile, last_seen, unreachable_count}
hs:online            → Set: [username1, username2, ...] (currently connected)
ticket:batch:{id}     → Hash: {name, plan, profile, quantity, created_at}
ticket:batch:{id}:tickets → Set: [ticketId1, ticketId2, ...]
hotspot:logs        → List: [log1, log2, ...] (max 200)

# === PPPoE ===
pppoe:client:{user}  → Hash: {username, password, group_id, speedGroupId, assignedIp, 
                            ip, iface, status, estado_red, pago_status, 
                            fib, connected_at, nombre, telefono, email}
pppoe_sessions        → Set: [user1, user2, ...] (active sessions)
speed:group:{id}      → Hash: {nombre, download, upload, pipeDown, pipeUp, table}
wan:capacity        → Hash: {wan1_speed, wan2_speed} (Kbit/s)
balance:fib_counter    → String: counter for round-robin FIB

# === WAN ===
wan:eth1             → Hash: {status (online|offline), latency, last_check}
wan:eth2             → Hash: {status (online|offline), latency, last_check}
wan:balance:config   → Hash: {mode, threshold, check_interval}

# === SYSTEM ===
metrics:wan          → Hash: {wan1_latency, wan1_status, wan2_latency, wan2_status}
metrics:clients       → Hash: {hotspot, pppoe, total}
system:config        → Hash: {hostname, timezone, version}
```

---

## eBPF XDP: Kernel Acceleration

### Program Loading

```bash
# Compile
cd /home/river/smart-router-monolith/kernel
make

# Load XDP program
sudo ip link set dev eth0 xdp obj router_kern.o sec xdp_wan_balance

# Verify
sudo bpftool prog list | grep xdp_wan_balance

# Check stats
sudo bpftool map show
sudo bpftool map dump id <map_id>
```

### How it works

```c
SEC("xdp_wan_balance")
int xdp_wan_balance_prog(struct xdp_md *ctx) {
    // 1. Parse Ethernet + IP headers
    // 2. Hash source IP: hash = (src_ip ^ (src_ip >> 16)) & 0x1
    // 3. Lookup WAN status: is WAN selected online?
    // 4. If offline, switch to other WAN
    // 5. Update statistics in wan_stats map
    // 6. Return XDP_PASS (let Linux networking stack handle routing)
}
```

**Performance**: 10M+ packets/sec, <1ms latency added.

---

## nftables: Firewall & NAT

### Key Tables

| Table | Purpose | Chains |
|-------|---------|--------|
| `hotspot` | WiFi clients | `prerouting`, `forward` |
| `pppoe` | PPPoE clients | `forward` |
| `management` | VLAN 99 (isolated) | `input`, `forward` |
| `nat` | Outbound NAT | `postrouting` |
| `filter` | General firewall | `input`, `forward`, `output` |

### Isolation Rules (Critical)

```nftables
# Isolate hotspot clients between themselves
iifname "eth0.10" oifname "eth0.10" drop

# Isolate PPPoE clients between themselves
iifname "eth0.20" oifname "eth0.20" drop

# Isolate management (VLAN 99) from clients
iifname "eth0.99" oifname { "eth0.10", "eth0.20" } drop
```

---

## Traffic Shaping (tc htb)

### Per-Client Pipes

```
Plan 10Mbps:
  pipe 100 (download) → rate 10mbit
  pipe 101 (upload) → rate 5mbit

Plan 20Mbps:
  pipe 200 (download) → rate 20mbit
  pipe 201 (upload) → rate 10mbit

Apply to client:
  tc class add dev eth0.10 parent 1: classid 1:{client_id} htb rate 10mbit
  tc qdisc add dev eth0.10 parent 1:{client_id} handle {client_id}: sfq
```

---

## Tailscale: Isolated VPN Mesh

### ACLs (Access Control Lists)

```json
{
  "acls": [
    // Management (VLAN 99) can access everything
    {"action": "accept", "src": ["10.99.0.0/24"], "dst": ["*:*"]},
    
    // Isolate Hotspot clients
    {"action": "deny", "src": ["192.168.10.0/24"], "dst": ["192.168.10.0/24"]},
    
    // Isolate PPPoE clients
    {"action": "deny", "src": ["192.168.20.0/24"], "dst": ["192.168.20.0/24"]},
    
    // Allow internet access (via Tailscale exit nodes)
    {"action": "accept", "src": ["autogroup:member"], "dst": ["autogroup:internet:*"]}
  ]
}
```

---

## System Flow Diagram

```
                          ┌────────────────────────────────────┐
                          │     SmartRouter Monolith           │
                          │   (Single Bun Process)           │
                          └──────────────┬───────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
            ┌───────▼────┐    ┌───────▼────┐    ┌───────▼────┐
            │   Redis     │    │    Kernel   │    │   Unbound   │
            │            │    │            │    │            │
            │ ticket:*   │    │ eBPF XDP   │    │ DNS-over-  │
            │ pppoe:*    │    │ nftables   │    │   TLS       │
            │ shadow:*   │    │ tc htb     │    │ blocklists  │
            └────────────┘    └──────┬─────┘    └────────────┘
                                         │
                                 ┌───────▼────┐
                                 │   Tailscale  │
                                 │  (isolated) │
                                 └─────────────┘
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Max clients** | 500+ | Tested with load-test-pppoe.ts |
| **eBPF throughput** | 10M+ pps | XDP in driver space |
| **Redis ops/sec** | 50k+ | Localhost, AOF enabled |
| **WAN failover** | <3s | 3 consecutive ping failures |
| **Hotspot latency** | +1ms | eBPF XDP processing |
| **Ticket precision** | ±1s | Redis TTL (shadow keys) |

---

## Senior Troubleshooting Flow

### "Client can't connect"

1. **Check physical layer**: `ip link show eth0.10` → should be UP
2. **Check DHCP**: `journalctl -u isc-dhcp-server -f`
3. **Check nftables**: `nft list chain inet hotspot prerouting`
4. **Check Redis**: `redis-cli HGETALL ticket:abc123`
5. **Check eBPF**: `bpftool prog list | grep xdp`
6. **Check accel-ppp**: `tail -f /var/log/accel-ppp/accel-ppp.log`

### "WAN failover not working"

1. **Check WAN status**: `redis-cli HGETALL wan:eth1`
2. **Check eBPF stats**: `bpftool map dump id <wan_stats_map_id>`
3. **Check routing**: `ip route show`
4. **Manual failover test**: `sudo ip route replace default via 192.168.2.1 dev eth2`
5. **Check nftables NAT**: `nft list table inet nat`

---
