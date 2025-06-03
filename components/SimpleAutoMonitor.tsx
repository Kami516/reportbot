// components/SimpleAutoMonitor.tsx - English Version
'use client';

import { useState, useEffect, useRef } from 'react';

interface MonitorStats {
  isRunning: boolean;
  totalChecks: number;
  totalNewReports: number;
  lastCheck: string | null;
  errors: string[];
  recentActivity: string[];
}

export default function SimpleAutoMonitor() {
  const [stats, setStats] = useState<MonitorStats>({
    isRunning: false,
    totalChecks: 0,
    totalNewReports: 0,
    lastCheck: null,
    errors: [],
    recentActivity: []
  });

  const [countdown, setCountdown] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const addActivity = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US');
    const newActivity = `[${timestamp}] ${message}`;
    
    setStats(prev => ({
      ...prev,
      recentActivity: [newActivity, ...prev.recentActivity.slice(0, 9)]
    }));
  };

  const runSingleCheck = async () => {
    try {
      addActivity('🔍 Checking for new reports...');
      
      const response = await fetch('/api/monitor-chainabuse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      setStats(prev => ({
        ...prev,
        totalChecks: prev.totalChecks + 1,
        lastCheck: data.timestamp
      }));

      if (data.success) {
        if (data.newReports > 0) {
          addActivity(`🚨 Found ${data.newReports} new report(s)!`);
          setStats(prev => ({
            ...prev,
            totalNewReports: prev.totalNewReports + data.newReports
          }));
        } else {
          addActivity('✅ No new reports');
        }
      } else {
        const errorMsg = data.message || 'Unknown error';
        addActivity(`❌ Check failed: ${errorMsg}`);
        setStats(prev => ({
          ...prev,
          errors: [...prev.errors.slice(-4), errorMsg]
        }));
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Connection error';
      addActivity(`💥 Connection error: ${errorMsg}`);
      
      setStats(prev => ({
        ...prev,
        errors: [...prev.errors.slice(-4), errorMsg]
      }));
    }
  };

  const startMonitoring = async () => {
    if (stats.isRunning) return;

    addActivity('🚀 Starting automatic monitoring...');
    
    setStats(prev => ({ ...prev, isRunning: true }));

    // Initial check
    await runSingleCheck();

    // Set up 30-second interval
    intervalRef.current = setInterval(async () => {
      await runSingleCheck();
    }, 30000);

    // Set up countdown timer
    setCountdown(30);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 30; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    addActivity('✅ Monitor started - checking every 30 seconds');
  };

  const stopMonitoring = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    setStats(prev => ({ ...prev, isRunning: false }));
    setCountdown(0);
    addActivity('🛑 Monitor stopped');
  };

  const clearStats = () => {
    setStats(prev => ({
      ...prev,
      totalChecks: 0,
      totalNewReports: 0,
      errors: [],
      recentActivity: []
    }));
    addActivity('🧹 Statistics cleared');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🤖 ChainAbuse Monitor - Auto 30s
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Automatically checks for new reports every 30 seconds
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`p-4 rounded-lg border-2 ${
          stats.isRunning 
            ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700' 
            : 'bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600'
        }`}>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              stats.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {stats.isRunning ? 'Active' : 'Stopped'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Checks</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalChecks}</p>
        </div>

        <div className="bg-orange-50 border-2 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">New Reports</p>
          <p className="text-2xl font-bold text-orange-600">{stats.totalNewReports}</p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-300 dark:bg-purple-900/20 dark:border-purple-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {stats.isRunning ? 'Next in' : 'Last check'}
          </p>
          <p className="text-lg font-semibold text-purple-600">
            {stats.isRunning 
              ? `${countdown}s`
              : stats.lastCheck 
                ? new Date(stats.lastCheck).toLocaleTimeString('en-US')
                : 'Never'
            }
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.isRunning && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
            <span>Next check in {countdown} seconds</span>
            <span>{Math.round((30 - countdown) / 30 * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
            <div 
              className="bg-blue-600 h-3 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(30 - countdown) / 30 * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={startMonitoring}
          disabled={stats.isRunning}
          className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {stats.isRunning ? (
            <>
              <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
              Monitor Active
            </>
          ) : (
            '▶️ Start Monitor'
          )}
        </button>

        <button
          onClick={stopMonitoring}
          disabled={!stats.isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          ⏹️ Stop
        </button>

        <button
          onClick={clearStats}
          className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          🧹 Clear
        </button>

        <button
          onClick={async () => {
            addActivity('🔄 Manual test...');
            await runSingleCheck();
          }}
          disabled={stats.isRunning}
          className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          🔍 Test Now
        </button>

        <button
          onClick={() => window.open('/', '_blank')}
          className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          🏠 Main Page
        </button>
      </div>

      {/* Activity and Errors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
            📝 Recent Activity
            {stats.isRunning && (
              <div className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((activity, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-300 font-mono bg-white dark:bg-gray-700 p-2 rounded">
                  {activity}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet</p>
            )}
          </div>
        </div>

        {/* Errors */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-200 mb-3">⚠️ Errors</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {stats.errors.length > 0 ? (
              stats.errors.slice(-5).map((error, index) => (
                <div key={index} className="text-sm text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 p-2 rounded">
                  {error}
                </div>
              ))
            ) : (
              <p className="text-sm text-green-600 dark:text-green-400 flex items-center">
                <span className="mr-2">✅</span> No errors
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 How it works</h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>• Monitor checks ChainAbuse every 30 seconds using cache-busting</p>
          <p>• Each check is like "refreshing the page" - bypasses cache</p>
          <p>• New reports are automatically sent to Telegram</p>
          <p>• Progress bar shows time until next check</p>
          <p>• You can safely close this tab - monitor runs server-side</p>
        </div>
      </div>

      {/* Current Status Summary */}
      {stats.isRunning && (
        <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 dark:text-green-200 mb-2">
            🔄 Monitor Active
          </h3>
          <p className="text-sm text-green-700 dark:text-green-300">
            Monitor is checking for new reports every 30 seconds. If a new report appears on ChainAbuse, 
            you'll get a Telegram notification within 30 seconds!
          </p>
        </div>
      )}
    </div>
  );
}