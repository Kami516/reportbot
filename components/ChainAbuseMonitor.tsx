// components/ChainAbuseMonitor.tsx
'use client';

import { useState, useEffect } from 'react';

interface MonitorStats {
  isRunning: boolean;
  lastCheck: string | null;
  totalNewReports: number;
  errors: string[];
}

interface CheckResult {
  success: boolean;
  newReports: number;
  timestamp: string;
  message?: string;
}

export default function ChainAbuseMonitor() {
  const [stats, setStats] = useState<MonitorStats>({
    isRunning: false,
    lastCheck: null,
    totalNewReports: 0,
    errors: []
  });

  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkForReports = async (): Promise<CheckResult> => {
    try {
      const response = await fetch('/api/monitor-chainabuse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      return {
        success: data.success,
        newReports: data.newReports,
        timestamp: data.timestamp
      };

    } catch (error) {
      return {
        success: false,
        newReports: 0,
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const startMonitoring = async () => {
    if (stats.isRunning) return;

    setIsLoading(true);
    
    // Initial check
    const result = await checkForReports();
    
    setStats(prev => ({
      ...prev,
      isRunning: true,
      lastCheck: result.timestamp,
      totalNewReports: prev.totalNewReports + result.newReports,
      errors: result.success ? prev.errors : [...prev.errors, result.message || 'Check failed']
    }));

    // Set up 30-second interval
    const id = setInterval(async () => {
      const result = await checkForReports();
      
      setStats(prev => ({
        ...prev,
        lastCheck: result.timestamp,
        totalNewReports: prev.totalNewReports + result.newReports,
        errors: result.success 
          ? prev.errors 
          : [...prev.errors.slice(-4), result.message || 'Check failed'] // Keep last 5 errors
      }));
    }, 30000); // 30 seconds

    setIntervalId(id);
    setIsLoading(false);
  };

  const stopMonitoring = () => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    
    setStats(prev => ({
      ...prev,
      isRunning: false
    }));
  };

  const clearErrors = () => {
    setStats(prev => ({
      ...prev,
      errors: []
    }));
  };

  const resetStats = () => {
    setStats(prev => ({
      ...prev,
      totalNewReports: 0,
      errors: []
    }));
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          ChainAbuse Monitor
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Monitors chainabuse.com for new reports every 30 seconds
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${stats.isRunning ? 'bg-green-500' : 'bg-red-500'} mr-3`}></div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Status</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {stats.isRunning ? 'Running' : 'Stopped'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">New Reports</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.totalNewReports}
            </p>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Last Check</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {stats.lastCheck ? new Date(stats.lastCheck).toLocaleTimeString() : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={startMonitoring}
          disabled={stats.isRunning || isLoading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          {isLoading ? 'Starting...' : 'Start Monitoring'}
        </button>

        <button
          onClick={stopMonitoring}
          disabled={!stats.isRunning}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          Stop Monitoring
        </button>

        <button
          onClick={resetStats}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Reset Stats
        </button>

        {stats.errors.length > 0 && (
          <button
            onClick={clearErrors}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
          >
            Clear Errors
          </button>
        )}
      </div>

      {/* Error Messages */}
      {stats.errors.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3">
            Recent Errors
          </h3>
          <div className="space-y-2">
            {stats.errors.slice(-5).map((error, index) => (
              <div
                key={index}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3"
              >
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
          Setup Instructions
        </h3>
        <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2">
          <p>Before starting the monitor, make sure you have:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Created a Telegram bot and obtained the bot token</li>
            <li>Created a Telegram group chat and added your bot</li>
            <li>Obtained the chat ID for your group</li>
            <li>Set up your environment variables in .env.local</li>
          </ul>
        </div>
      </div>
    </div>
  );
}