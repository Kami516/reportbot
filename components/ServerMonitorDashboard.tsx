// components/ServerMonitorDashboard.tsx - Dashboard to show server monitor status
'use client';

import { useState, useEffect } from 'react';

interface ServerMonitorStatus {
  isRunning: boolean;
  checkCount: number;
  lastSignature: string;
}

export default function ServerMonitorDashboard() {
  const [status, setStatus] = useState<ServerMonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/server-monitor');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.serverMonitor);
        setLastUpdate(new Date().toLocaleTimeString('en-US'));
      }
    } catch (error) {
      console.error('Failed to fetch server monitor status:', error);
    } finally {
      setLoading(false);
    }
  };

  const controlMonitor = async (action: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/server-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Refresh status after action
        setTimeout(fetchStatus, 2000);
      } else {
        alert(`Action failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Action failed: ${error}`);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-300">Loading server monitor status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🖥️ Server-Side Monitor Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Monitor running directly on the server - no browser required!
        </p>
        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdate}
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`p-4 rounded-lg border-2 ${
          status?.isRunning 
            ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700' 
            : 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
        }`}>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}></div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Server Status</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {status?.isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Checks</p>
          <p className="text-2xl font-bold text-blue-600">{status?.checkCount || 0}</p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-300 dark:bg-purple-900/20 dark:border-purple-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Last Signature</p>
          <p className="text-lg font-semibold text-purple-600 font-mono">
            {status?.lastSignature || 'none'}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => controlMonitor('start')}
          disabled={loading}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {loading ? (
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          ) : (
            '▶️'
          )}
          Start Server Monitor
        </button>

        <button
          onClick={() => controlMonitor('stop')}
          disabled={loading}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          ⏹️ Stop
        </button>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          🔄 Refresh Status
        </button>

        <button
          onClick={() => window.open('/monitor', '_blank')}
          className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          🧪 Test Tools
        </button>
      </div>

      {/* Server Monitor Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2 flex items-center">
          🖥️ Server-Side Monitoring
          {status?.isRunning && <span className="ml-2 text-xs bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded">ACTIVE</span>}
        </h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>• <strong>Automatic Start:</strong> Monitor starts automatically when you run `pnpm dev`</p>
          <p>• <strong>No Browser Required:</strong> Runs entirely on the server, no browser window needed</p>
          <p>• <strong>Background Operation:</strong> Continues running even if you close all browser tabs</p>
          <p>• <strong>Persistent Monitoring:</strong> Checks ChainAbuse every 30 seconds from server</p>
          <p>• <strong>Instant Alerts:</strong> Sends Telegram notifications immediately when changes detected</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">💡 How it works:</h3>
        <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <p>1. <strong>Auto-Start:</strong> When you run `pnpm dev`, the server monitor starts automatically after 10 seconds</p>
          <p>2. <strong>Server-Side:</strong> Monitor runs in the Next.js server process, not in browser</p>
          <p>3. <strong>Background Checks:</strong> Fetches ChainAbuse every 30 seconds and compares signatures</p>
          <p>4. <strong>Change Detection:</strong> If page content changes, sends immediate Telegram alert</p>
          <p>5. <strong>Zero Maintenance:</strong> Just run `pnpm dev` and forget - it handles everything!</p>
        </div>
      </div>

      {/* Current Status */}
      {status?.isRunning && (
        <div className="mt-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            ✅ Server Monitor Active
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            The server-side monitor is running and checking ChainAbuse every 30 seconds. 
            You can close this browser window - monitoring will continue on the server!
            Current check count: <strong>{status.checkCount}</strong>
          </p>
        </div>
      )}
    </div>
  );
}