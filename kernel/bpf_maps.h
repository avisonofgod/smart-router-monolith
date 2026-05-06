// BPF Maps definitions for SmartRouter
// These maps are shared between kernel and userspace

#ifndef BPF_MAPS_H
#define BPF_MAPS_H

#include <linux/bpf.h>

// Map: WAN status (0=WAN1, 1=WAN2)
// Value: 1=online, 0=offline
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 2);
    __type(key, __u32);
    __type(value, __u32);
} wan_status SEC(".maps");

// Map: WAN statistics (packet count per WAN)
struct {
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 2);
    __type(key, __u32);
    __type(value, __u64);
} wan_stats SEC(".maps");

// Map: Active connections (src_ip -> WAN selection)
// For sticky sessions
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 4096);
    __type(key, __u32);
    __type(value, __u32);
} conn_tracker SEC(".maps");

// Map: TTL for eBPF programs
// Used to expire entries
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 4096);
    __type(key, __u32);
    __type(value, __u64);  // expiry timestamp
} ttl_tracker SEC(".maps");

#endif // BPF_MAPS_H
