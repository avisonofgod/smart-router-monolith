/* bpf_helper_defs.h - definiciones manuales para compilación eBPF */
#ifndef __BPF_HELPER_DEFS_H__
#define __BPF_HELPER_DEFS_H__

/* Helper: bpf_map_lookup_elem */
static long (*bpf_map_lookup_elem)(void *map, const void *key) = (void *) 1;

/* Helper: bpf_map_update_elem */
static long (*bpf_map_update_elem)(void *map, const void *key, const void *value, u64 flags) = (void *) 2;

/* Helper: bpf_map_delete_elem */
static long (*bpf_map_delete_elem)(void *map, const void *key) = (void *) 3;

/* Helper: bpf_ktime_get_ns */
static u64 (*bpf_ktime_get_ns)(void) = (void *) 5;

/* Helper: bpf_trace_printk */
static long (*bpf_trace_printk)(const char *fmt, u32 fmt_size, ...) = (void *) 6;

/* Helper: bpf_redirect */
static long (*bpf_redirect)(u32 ifindex, u64 flags) = (void *) 51;

/* Helper: bpf_redirect_map */
static long (*bpf_redirect_map)(void *map, u32 key, u64 flags) = (void *) 51;

/* Helper: bpf_skb_load_bytes */
static long (*bpf_skb_load_bytes)(void *skb, u32 offset, void *to, u32 len) = (void *) 26;

/* Helper: bpf_skb_store_bytes */
static long (*bpf_skb_store_bytes)(void *skb, u32 offset, void *from, u32 len, u64 flags) = (void *) 27;

#endif /* __BPF_HELPER_DEFS_H__ */
