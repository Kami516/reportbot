// components/AutoMonitor30s.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface MonitorStats {
  isRunning: boolean;
  totalChecks: number;
  totalNewReports: number;
  lastCheck: string | null;
  nextCheck: string | null;
  errors: string[];
  recentActivity: string[];
}

interface CheckResult {
  success: boolean;
  newReports: number;
  timestamp: string;
  debug?: any;
  message?: string;
}

export default function AutoMonitor30s() {
  const [stats, setStats] = useState<MonitorStats>({
    isRunning: false,
    totalChecks: 0,
    totalNewReports: 0,
    lastCheck: null,
    nextCheck: null,
    errors: [],
    recentActivity: []
  });

  const [countdown, setCountdown] = useState<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const addActivity = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('pl-PL');
    setStats(prev => ({
      ...prev,
      recentActivity: [`[${timestamp}] ${message}`, ...prev.recentActivity.slice(0, 9)]
    }));
  };

  const runSingleCheck = async (): Promise<CheckResult> => {
    try {
      addActivity('🔍 Sprawdzanie nowych raportów...');
      
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
        lastCheck: data.timestamp,
        nextCheck: new Date(Date.now() + 30000).toISOString()
      }));

      if (data.success) {
        if (data.newReports > 0) {
          addActivity(`🚨 Znaleziono ${data.newReports} nowych raportów!`);
          setStats(prev => ({
            ...prev,
            totalNewReports: prev.totalNewReports + data.newReports
          }));
        } else {
          addActivity('✅ Brak nowych raportów');
        }
      } else {
        addActivity(`❌ Błąd podczas sprawdzania: ${data.message || 'Unknown error'}`);
        setStats(prev => ({
          ...prev,
          errors: [...prev.errors.slice(-4), data.message || 'Check failed']
        }));
      }

      return data;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      addActivity(`💥 Błąd połączenia: ${errorMsg}`);
      
      setStats(prev => ({
        ...prev,
        errors: [...prev.errors.slice(-4), errorMsg]
      }));

      return {
        success: false,
        newReports: 0,
        timestamp: new Date().toISOString(),
        message: errorMsg
      };
    }
  };

  const startMonitoring = async () => {
    if (stats.isRunning) return;

    addActivity('🚀 Uruchamianie automatycznego monitorowania...');
    
    setStats(prev => ({
      ...prev,
      isRunning: true,
      nextCheck: new Date(Date.now() + 30000).toISOString()
    }));

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

    addActivity('✅ Monitor uruchomiony - sprawdzanie co 30 sekund');
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

    setStats(prev => ({
      ...prev,
      isRunning: false,
      nextCheck: null
    }));

    setCountdown(0);
    addActivity('🛑 Monitor zatrzymany');
  };

  const clearStats = () => {
    setStats(prev => ({
      ...prev,
      totalChecks: 0,
      totalNewReports: 0,
      errors: [],
      recentActivity: []
    }));
    addActivity('🧹 Statystyki wyczyszczone');
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
          🤖 Automatyczny Monitor ChainAbuse
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Sprawdza nowe raporty co 30 sekund i wysyła powiadomienia na Telegram
        </p>
      </div>

      {/* Status Overview */}
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
                {stats.isRunning ? 'Aktywny' : 'Zatrzymany'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border-2 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Sprawdzeń</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.totalChecks}
          </p>
        </div>

        <div className="bg-orange-50 border-2 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Nowe Raporty</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.totalNewReports}
          </p>
        </div>

        <div className="bg-purple-50 border-2 border-purple-300 dark:bg-purple-900/20 dark:border-purple-700 p-4 rounded-lg">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {stats.isRunning ? 'Następne za' : 'Ostatnie'}
          </p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {stats.isRunning 
              ? `${countdown}s`
              : stats.lastCheck 
                ? new Date(stats.lastCheck).toLocaleTimeString('pl-PL')
                : 'Nigdy'
            }
          </p>
        </div>
      </div>

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
              Monitoring aktywny
            </>
          ) : (
            <>
              ▶️ Uruchom monitor
            </>
          )}
        </button>

        <button
          onClick={stopMonitoring}
          disabled={!stats.isRunning}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          ⏹️ Zatrzymaj
        </button>

        <button
          onClick={clearStats}
          className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          🧹 Wyczyść statystyki
        </button>

        <button
          onClick={async () => {
            addActivity('🔄 Manualny test...');
            await runSingleCheck();
          }}
          disabled={stats.isRunning}
          className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          🔍 Test teraz
        </button>
      </div>

      {/* Progress Bar for Countdown */}
      {stats.isRunning && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
            <span>Kolejne sprawdzenie za {countdown} sekund</span>
            <span>{Math.round((30 - countdown) / 30 * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(30 - countdown) / 30 * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">📝 Ostatnia aktywność</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {stats.recentActivity.length > 0 ? (
              stats.recentActivity.map((activity, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-300 font-mono">
                  {activity}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Brak aktywności</p>
            )}
          </div>
        </div>

        {/* Errors */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 dark:text-red-200 mb-3">⚠️ Ostatnie błędy</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {stats.errors.length > 0 ? (
              stats.errors.slice(-5).map((error, index) => (
                <div key={index} className="text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              ))
            ) : (
              <p className="text-sm text-green-600 dark:text-green-400">Brak błędów 😀</p>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Instrukcje</h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <p>• Monitor sprawdza ChainAbuse co 30 sekund używając cache-busting (omija cache)</p>
          <p>• Przy każdym sprawdzeniu strona jest "odświeżana" żeby znaleźć nowe raporty</p>
          <p>• Nowe raporty są automatycznie wysyłane na Telegram</p>
          <p>• Możesz bezpiecznie zamknąć tę kartę - monitor będzie działał po stronie serwera</p>
          <p>• Użyj "Test teraz" żeby sprawdzić czy wszystko działa poprawnie</p>
        </div>
      </div>
    </div>
  );
}