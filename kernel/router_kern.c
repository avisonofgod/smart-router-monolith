// eBPF XDP program para balanceo WAN dual - usa vmlinux.h
// Compila con: clang -O2 -target bpf -Wall -c router_kern.c -o router_kern.o

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// Definiciones si no están en vmlinux.h
#ifndef XDP_PASS
#define XDP_PASS 2
#endif
#ifndef XDP_DROP
#define XDP_DROP 1
#endif
#ifndef ETH_P_IP
#define ETH_P_IP 0x0800
#endif

// Mapas BPF compartidos con userspace
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 2);
    __type(key, u32);
    __type(value, u64);
} wan_stats SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 2);
    __type(key, u32);
    __type(value, u8);
} wan_status SEC(".maps");

SEC("xdp_wan_balance")
int xdp_wan_balance_prog(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    // Parsear Ethernet header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    // Solo procesar IPv4
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;
    
    // Parsear IP header
    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)ip + sizeof(*ip) > data_end)
        return XDP_PASS;
    
    // Hash simple de IP origen para sticky routing
    u32 src_ip = ip->saddr;
    u32 hash = src_ip ^ (src_ip >> 16);
    u32 wan_idx = hash % 2;
    
    // Verificar si WAN está online (mapa wan_status)
    u8 *status = (u8 *)bpf_map_lookup_elem(&wan_status, &wan_idx);
    if (status && *status == 0) {
        // WAN caída, usar la otra
        wan_idx = (wan_idx + 1) % 2;
    }
    
    // Actualizar estadísticas
    u64 *counter = (u64 *)bpf_map_lookup_elem(&wan_stats, &wan_idx);
    if (counter) {
        __sync_fetch_and_add(counter, 1);
    }
    
    // TODO: Implementar redirect a interface WAN correcta
    // Por ahora solo pasar el paquete
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
