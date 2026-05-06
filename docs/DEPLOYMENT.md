# SmartRouter Monolith — Deployment Guide#

## Production Deployment Steps

### 1. Pre-Installation Checklist

- [ ] **Hardware**: 2+ NICs (WAN1, WAN2, LAN), 8GB+ RAM, 4+ cores
- [ ] **OS**: Ubuntu 22.04 LTS / Debian 11+ (fresh install)
- [ ] **Console access**: Ensure physical/KVM/IPMI access (prevent lockout)
- [ ] **VLAN 99**: Dedicated NIC or VLAN for management (untouched by SmartRouter)

### 2. Install Dependencies

```bash
# Become root
sudo -i

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y \
    bun \
    redis-server \
    unbound \
    accel-ppp \
    nftables \
    iproute2 \
    tcpdump \
    clang llvm libbpf-dev \
    iptables \
    isc-dhcp-server \
    tailscale

# Verify installations
bun --version
redis-cli --version
unbound -h 2>&1 | head -1
accel-pppd --version
```

### 3. Clone & Build SmartRouter

```bash
# Clone repository
cd /home/river
git clone https://github.com/your-repo/smart-router-monolith.git
cd smart-router-monolith

# Install Bun dependencies
bun install

# Compile eBPF
cd kernel
make
cd ..

# Compile to single binary (recommended for production)
bun build ./src/index.ts --compile --outfile smart-router

# Verify binary
./smart-router --version 2>&1 || echo "Binary created successfully"
```

### 4. Configure Services

#### 4.1 Redis

```bash
# Copy config
cp config/redis.conf /etc/redis/redis.conf

# Enable persistence
echo "appendonly yes" >> /etc/redis/redis.conf
echo "appendfsync everysec" >> /etc/redis/redis.conf

# Start Redis
systemctl enable redis
systemctl start redis
systemctl status redis  # Should be active
```

#### 4.2 Unbound (DNS)

```bash
# Copy config
cp config/unbound.conf /etc/unbound/unbound.conf

# Create blocklist directory
mkdir -p /var/unbound/blocklists

# Start Unbound
systemctl enable unbound
systemctl start unbound
systemctl status unbound  # Should be active
```

#### 4.3 accel-ppp (PPPoE)

```bash
# Copy config
cp config/accel-ppp.conf /etc/accel-ppp.conf

# Enable IP forwarding
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p

# Start accel-ppp
systemctl enable accel-ppp
systemctl start accel-ppp
systemctl status accel-ppp  # Should be active
```

#### 4.4 SmartRouter (systemd)

```bash
# Copy service file
cp config/smartrouter.service /etc/systemd/system/smartrouter.service

# Reload systemd
systemctl daemon-reload

# Enable service (starts on boot)
systemctl enable smartrouter

# Start service
systemctl start smartrouter

# Check status
systemctl status smartrouter  # Should be active (running)
```

### 5. Initial Network Setup

```bash
# Run setup script (creates VLANs, NAT rules)
chmod +x scripts/setup.sh
sudo ./scripts/setup.sh

# Verify VLANs
ip link show | grep eth0

# Verify NAT
sudo nft list table inet nat

# Test WANs
ping -c 3 -I eth1 8.8.8.8
ping -c 3 -I eth2 8.8.8.8
```

### 6. Tailscale (Optional but Recommended)

```bash
# Login to Tailscale
tailscale up --advertise-routes=192.168.10.0/24,192.168.20.0/24,10.99.0.0/24

# Verify
tailscale status

# Configure ACLs (isolation)
# Edit src/tailscale.ts → configureACLs()
# Then restart SmartRouter
systemctl restart smartrouter
```

---

## Post-Installation Verification

### 1. Check All Services

```bash
# Should all be "active (running)"
systemctl status redis unbound accel-ppp smartrouter
```

### 2. Test Hotspot

```bash
# Connect a device to WiFi (VLAN 10)
# Should get IP 192.168.10.x

# Try to browse → should redirect to portal (192.168.10.1:8080)

# Create a test ticket
redis-cli
> HGETALL ticket:test123

# Activate ticket → should browse internet
```

### 3. Test PPPoE

```bash
# Configure a router with PPPoE
# Username/password from pppoe:client:{user} in Redis

# Should connect and get IP 192.168.20.x

# Check nftables
sudo nft list set inet pppoe active_clients
# Should contain client's IP
```

### 4. Test WAN Failover

```bash
# Simulate WAN1 failure
sudo ip link set eth1 down

# Wait 15 seconds (3x ping checks)

# Check routing
ip route show | grep default
# Should now point to eth2 (WAN2)

# Restore
sudo ip link set eth1 up
```

---

## Upgrading SmartRouter

### 1. Backup First!

```bash
./scripts/backup.sh
# Creates: /home/river/smart-router-backups/backup_YYYYMMDD_HHMMSS.tar.gz
```

### 2. Pull New Code & Rebuild

```bash
cd /home/river/smart-router-monolith
git pull origin main

# Rebuild eBPF
cd kernel && make clean && make && cd ..

# Rebuild binary
bun build ./src/index.ts --compile --outfile smart-router
```

### 3. Restart Services

```bash
systemctl restart smartrouter
systemctl status smartrouter
```

---

## Performance Tuning (500+ Clients)

### 1. Kernel Parameters

```bash
# Add to /etc/sysctl.conf:
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 16384
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 1024 65535

# Apply
sysctl -p
```

### 2. Redis Tuning

```bash
# Add to /etc/redis/redis.conf:
maxmemory 512mb
maxmemory-policy allkeys-lru
tcp-backlog 2048
```

### 3. nftables Optimization

```bash
# Use sets instead of individual rules
# Already done in config/nftables.conf

# Monitor set size
sudo nft list sets
```

### 4. eBPF Optimization

```bash
# Verify program size
sudo bpftool prog show name xdp_wan_balance
# Should be < 4096 instructions (for compatibility)

# Monitor packet drops
sudo bpftool map dump name wan_stats
```

---

## Security Hardening

### 1. Firewall (nftables)

- ✅ Default DENY all traffic
- ✅ Allow only established/related connections
- ✅ Isolate clients between VLANs
- ✅ Management (VLAN 99) whitelist only

### 2. Redis

- ✅ Bind to 127.0.0.1 (not internet-facing)
- ✅ Set strong password if exposed
- ✅ Use AOF persistence (crash recovery)

### 3. SSH

- ✅ Use SSH keys, disable password auth
- ✅ Change default port (22 → 2222)
- ✅ Allow only VLAN 99 IPs in nftables

### 4. Tailscale

- ✅ Use ACLs to isolate clients
- ✅ Only advertise necessary routes
- ✅ Regularly update Tailscale
