# Makefile para eBPF - usa headers del kernel fuente 6.12.21
KERNEL_SRC = /home/river/TRABAJO/qemu-n100-router/kernel/linux-6.12.21
BPF_CLANG = clang
BPF_CFLAGS = -O2 -target bpf -Wall \
	-I. \
	-I$(KERNEL_SRC)/include \
	-I$(KERNEL_SRC)/arch/x86/include \
	-I$(KERNEL_SRC)/tools/lib/bpf \
	-I$(KERNEL_SRC)/tools/include \
	-I$(KERNEL_SRC)/tools/lib/bpf/include \
	-D__KERNEL__ -D__BPF_TRACING__

all: router_kern.o

router_kern.o: router_kern.c vmlinux.h
	$(BPF_CLANG) $(BPF_CFLAGS) -c $< -o $@
	@echo "✓ eBPF compilado: $@"
	@ls -lh $@

clean:
	rm -f *.o

test: router_kern.o
	@echo "Probando carga eBPF..."
	@if [ -f /sys/class/net/eth1/device ]; then \
		ip link set dev eth1 xdp obj router_kern.o sec xdp_wan_balance 2>&1 || echo "⚠️  eth1 no disponible"; \
	fi
	bpftool prog show

.PHONY: all clean test
