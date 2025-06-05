// app/api/auto-monitor/route.ts - Auto-start monitor on server startup
import { NextResponse } from 'next/server';

let monitorInterval: NodeJS.Timeout | null = null;
let isMonitoring = false;

async function checkChainAbuse() {
  try {
    console.log('🔍 Auto monitor check...');
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/monitor-chainabuse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log(`✅ Monitor check complete: ${data.newReports} new reports`);
    
    return data;
  } catch (error) {
    console.error('❌ Auto monitor error:', error);
    return { success: false, error: error };
  }
}

function startAutoMonitor() {
  if (isMonitoring) {
    console.log('Monitor already running');
    return;
  }

  console.log('🚀 Starting auto monitor...');
  isMonitoring = true;

  // Initial check
  checkChainAbuse();

  // Set 30-second interval
  monitorInterval = setInterval(() => {
    checkChainAbuse();
  }, 30000);

  console.log('✅ Auto monitor started - checking every 30 seconds');
}

function stopAutoMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isMonitoring = false;
  console.log('🛑 Auto monitor stopped');
}

export async function GET() {
  return NextResponse.json({
    status: isMonitoring ? 'running' : 'stopped',
    timestamp: new Date().toISOString()
  });
}

export async function POST(request: Request) {
  const { action } = await request.json();

  if (action === 'start') {
    startAutoMonitor();
    return NextResponse.json({ success: true, message: 'Monitor started' });
  } else if (action === 'stop') {
    stopAutoMonitor();
    return NextResponse.json({ success: true, message: 'Monitor stopped' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// Auto-start on module load (server startup)
if (process.env.NODE_ENV === 'development') {
  setTimeout(() => {
    startAutoMonitor();
  }, 3000); // Wait 3 seconds for server to be ready
}