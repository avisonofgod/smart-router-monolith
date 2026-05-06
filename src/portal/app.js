// Portal Cautivo - SmartRouter
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const ticketInput = document.getElementById('ticket');
    const macInput = document.getElementById('mac');
    const messageDiv = document.getElementById('message');
    
    const ticketId = ticketInput.value.trim();
    const mac = macInput.value.trim() || '';
    
    if (!ticketId) {
        showMessage('Por favor ingresa tu ticket', 'error');
        return;
    }
    
    showMessage('⏳ Verificando ticket...', 'info');
    
    try {
        // Obtener IP del cliente (se pasa como query param o se detecta)
        const clientIP = window.clientIP || '';
        
        const response = await fetch('/api/hotspot/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId, mac, ip: clientIP })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('✅ Acceso concedido. Redirigiendo...', 'success');
            setTimeout(() => {
                window.location.href = 'http://example.com'; // URL de éxito
            }, 2000);
        } else {
            showMessage(`❌ ${data.error || 'Ticket inválido'}`, 'error');
        }
    } catch (error) {
        showMessage('❌ Error de conexión. Intenta de nuevo.', 'error');
        console.error('Login error:', error);
    }
});

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = type || '';
}

// Detectar IP del cliente (opcional, el backend puede obtenerla)
fetch('/api/client-ip')
    .then(res => res.json())
    .then(data => {
        if (data.ip) {
            window.clientIP = data.ip;
        }
    })
    .catch(() => {});
