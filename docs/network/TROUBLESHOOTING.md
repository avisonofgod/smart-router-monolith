# SmartRouter Monolith — Troubleshooting Guide#

## Quick Diagnostic Commands

### 1. Is SmartRouter running?

```bash
# Check systemd service
systemctl status smartrouter

# Check process
ps aux | grep smart-router

# Check logs
journalctl -u smartrouter -f
```

### 2. Is Redis working?

```bash
# Ping Redis
redis-cli ping
# Should respond: PONG

# Check keys
redis-cli KEYS * | head -20

# Check memory usage
redis-cli INFO memory | grep used_memory_human
```

### 3. Are VLANs up?

```bash
ip link show | grep eth0
# Should show: eth0.10, eth0.20, eth0.99 UP

# Check IPs
ip addr show | grep "inet 192.168"
```

### 4. Is eBPF loaded?

```bash
# Check XDP programs
sudo ip link show | grep xdp

# Check with bpftool
sudo bpftool prog list | grep xdp_wan_balance

# Check maps
sudo bpftool map show
```

### 5. Is nftables configured?

```bash
# List all tables
sudo nft list tables

# Check hotspot rules
sudo nft list table inet hotspot

# Check PPPoE rules
sudo nft list table inet pppoe

# Check NAT
sudo nft list table inet nat
```

---

## Common Issues & Solutions

### Issue: "Client hotspot can't browse"

**Symptoms**: Client connects to WiFi, gets IP, but can't browse.

**Diagnostic Steps**:

1. Check if client is in nftables active_clients:
   ```bash
   sudo nft list set inet hotspot active_clients
   # Should show client's IP
   ```

2. Check ticket status:
   ```bash
   redis-cli HGETALL ticket:abc123
   # Check: status=active, paused=false, remaining_ms > 0
   ```

3. Check shaper applied:
   ```bash
   tc class show dev eth0.10
   # Should show htb classes
   ```

4. Check DNS (Unbound):
   ```bash
   nslookup google.com 192.168.10.1
   # Should resolve
   ```

**Solution**: Usually `remaining_ms <= 0` → ticket expired. Create new ticket.

---

### Issue: "PPPoE client can't connect"

**Symptoms**: PPPoE router can't establish session.

**Diagnostic Steps**:

1. Check accel-ppp is running:
   ```bash
   systemctl status accel-ppp
   # Should be active (running)
   ```

2. Check client in Redis:
   ```bash
   redis-cli HGETALL pppoe:client:juanperez
   # Check: status=active, pago_status=pagado
   ```

3. Check accel-ppp logs:
   ```bash
   tail -30 /var/log/accel-ppp/accel-ppp.log
   # Look for AUTH failure or IP assignment errors
   ```

4. Check nftables for client IP:
   ```bash
   sudo nft list set inet pppoe active_clients
   # Should contain client's IP
   ```

**Solution**: Most common: `pago_status=pendiente` → Mark as `pagado` in Redis.

---

### Issue: "WAN failover not triggering"

**Symptoms**: WAN1 goes down, but traffic doesn't switch to WAN2.

**Diagnostic Steps**:

1. Check WAN status in Redis:
   ```bash
   redis-cli HGETALL wan:eth1
   # status should be "offline" if down
   ```

2. Test WANs manually:
   ```bash
   ping -c 3 -I eth1 8.8.8.8  # Should fail if WAN1 down
   ping -c 3 -I eth2 8.8.8.8  # Should succeed
   ```

3. Check eBPF stats:
   ```bash
   sudo bpftool map dump name wan_stats
   # Shows packet counts per WAN
   ```

4. Check routing table:
   ```bash
   ip route show | grep default
   # Should switch to dev eth2 if WAN1 down
   ```

**Solution**: Check `threshold` in `wan:balance:config`. Default: 3 failed pings = failover.

---

### Issue: "Clients can see each other"

**Symptoms**: Client in VLAN 10 can ping client in same VLAN.

**Diagnostic Steps**:

1. Check nftables isolation rules:
   ```bash
   sudo nft list chain inet hotspot forward
   # Should have: iifname "eth0.10" oifname "eth0.10" drop
   ```

2. Test isolation:
   ```bash
   # From client A (192.168.10.50)
   ping 192.168.10.51  # Should fail (drop)
   ```

**Solution**: Add isolation rules to nftables.conf:
```nftables
table inet hotspot {
    chain forward {
        iifname "eth0.10" oifname "eth0.10" drop
        ...
    }
}
```

---

### Issue: "Ticket time not pausing on disconnect"

**Symptoms**: Profile=pausado, but time keeps running when WiFi OFF.

**Diagnostic Steps**:

1. Check ticket profile:
   ```bash
   redis-cli HGETALL ticket:abc123 | grep profile
   # Should be "pausado"
   ```

2. Check shadow TTL:
   ```bash
   redis-cli TTL shadow:abc123
   # Should be > 0 when client connected
   ```

3. Check session checker is running:
   ```bash
   ps aux | grep session_checker
   # Should be running (or Bun's setInterval)
   ```

**Solution**: Verify `src/hotspot.ts` → `sessionChecker()` is being called every 30s.

---

## Advanced Debugging

### Capturing Packets

```bash
# Capture on hotspot VLAN
sudo tcpdump -i eth0.10 -n -v

# Capture on WAN
sudo tcpdump -i eth1 -n host 8.8.8.8

# Capture eBPF XDP traffic
sudo tcpdump -i eth0 -n 'ip[21] = 0x45'  # IP version 4
```

### Redis Monitoring

```bash
# Monitor all commands in real-time
redis-cli monitor

# Check slow queries
redis-cli SLOWLOG GET 10

# Check memory fragmentation
redis-cli INFO memory | grep fragmentation
```

### eBPF Debugging

```bash
# Trace eBPF program execution
sudo bpftool prog trace name xdp_wan_balance

# Dump all maps
sudo bpftool map dump name wan_stats

# Check program size and instructions
sudo bpftool prog show name xdp_wan_balance
```

### Performance Profiling

```bash
# CPU usage
top -p $(pgrep smart-router)

# Memory usage
ps -o %mem,rss,cmd -p $(pgrep smart-router)

# Network throughput
sar -n DEV 1 10  # 1s interval, 10 samples

# eBPF performance
sudo bpftool map dump name wan_stats  # packet counts
```

---

## Emergency Recovery

### Unrecoverable State

```bash
# 1. Stop services
sudo systemctl stop smartrouter
sudo systemctl stop accel-ppp
sudo systemctl stop unbound

# 2. Flush firewall
sudo nft flush ruleset

# 3. Reset Redis (⚠️ Dangerous, loses all state)
sudo systemctl stop redis
sudo rm /var/lib/redis/dump.rdb
sudo rm /var/lib/redis/appendonly.aof
sudo systemctl start redis

# 4. Restore from backup
./scripts/backup.sh restore <backup_file.tar.gz>

# 5. Restart services
sudo systemctl start unbound
sudo systemctl start accel-ppp
sudo systemctl start smartrouter
```

### Safe Mode (Recovery)

1. **Physical console access** (serial/IPMI) → always maintain this!
2. **Isolate management interface** (VLAN 99) → never touched by SmartRouter code.
3. **Manual failover** if needed:
   ```bash
   sudo ip route replace default via <known_working_gateway> dev <known_working_iface>
   ```
4. **Bypass nftables** temporarily:
   ```bash
   sudo nft flush ruleset  # ⚠️ Allows all traffic
   ```
