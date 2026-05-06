import { $ } from "bun";
import { createClient, RedisClientType } from 'redis';

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class HotspotManager {
  // Tiempo configurable para desconexión (ms) - AJUSTABLE
  static DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos por defecto

  // Iniciar portal cautivo con reglas de redirección
  static async start() {
    try {
      await ensureRedisConnected();
      await $`nft add table inet hotspot`.quiet();
      await $`nft add chain inet hotspot prerouting { type filter hook prerouting priority 0 \\; }`.quiet();
      await $`nft add chain inet hotspot input { type filter hook input priority 0 \\; }`.quiet();
      
      await $`nft add set inet hotspot active_clients { type ipv4_addr \\; }`.quiet();
      await $`nft add set inet hotspot known_macs { type ether_addr \\; timeout 8h \\; }`.quiet();
      await $`nft add set inet hotspot pending_auth { type ipv4_addr \\; timeout 5m \\; }`.quiet();
      
      await $`nft add rule inet hotspot prerouting ip saddr @active_clients accept`.quiet();
      await $`nft add rule inet hotspot prerouting ip saddr @pending_auth tcp dport 80 redirect to :3000`.quiet();
      await $`nft add rule inet hotspot prerouting ip saddr @pending_auth tcp dport 443 redirect to :3000`.quiet();
      
      console.log('  ✓ Portal Hotspot iniciado (con detección MAC y redirección)');
    } catch (error: any) {
      console.log('  ⚠️  Hotspot ya configurado o error:', error.message);
    }
  }

  // Crear ticket individual
  static async createTicket(user: string, plan: string, durationHours: number): Promise<string> {
    await ensureRedisConnected();
    const ticketId = Math.random().toString(36).substring(2, 10);
    const now = Date.now();
    const durationMs = durationHours * 3600 * 1000;

    const ticket = {
      id: ticketId,
      type: 'hotspot',
      user: user,
      plan: plan,
      mac: '',
      ip: '',
      created_at: now.toString(),
      expires_at: (now + durationMs).toString(),
      paused: 'false',
      paused_at: '',
      total_paused_ms: '0',
      total_time_used: '0',
      status: 'active',
    };

    await redis.hSet(`ticket:${ticketId}`, ticket);
    await redis.sAdd('hotspot_tickets', ticketId);

    console.log(`✅ Ticket creado: ${ticketId} para ${user} (${plan}, ${durationHours}h)`);
    return ticketId;
  }

  // Crear lote de tickets
  static async createTicketBatch(
    name: string,
    count: number,
    plan: string,
    durationHours: number,
    profile: 'pausado' | 'corrido' = 'pausado'
  ): Promise<string[]> {
    await ensureRedisConnected();
    const tickets: string[] = [];
    const batchId = `batch_${Date.now()}_${name}`;
    const now = Date.now();
    const durationMs = durationHours * 3600 * 1000;

    console.log(`📦 Creando lote "${name}" de ${count} tickets (${plan}, ${profile})...`);

    await redis.hSet(`ticket:batch:${batchId}`, {
      name: name,
      plan: plan,
      profile: profile,
      duration_hours: durationHours.toString(),
      quantity: count.toString(),
      created_at: now.toString(),
      tickets_created: '0',
    });
    await redis.sAdd('hotspot_batches', batchId);

    for (let i = 0; i < count; i++) {
      const ticketId = Math.random().toString(36).substring(2, 10);
      const ticket = {
        id: ticketId,
        username: `user_${i + 1}_${batchId}`,
        password: Math.random().toString(36).substring(2, 10),
        type: 'hotspot',
        plan: plan,
        profile: profile,
        mac: '',
        ip: '',
        created_at: now.toString(),
        expires_at: (now + durationMs).toString(),
        start_time: '',
        paused: 'false',
        paused_at: '',
        total_paused_ms: '0',
        total_time_used: '0',
        remaining_ms: durationMs.toString(),
        status: 'active',
        batch: batchId,
      };

      await redis.hSet(`ticket:${ticketId}`, ticket);
      await redis.sAdd(`ticket:batch:${batchId}:tickets`, ticketId);
      await redis.sAdd('hotspot_tickets', ticketId);
      tickets.push(ticketId);

      if ((i + 1) % 10 === 0) {
        console.log(`  Progreso: ${i + 1}/${count}`);
        await redis.hSet(`ticket:batch:${batchId}`, { tickets_created: (i + 1).toString() });
      }
    }

    console.log(`✅ Lote "${name}" completado: ${tickets.length} tickets creados`);
    return tickets;
  }

  // Obtener tickets de un lote
  static async getBatchTickets(batchId: string): Promise<string[]> {
    return await redis.sMembers(`ticket:batch:${batchId}:tickets`);
  }

  // Pausar lote de tickets
  static async pauseTicketBatch(batchId: string) {
    const ticketIds = await this.getBatchTickets(batchId);
    let paused = 0;
    for (const id of ticketIds) {
      try {
        await this.pauseTicket(id);
        paused++;
      } catch (error: any) {
        console.error(`Error pausando ${id}:`, error.message);
      }
    }
    console.log(`⏸️  Lote ${batchId}: ${paused}/${ticketIds.length} tickets pausados`);
    return paused;
  }

  // Reanudar lote de tickets
  static async resumeTicketBatch(batchId: string) {
    const ticketIds = await this.getBatchTickets(batchId);
    let resumed = 0;
    for (const id of ticketIds) {
      try {
        await this.resumeTicket(id);
        resumed++;
      } catch (error: any) {
        console.error(`Error reanudando ${id}:`, error.message);
      }
    }
    console.log(`▶️  Lote ${batchId}: ${resumed}/${ticketIds.length} tickets reanudados`);
    return resumed;
  }

  // Activar ticket (cuando cliente se conecta)
  static async activateTicket(ticketId: string, mac: string, ip: string) {
    await ensureRedisConnected();
    const ticket = await redis.hGetAll(`ticket:${ticketId}`);

    if (!ticket || ticket.status !== 'active') {
      throw new Error('Ticket inválido o expirado');
    }

    if (ticket.paused === 'true') {
      throw new Error('Ticket pausado');
    }

    const now = Date.now();
    const profile = ticket.profile || 'pausado';

    if (profile === 'corrido') {
      if (!ticket.start_time) {
        await redis.hSet(`ticket:${ticketId}`, {
          start_time: now.toString(),
          mac: mac,
          ip: ip,
          activated_at: now.toString(),
        });
      } else {
        await redis.hSet(`ticket:${ticketId}`, {
          mac: mac,
          ip: ip,
          activated_at: now.toString(),
        });
      }

      const startTime = parseInt(ticket.start_time || now.toString());
      const elapsedMs = now - startTime;
      const totalDurationMs = parseInt(ticket.expires_at) - parseInt(ticket.created_at);

      if (elapsedMs >= totalDurationMs) {
        await redis.hSet(`ticket:${ticketId}`, { status: 'expired' });
        throw new Error('Ticket agotado (tiempo corrido completo)');
      }

      const remainingMs = totalDurationMs - elapsedMs;
      await redis.set(`shadow:${ticketId}`, '1', { PX: remainingMs });

    } else {
      const remainingTTL = await redis.ttl(`shadow:${ticketId}`);
      let remainingMs = parseInt(ticket.remaining_ms || '0');

      if (remainingTTL > 0) {
        remainingMs = remainingTTL * 1000;
      } else if (remainingMs <= 0) {
        const totalDurationMs = parseInt(ticket.expires_at) - parseInt(ticket.created_at);
        remainingMs = totalDurationMs;
      }

      await redis.hSet(`ticket:${ticketId}`, {
        mac: mac,
        ip: ip,
        activated_at: now.toString(),
        remaining_ms: remainingMs.toString(),
      });

      if (remainingMs > 0) {
        await redis.set(`ex:session:${ip}`, `shadow:${ticketId}`, { PX: remainingMs });
        await redis.set(`shadow:${ticketId}`, '1', { PX: remainingMs });
      }
    }

    // CRÍTICO: Guardar relación MAC → Ticket para reconexión automática
    if (mac) {
      await redis.set(`mac_to_ticket:${mac}`, ticketId, { EX: 86400 * 30 });
      console.log(`  🔗 MAC ${mac} vinculada a ticket ${ticketId}`);
    }

    if (ip) {
      await redis.set(`ticket_to_ip:${ticketId}`, ip, { EX: 86400 });
    }

    // Agregar a nftables
    if (ip) {
      try {
        await $`nft add element inet hotspot active_clients { ${ip} }`.quiet();
        console.log(`✅ Acceso concedido a ${ip} (${mac}) - Perfil: ${profile}`);
      } catch (error) {
        console.error('Error en nftables:', error);
      }
    }

    // Crear metadata y agregar a online
    if (ip) {
      await redis.sAdd('hs:online', ticketId);
      await redis.hSet(`metadata:${ip}`, {
        username: ticketId,
        mac: mac || '',
        start_time: now.toString(),
        profile: profile,
        last_seen: now.toString(),
        disconnect_start: '',
        unreachable_count: '0',
      });
      await redis.set(`ex:session:${ip}`, `shadow:${ticketId}`, { PX: remainingMs / 1000 });
    }

    // Aplicar shaper según plan
    const shaperMap: Record<string, string> = {
      '10Mbps': '10mbit',
      '20Mbps': '20mbit',
      '50Mbps': '50mbit',
    };
    const rate = shaperMap[ticket.plan] || '10mbit';
    await (await import('./network')).NetworkManager.applyShaper('eth0.10', rate);
  }

  // Pausar ticket
  static async pauseTicket(ticketId: string) {
    await ensureRedisConnected();
    const ticket = await redis.hGetAll(`ticket:${ticketId}`);

    if (!ticket) {
      throw new Error('Ticket no encontrado');
    }

    if (ticket.paused === 'true') {
      throw new Error('Ticket ya está pausado');
    }

    const now = Date.now();
    await redis.hSet(`ticket:${ticketId}`, {
      paused: 'true',
      paused_at: now.toString(),
    });

    if (ticket.ip) {
      try {
        await $`nft delete element inet hotspot active_clients { ${ticket.ip} }`.quiet();
        console.log(`⏸️  Ticket ${ticketId} pausado`);
      } catch (error) {
        console.error('Error removiendo de nftables:', error);
      }
    }
  }

  // Reanudar ticket
  static async resumeTicket(ticketId: string) {
    await ensureRedisConnected();
    const ticket = await redis.hGetAll(`ticket:${ticketId}`);

    if (!ticket || ticket.status !== 'active') {
      throw new Error('Ticket inválido');
    }

    if (ticket.paused !== 'true') {
      throw new Error('Ticket no está pausado');
    }

    const now = Date.now();
    const pausedAt = parseInt(ticket.paused_at || '0');
    const pauseDuration = now - pausedAt;
    const totalPaused = parseInt(ticket.total_paused_ms || '0') + pauseDuration;
    const newExpiresAt = parseInt(ticket.expires_at) + pauseDuration;

    await redis.hSet(`ticket:${ticketId}`, {
      paused: 'false',
      paused_at: 'null',
      total_paused_ms: totalPaused.toString(),
      expires_at: newExpiresAt.toString(),
    });

    if (ticket.ip) {
      try {
        await $`nft add element inet hotspot active_clients { ${ticket.ip} }`.quiet();
        console.log(`▶️  Ticket ${ticketId} reanudado. Tiempo pausa: ${(pauseDuration / 1000).toFixed(0)}s`);
      } catch (error) {
        console.error('Error agregando a nftables:', error);
      }
    }
  }

  // Obtener tiempo usado
  static async getTicketTimeUsed(ticketId: string): Promise<{
    total_assigned_ms: number;
    total_paused_ms: number;
    effective_used_ms: number;
    remaining_ms: number;
  }> {
    await ensureRedisConnected();
    const ticket = await redis.hGetAll(`ticket:${ticketId}`);
    if (!ticket) throw new Error('Ticket no encontrado');

    const now = Date.now();
    const createdAt = parseInt(ticket.created_at);
    const expiresAt = parseInt(ticket.expires_at);
    const totalAssigned = expiresAt - createdAt;
    const totalPaused = parseInt(ticket.total_paused_ms || '0');

    let effectiveUsed = 0;
    if (ticket.paused === 'true') {
      const pausedAt = parseInt(ticket.paused_at || '0');
      effectiveUsed = (pausedAt || now) - createdAt - totalPaused;
    } else {
      effectiveUsed = now - createdAt - totalPaused;
    }

    const remaining = Math.max(0, totalAssigned - effectiveUsed);

    return {
      total_assigned_ms: totalAssigned,
      total_paused_ms: totalPaused,
      effective_used_ms: effectiveUsed,
      remaining_ms: remaining,
    };
  }

  // Verificar y expirar tickets
  static async checkExpiredTickets() {
    try {
      await ensureRedisConnected();
      const ticketIds = await redis.sMembers('hotspot_tickets');
      const now = Date.now();

      for (const id of ticketIds) {
        const ticket = await redis.hGetAll(`ticket:${id}`);
        if (!ticket || ticket.status !== 'active') continue;

        const profile = ticket.profile || 'pausado';
        let shouldExpire = false;

        if (profile === 'corrido') {
          const startTime = parseInt(ticket.start_time || ticket.created_at);
          const elapsed = now - startTime;
          const totalDuration = parseInt(ticket.expires_at) - parseInt(ticket.created_at);
          if (elapsed >= totalDuration) {
            shouldExpire = true;
          }
        } else {
          const timeInfo = await this.getTicketTimeUsed(id);
          if (timeInfo.remaining_ms <= 0) {
            shouldExpire = true;
          }
        }

        if (shouldExpire) {
          await redis.hSet(`ticket:${id}`, { status: 'expired' });
          if (ticket.ip) {
            try {
              await $`nft delete element inet hotspot active_clients { ${ticket.ip} }`.quiet();
            } catch {}
            await redis.del(`shadow:${id}`);
            if (ticket.ip) {
              await redis.del(`ex:session:${ticket.ip}`);
            }
          }
          console.log(`⏰ Ticket ${id} expirado (${profile})`);
        }
      }
    } catch (error) {
      console.error('Error verificando tickets:', error);
    }
  }

  // Session checker: verifica si clientes están online
  static async sessionChecker() {
    try {
      await ensureRedisConnected();
      const onlineUsers = await redis.sMembers('hs:online');
      const now = Date.now();

    for (const username of onlineUsers) {
      const metadataKey = `metadata:${username}`;
      const metadata = await redis.hGetAll(metadataKey);
      if (!metadata || !metadata.ip) continue;

      const ip = metadata.ip;
      const mac = metadata.mac || '';

      try {
        await $`ping -c 1 -W 2 ${ip}`.quiet();
        await redis.hSet(metadataKey, {
          last_seen: now.toString(),
          unreachable_count: '0',
          disconnect_start: ''
        });
      } catch {
        const disconnectStart = parseInt(metadata.disconnect_start || '0');

        if (disconnectStart === 0) {
          await redis.hSet(metadataKey, {
            disconnect_start: now.toString(),
            unreachable_count: '1',
            last_seen: now.toString()
          });
        } else {
          const elapsedDisconnect = now - disconnectStart;

          if (elapsedDisconnect >= this.DISCONNECT_TIMEOUT_MS) {
            console.log(`📡 Cliente ${username} (${ip}, MAC: ${mac}) desconectado por ${elapsedDisconnect / 1000 / 60} min sin respuesta`);
            await this.disconnectClient(username, ip, mac);
          } else {
            const count = parseInt(metadata.unreachable_count || '0') + 1;
            await redis.hSet(metadataKey, {
              unreachable_count: count.toString(),
              last_seen: now.toString()
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en sessionChecker:', error);
  }
  }

  // Desconectar cliente - Lógica diferenciada por perfil
  static async disconnectClient(username: string, ip: string, mac: string) {
    await ensureRedisConnected();
    const ticket = await redis.hGetAll(`ticket:${username}`);
    if (!ticket) return;

    const profile = ticket.profile || 'pausado';
    const now = Date.now();

    if (profile === 'pausado') {
      const timeInfo = await this.getTicketTimeUsed(username);
      if (timeInfo.remaining_ms > 0) {
        await redis.hSet(`ticket:${username}`, {
          remaining_ms: timeInfo.remaining_ms.toString(),
          status: 'paused_disconnected',
          paused: 'true',
          paused_at: now.toString(),
          last_disconnect: now.toString(),
        });
        await redis.del(`shadow:${username}`);
        console.log(`  ⏸️  Ticket ${username} PAUSADO (desconexión). Saldo: ${(timeInfo.remaining_ms / 1000 / 60).toFixed(1)} min`);
      }
    } else {
      const remainingTTL = await redis.ttl(`shadow:${username}`);
      if (remainingTTL > 0) {
        console.log(`  ⏱️  Ticket ${username} CORRIDO: tiempo sigue contando en shadow (${remainingTTL}s restantes)`);
      }
      await redis.hSet(`ticket:${username}`, {
        last_disconnect: now.toString(),
      });
    }

    // Liberar IP en nftables y metadata (PERO MANTENER mac_to_ticket para reconexión)
    try {
      await $`nft delete element inet hotspot active_clients { ${ip} }`.quiet();
    } catch {}
    
    await redis.del(`ex:session:${ip}`);
    await redis.sRem('hs:online', username);
    await redis.del(`metadata:${ip}`);
    
    console.log(`⏹️  Cliente ${username} desconectado. MAC ${mac} guardada para reconexión automática`);
  }

  // Obtener todos los tickets
  static async getAllTickets() {
    await ensureRedisConnected();
    const ticketIds = await redis.sMembers('hotspot_tickets');
    const tickets = [];
    for (const id of ticketIds) {
      const ticket = await redis.hGetAll(`ticket:${id}`);
      if (ticket) {
        const timeInfo = await this.getTicketTimeUsed(id).catch(() => null);
        tickets.push({
          ...ticket,
          time_info: timeInfo,
        });
      }
    }
    return tickets;
  }

  // Obtener cantidad de clientes activos
  static async getActiveCount(): Promise<number> {
    try {
      await ensureRedisConnected();
      const result = await $`nft list set inet hotspot active_clients`.quiet();
      const output = result.text();
      const matches = output.match(/elements = \{/g);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  // Detener hotspot
  static async stop() {
    console.log('⏹️  Deteniendo Hotspot...');
    try {
      await $`nft delete table inet hotspot`.quiet();
    } catch {}
  }
}
