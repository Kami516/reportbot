// app/api/auto-monitor/route.ts - Production Auto-start monitor
import { NextResponse } from 'next/server';

let monitorInterval: NodeJS.Timeout | null = null;
let isMonitoring = false;
let startupAttempted = false;

async function checkChainAbuse() {
  try {
    console.log(`🔍 [${new Date().toLocaleTimeString('pl-PL')}] Auto monitor check...`);
    
    // Use internal API call (localhost) for production
    const baseUrl = 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/monitor-chainabuse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (data.success) {
      if (data.newReports > 0) {
        console.log(`🚨 [${new Date().toLocaleTimeString('pl-PL')}] Monitor found ${data.newReports} new reports!`);
      } else {
        console.log(`✅ [${new Date().toLocaleTimeString('pl-PL')}] Monitor check complete - no new reports`);
      }
    } else {
      console.log(`❌ [${new Date().toLocaleTimeString('pl-PL')}] Monitor check failed:`, data.message);
    }
    
    return data;
  } catch (error) {
    console.error(`💥 [${new Date().toLocaleTimeString('pl-PL')}] Auto monitor error:`, error);
    return { success: false, error: error };
  }
}

function startAutoMonitor() {
  if (isMonitoring) {
    console.log('🔄 Monitor already running');
    return { success: true, message: 'Monitor already running' };
  }

  console.log(`🚀 [${new Date().toLocaleTimeString('pl-PL')}] Starting ChainAbuse Auto Monitor...`);
  isMonitoring = true;

  // Initial check after 10 seconds
  setTimeout(() => {
    checkChainAbuse();
  }, 10000);

  // Set 30-second interval
  monitorInterval = setInterval(() => {
    checkChainAbuse();
  }, 30000);

  console.log(`✅ [${new Date().toLocaleTimeString('pl-PL')}] Auto monitor started - checking every 30 seconds`);
  
  return { success: true, message: 'Monitor started successfully' };
}

function stopAutoMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isMonitoring = false;
  console.log(`🛑 [${new Date().toLocaleTimeString('pl-PL')}] Auto monitor stopped`);
  
  return { success: true, message: 'Monitor stopped' };
}

export async function GET() {
  return NextResponse.json({
    status: isMonitoring ? 'running' : 'stopped',
    uptime: isMonitoring ? 'Running since server start' : 'Not running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    intervalActive: !!monitorInterval,
    startupAttempted
  });
}

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'start') {
      const result = startAutoMonitor();
      return NextResponse.json(result);
    } else if (action === 'stop') {
      const result = stopAutoMonitor();
      return NextResponse.json(result);
    } else if (action === 'status') {
      return NextResponse.json({
        isMonitoring,
        hasInterval: !!monitorInterval,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use: start, stop, or status' }, { status: 400 });
  } catch (error) {
    console.error('Auto monitor API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Auto-start on module load for PRODUCTION
if (!startupAttempted) {
  startupAttempted = true;
  
  // Auto-start in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.AUTO_START_MONITOR === 'true') {
    console.log(`🌟 [${new Date().toLocaleTimeString('pl-PL')}] Production mode detected - preparing auto-start...`);
    
    // Wait for server to be fully ready
    setTimeout(() => {
      console.log(`⚡ [${new Date().toLocaleTimeString('pl-PL')}] Initializing ChainAbuse Monitor for 24/7 operation...`);
      startAutoMonitor();
    }, 8000); // Wait 8 seconds for server to be fully ready
  } else {
    console.log(`🛠️ [${new Date().toLocaleTimeString('pl-PL')}] Development mode - manual start required`);
  }
}