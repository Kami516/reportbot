// app/api/server-monitor/route.ts - API to check server monitor status
import { NextRequest, NextResponse } from 'next/server';
import { getServerMonitorStatus, startServerMonitor, stopServerMonitor } from '../../../startup/monitor';

export async function GET() {
  try {
    const status = getServerMonitorStatus();
    
    return NextResponse.json({
      success: true,
      serverMonitor: status,
      timestamp: new Date().toISOString(),
      message: status.isRunning ? 'Server monitor is running' : 'Server monitor is not running'
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        startServerMonitor();
        return NextResponse.json({
          success: true,
          message: 'Server monitor start requested',
          timestamp: new Date().toISOString()
        });

      case 'stop':
        stopServerMonitor();
        return NextResponse.json({
          success: true,
          message: 'Server monitor stopped',
          timestamp: new Date().toISOString()
        });

      case 'status':
        const status = getServerMonitorStatus();
        return NextResponse.json({
          success: true,
          serverMonitor: status,
          timestamp: new Date().toISOString()
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: start, stop, or status',
          timestamp: new Date().toISOString()
        }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}