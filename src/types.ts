// Definiciones de tipos TypeScript para SmartRouter

export interface Ticket {
  id: string;
  type: 'hotspot' | 'pppoe';
  user: string;
  plan: string;
  mac: string;
  ip: string;
  created_at: number;
  expires_at: number;
  paused: 'true' | 'false';
  paused_at: number | null;
  total_time_used: number;
  status: 'active' | 'expired' | 'disconnected';
  activated_at?: number;
}

export interface PPPoESession {
  id: string;
  user: string;
  password: string;
  plan: string;
  type: 'pppoe';
  created_at: number;
  status: 'active' | 'disconnected';
  ip: string;
  mac: string;
  connected_at?: number;
}

export interface VLANConfig {
  id: number;
  name: 'hotspot' | 'pppoe' | 'mgmt';
  subnet: string;
  interface: string;
}

export interface WANStatus {
  online: boolean;
  latency: number;
  last_check?: number;
}

export interface Metrics {
  wan: {
    wan1: WANStatus;
    wan2: WANStatus;
  };
  clients: {
    hotspot: number;
    pppoe: number;
    total: number;
  };
  uptime: number;
}

export interface SystemStats {
  timestamp: number;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

export interface DashboardAPIResponse {
  success: boolean;
  error?: string;
  ticketId?: string;
  sessionId?: string;
  data?: any;
}

// Configuración de red
export interface NetworkConfig {
  wan1: {
    interface: string;
    gateway: string;
    ip: string;
  };
  wan2: {
    interface: string;
    gateway: string;
    ip: string;
  };
  vlans: VLANConfig[];
}

// Planes disponibles
export interface Plan {
  name: string;
  speed: string; // ej: "10Mbps"
  price: number;
  duration_hours: number;
}

export const AVAILABLE_PLANS: Plan[] = [
  { name: 'Básico', speed: '10Mbps', price: 10, duration_hours: 24 },
  { name: 'Estándar', speed: '20Mbps', price: 18, duration_hours: 24 },
  { name: 'Premium', speed: '50Mbps', price: 40, duration_hours: 24 },
  { name: 'Empresarial', speed: '100Mbps', price: 70, duration_hours: 24 },
];

export const VLAN_CONFIG: VLANConfig[] = [
  { id: 10, name: 'hotspot', subnet: '192.168.10.0/24', interface: 'eth0.10' },
  { id: 20, name: 'pppoe', subnet: '192.168.20.0/24', interface: 'eth0.20' },
  { id: 99, name: 'mgmt', subnet: '10.99.0.0/24', interface: 'eth0.99' },
];
