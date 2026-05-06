// eBPF mínimo para XDP - compila con headers básicos
// Solo hace DROP de paquetes marcados (para prueba inicial)

#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>

// Definiciones mínimas si faltan headers
#ifndef XDP_PASS
#define XDP_PASS 2
#endif
#ifndef XDP_DROP  
#define XDP_DROP 1
#endif

// Mapa para estadísticas (opcional)
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 2);
    __type(key, u32);
    __type(value, u64);
} wan_stats SEC(".maps");

SEC("xdp_wan_balance")
int xdp_wan_balance_prog(struct xdp_md *ctx) {
    void *data = (void *)(long)ctx->data;
    void *data_end = (void *)(long)ctx->data_end;
    
    // Parsear Ethernet header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return XDP_PASS;
    
    // Solo pasar paquetes (para prueba inicial)
    // TODO: Implementar balanceo real con hash
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
