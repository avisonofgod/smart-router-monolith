import { HotspotManager } from './hotspot';
import { PPPoEManager } from './pppoe';
import { NetworkManager } from './network';
import { createClient, RedisClientType } from 'redis';

const redis: RedisClientType = createClient({ url: 'redis://localhost:6379' });

async function ensureRedisConnected() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export class DashboardServer {
  static async start() {
    await ensureRedisConnected();
    
    Bun.serve({
      port: 3000,
      async fetch(req) {
        const url = new URL(req.url);
        
        // API: Crear ticket Hotspot
        if (url.pathname === '/api/hotspot/create' && req.method === 'POST') {
          const body = await req.json();
          try {
            const ticketId = await HotspotManager.createTicket(
              body.user,
              body.plan || '10Mbps',
              body.duration || 1
            );
            return Response.json({ success: true, ticketId });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
          }
        }
        
        // API: Pausar/Reanudar ticket
        if (url.pathname.startsWith('/api/hotspot/ticket/') && req.method === 'PATCH') {
          const ticketId = url.pathname.split('/')[4];
          const body = await req.json();
          
          try {
            if (body.action === 'pause') {
              await HotspotManager.pauseTicket(ticketId);
            } else if (body.action === 'resume') {
              await HotspotManager.resumeTicket(ticketId);
            }
            return Response.json({ success: true });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
          }
        }
        
        // API: Crear sesión PPPoE
        if (url.pathname === '/api/pppoe/create' && req.method === 'POST') {
          const body = await req.json();
          try {
            const sessionId = await PPPoEManager.createSession(
              body.user,
              body.password,
              body.plan || '20Mbps'
            );
            return Response.json({ success: true, sessionId });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
          }
        }
        
        // API: Obtener métricas
        if (url.pathname === '/api/metrics' && req.method === 'GET') {
          try {
            await ensureRedisConnected();
            const wan1 = await NetworkManager.getWANStatus('eth1');
            const wan2 = await NetworkManager.getWANStatus('eth2');
            const hotspotCount = await HotspotManager.getActiveCount();
            const pppoeCount = await PPPoEManager.getActiveCount();
            
            return Response.json({
              wan: { wan1, wan2 },
              clients: {
                hotspot: hotspotCount,
                pppoe: pppoeCount,
                total: hotspotCount + pppoeCount,
              },
              uptime: process.uptime(),
            });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
          }
        }

        // API: Obtener IP del cliente
        if (url.pathname === '/api/client-ip' && req.method === 'GET') {
          await ensureRedisConnected();
          const clientIP = req.headers.get('x-real-ip') || 
                        req.headers.get('x-forwarded-for') || 
                        url.searchParams.get('ip') || '';
          return Response.json({ ip: clientIP });
        }

        // API: Obtener MAC desde ARP table
        if (url.pathname.startsWith('/api/arp/') && req.method === 'GET') {
          const ip = url.pathname.split('/')[3];
          try {
            const proc = Bun.spawn(['arp', '-n', ip]);
            const output = await new Response(proc.stdout).text();
            const match = output.match(/at\s+([0-9a-fA-F:]{17})/);
            const mac = match ? match[1] : '';
            return Response.json({ ip, mac });
          } catch {
            return Response.json({ ip, mac: '' });
          }
        }

        // API: Verificar reconexión automática (check-auto) - VERSIÓN SMART
        // Busca por MAC (no por IP, porque las IPs se liberan)
        if (url.pathname === '/api/hotspot/check-auto' && req.method === 'POST') {
          await ensureRedisConnected();
          const body = await req.json();
          const { mac, ip } = body;
          
          if (!mac) {
            return Response.json({ success: false, error: 'MAC no proporcionada' });
          }
          
          try {
            // ✅ BUSCAR POR MAC: mac_to_ticket:{mac} → ticketId
            const ticketId = await redis.get(`mac_to_ticket:${mac}`);
            
            if (!ticketId) {
              return Response.json({ success: false, error: 'MAC no tiene ticket asociado' });
            }
            
            // Obtener ticket
            const ticket = await redis.hGetAll(`ticket:${ticketId}`);
            
            if (!ticket || ticket.status !== 'active') {
              // Limpiar mac_to_ticket si el ticket no es válido
              await redis.del(`mac_to_ticket:${mac}`);
              return Response.json({ success: false, error: 'Ticket no activo o expirado' });
            }
            
            // Verificar si tiene saldo a favor
            const timeInfo = await HotspotManager.getTicketTimeUsed(ticketId);
            
            if (timeInfo.remaining_ms <= 0) {
              return Response.json({ success: false, error: 'Ticket agotado' });
            }
            
            // Verificar si NO está pausado
            if (ticket.paused === 'true') {
              return Response.json({ success: false, error: 'Ticket pausado' });
            }
            
            // ✅ RECONEXIÓN AUTOMÁTICA SIN LOGIN
            console.log(`🔄 Reconexión automática: MAC ${mac} → Ticket ${ticketId}`);
            await HotspotManager.activateTicket(ticketId, mac, ip || '');
            
            return Response.json({ success: true, ticketId: ticketId });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message });
          }
        }

        // API: Activar ticket (login manual)
        if (url.pathname === '/api/hotspot/activate' && req.method === 'POST') {
          await ensureRedisConnected();
          const body = await req.json();
          const { ticketId, mac, ip } = body;
          
          try {
            await HotspotManager.activateTicket(ticketId, mac || '', ip || '');
            return Response.json({ success: true });
          } catch (error: any) {
            return Response.json({ success: false, error: error.message }, { status: 500 });
          }
        }
        
        // Portal Cautivo Hotspot (con detección automática de MAC/IP)
        if (url.pathname === '/hotspot' || url.pathname === '/') {
          // Obtener IP del cliente (se pasa como header X-Real-IP o se detecta)
          const clientIP = req.headers.get('x-real-ip') || 
                        req.headers.get('x-forwarded-for') || 
                        url.searchParams.get('ip') || '';
          
          return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>SmartRouter - Portal Cautivo</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; }
    .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); width: 400px; }
    h1 { color: #333; margin-bottom: 20px; }
    p { color: #666; margin-bottom: 20px; }
    #loginForm { display: none; }
    #autoLogin { display: block; }
    .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 10px 0; color: #004085; }
    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 10px 0; }
    .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 10px 0; }
    input, button { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; font-size: 1rem; }
    button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; cursor: pointer; font-weight: 600; }
    button:hover { opacity: 0.9; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Portal Cautivo</h1>
    <div id="autoLogin">
      <p>Verificando tu conexión...</p>
      <div id="autoMessage"></div>
    </div>
    <form id="loginForm">
      <p>Ingresa tu ticket para acceder a internet</p>
      <input type="text" id="ticket" placeholder="Ticket ID" required>
      <button type="submit">Conectar</button>
    </form>
    <div id="message"></div>
  </div>
  <script>
    const clientIP = '${clientIP}';
    let clientMAC = '';
    
    // 1. Obtener MAC automáticamente (vía ARP table)
    async function getClientMAC(ip) {
      try {
        const response = await fetch('/api/arp/' + ip);
        const data = await response.json();
        return data.mac || '';
      } catch {
        return '';
      }
    }
    
    // 2. Verificar si la MAC tiene un ticket registrado (reconexión automática)
    async function checkAutoLogin(ip, mac) {
      const msgDiv = document.getElementById('autoMessage');
      msgDiv.parentElement.style.display = 'block';
      
      try {
        const response = await fetch('/api/hotspot/check-auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, mac })
        });
        
        const data = await response.json();
        
        if (data.success && data.ticketId) {
          msgDiv.className = 'success';
          msgDiv.innerHTML = '✅ Reconectado automáticamente<br>Ticket: ' + data.ticketId + '<br>Redirigiendo...';
          setTimeout(() => {
            window.location.href = 'http://example.com';
          }, 2000);
        } else {
          // No hay ticket activo, mostrar formulario de login
          document.getElementById('autoLogin').classList.add('hidden');
          document.getElementById('loginForm').classList.remove('hidden');
        }
      } catch (error) {
        document.getElementById('autoLogin').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
      }
    }
    
    // 3. Login manual con ticket
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ticketId = document.getElementById('ticket').value.trim();
      const msgDiv = document.getElementById('message');
      
      if (!ticketId) {
        msgDiv.innerHTML = '<div class="error">Por favor ingresa tu ticket</div>';
        return;
      }
      
      msgDiv.innerHTML = '<div class="info">⏳ Verificando ticket...</div>';
      
      try {
        const response = await fetch('/api/hotspot/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId, mac: clientMAC, ip: clientIP })
        });
        
        const data = await response.json();
        
        if (data.success) {
          msgDiv.innerHTML = '<div class="success">✅ Acceso concedido. Redirigiendo...</div>';
          setTimeout(() => {
            window.location.href = 'http://example.com';
          }, 2000);
        } else {
          msgDiv.innerHTML = '<div class="error">❌ ' + (data.error || 'Ticket inválido') + '</div>';
        }
      } catch (error) {
        msgDiv.innerHTML = '<div class="error">❌ Error de conexión</div>';
      }
    });
    
    // Iniciar verificación automática al cargar la página
    (async () => {
      if (clientIP) {
        clientMAC = await getClientMAC(clientIP);
        await checkAutoLogin(clientIP, clientMAC);
      } else {
        document.getElementById('autoLogin').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
      }
    })();
  </script>
</body>
</html>
          `, { headers: { 'Content-Type': 'text/html' } });
        }
        
        // Dashboard HTML
        if (url.pathname === '/dashboard') {
          return new Response(`
<!DOCTYPE html>
<html>
<head>
  <title>SmartRouter Dashboard</title>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial; margin: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    .card { background: white; padding: 20px; margin: 10px 0; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat { display: inline-block; margin: 10px 20px; }
    .number { font-size: 32px; font-weight: bold; color: #007bff; }
    .label { color: #666; }
  </style>
</head>
<body>
  <h1>🚀 SmartRouter Monolith Dashboard</h1>
  <div class="card">
    <h2>📊 Estado del Sistema</h2>
    <div id="metrics">Cargando...</div>
  </div>
  <script>
    async function loadMetrics() {
      const response = await fetch('/api/metrics');
      const data = await response.json();
      document.getElementById('metrics').innerHTML = \`
        <div class="stat"><div class="number">\${data.clients.hotspot}</div><div class="label">Hotspot</div></div>
        <div class="stat"><div class="number">\${data.clients.pppoe}</div><div class="label">PPPoE</div></div>
        <div class="stat"><div class="number">\${data.clients.total}</div><div class="label">Total Clientes</div></div>
        <div class="stat"><div class="number">\${Math.round(data.uptime / 60)}min</div><div class="label">Uptime</div></div>
        <hr>
        <p>WAN1: \${data.wan.wan1.online ? '✅' : '❌'} (\${data.wan.wan1.latency}ms)</p>
        <p>WAN2: \${data.wan.wan2.online ? '✅' : '❌'} (\${data.wan.wan2.latency}ms)</p>
      \`;
    }
    loadMetrics();
    setInterval(loadMetrics, 5000);
  </script>
</body>
</html>
          `, { headers: { 'Content-Type': 'text/html' } });
        }
        
        return new Response('SmartRouter API - 404 Not Found', { status: 404 });
      },
    });
    
    console.log('  ✓ Dashboard en http://localhost:3000');
  }
}
