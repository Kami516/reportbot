// components/LiveTestTool.tsx
'use client';

import { useState } from 'react';

interface TestResult {
  success: boolean;
  newReports: number;
  timestamp: string;
  debug?: any;
  message?: string;
}

export default function LiveTestTool() {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showFullDebug, setShowFullDebug] = useState(false);

  const runTest = async () => {
    setIsRunning(true);
    setTestResult(null);

    try {
      console.log('Starting live test...');
      
      const response = await fetch('/api/monitor-chainabuse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('Test result:', data);
      
      setTestResult(data);
      
    } catch (error) {
      console.error('Test failed:', error);
      setTestResult({
        success: false,
        newReports: 0,
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const sendTestMessage = async () => {
    try {
      const response = await fetch(`/api/send-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `🧪 <b>Test wiadomość</b>\n\nCzas: ${new Date().toLocaleTimeString('pl-PL')}\n\nJeśli to widzisz, Telegram bot działa! ✅`
        })
      });

      const result = await response.json();
      alert(result.success ? 'Test message sent!' : `Failed: ${result.message}`);
    } catch (error) {
      alert(`Test message failed: ${error}`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🔍 Live ChainAbuse Test
        </h1>
        <p className="text-gray-600 dark:text-gray-300">
          Test the monitor in real-time to see what's happening
        </p>
      </div>

      {      /* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={runTest}
          disabled={isRunning}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
              Testing...
            </>
          ) : (
            '🔍 Run Live Test'
          )}
        </button>

        <button
          onClick={sendTestMessage}
          className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
        >
          📱 Send Test Message
        </button>

        <button
          onClick={async () => {
            try {
              const response = await fetch('/api/debug-html');
              const data = await response.json();
              console.log('HTML Debug:', data);
              
              // Open debug in new tab
              const debugWindow = window.open('', '_blank');
              debugWindow!.document.write(`
                <html>
                  <head><title>ChainAbuse HTML Debug</title></head>
                  <body>
                    <h1>ChainAbuse HTML Analysis</h1>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                  </body>
                </html>
              `);
            } catch (e) {
              alert('Debug failed: ' + e);
            }
          }}
          className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
        >
          🔍 Debug HTML
        </button>

        <button
          onClick={() => window.open('/monitor', '_blank')}
          className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
        >
          🚀 Open Auto Monitor (30s)
        </button>

        <button
          onClick={async () => {
            try {
              const response = await fetch('/api/debug-html');
              const data = await response.json();
              console.log('HTML Debug:', data);
              
              // Open debug in new tab
              const debugWindow = window.open('', '_blank');
              debugWindow!.document.write(`
                <html>
                  <head><title>ChainAbuse HTML Debug</title></head>
                  <body>
                    <h1>ChainAbuse HTML Analysis</h1>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                  </body>
                </html>
              `);
            } catch (e) {
              alert('Debug failed: ' + e);
            }
          }}
          className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
        >
          🔍 Debug HTML
        </button>

        <button
          onClick={() => window.location.reload()}
          className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          🔄 Refresh Page
        </button>
      </div>

      {/* Results */}
      {testResult && (
        <div className="space-y-4">
          {/* Status Card */}
          <div className={`p-4 rounded-lg border-2 ${
            testResult.success 
              ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700' 
              : 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-semibold ${
                  testResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                }`}>
                  {testResult.success ? '✅ Test Successful' : '❌ Test Failed'}
                </h3>
                <p className={`${
                  testResult.success ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'
                }`}>
                  New reports found: <strong>{testResult.newReports}</strong>
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(testResult.timestamp).toLocaleString('pl-PL')}
                </p>
              </div>
              
              {testResult.newReports > 0 && (
                <div className="text-2xl">🚨</div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {testResult.message && !testResult.success && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Error Details:</h4>
              <p className="text-red-700 dark:text-red-300 font-mono text-sm">{testResult.message}</p>
            </div>
          )}

          {/* Debug Info */}
          {testResult.debug && (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Debug Information</h4>
                <button
                  onClick={() => setShowFullDebug(!showFullDebug)}
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded text-sm"
                >
                  {showFullDebug ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              {/* Quick Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="bg-white dark:bg-gray-700 p-3 rounded">
                  <div className="text-sm text-gray-600 dark:text-gray-300">Method Used</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {testResult.debug.finalMethod || 'None'}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-700 p-3 rounded">
                  <div className="text-sm text-gray-600 dark:text-gray-300">URLs Tried</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {testResult.debug.attempts?.length || 0}
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-700 p-3 rounded">
                  <div className="text-sm text-gray-600 dark:text-gray-300">Reports Found</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {testResult.debug.reportCount || 0}
                  </div>
                </div>
              </div>

              {/* Attempts */}
              {testResult.debug.attempts && testResult.debug.attempts.length > 0 && (
                <div className="mb-4">
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">URL Attempts:</h5>
                  <div className="space-y-2">
                    {testResult.debug.attempts.map((attempt: any, index: number) => (
                      <div key={index} className="bg-white dark:bg-gray-700 border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-mono text-sm text-gray-600 dark:text-gray-300 truncate">
                              {attempt.url}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-1 rounded text-xs ${
                                attempt.success 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                Status: {attempt.status}
                              </span>
                              {attempt.contentType && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded text-xs">
                                  {attempt.contentType.split(';')[0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {testResult.debug.errors && testResult.debug.errors.length > 0 && (
                <div className="mb-4">
                  <h5 className="font-medium text-red-700 dark:text-red-300 mb-2">Errors:</h5>
                  <div className="space-y-1">
                    {testResult.debug.errors.map((error: string, index: number) => (
                      <div key={index} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
                        <div className="text-sm text-red-700 dark:text-red-300 font-mono">{error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Debug (collapsed by default) */}
              {showFullDebug && (
                <div className="mt-4">
                  <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Full Debug Data:</h5>
                  <pre className="bg-gray-100 dark:bg-gray-600 p-3 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto">
                    {JSON.stringify(testResult.debug, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">💡 Next Steps:</h4>
            <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-2">
              {testResult.success ? (
                testResult.newReports > 0 ? (
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">🎉 Great! New reports were found and sent to Telegram!</p>
                    <p>The monitor is working correctly. You can now start the automatic 30-second monitoring.</p>
                  </div>
                ) : (
                  <div>
                    <p>✅ Monitor is working, but no new reports found this time.</p>
                    <p>This is normal - it means the system is detecting existing reports but no brand new ones appeared since last check.</p>
                    <p>💡 Try adding a test report on ChainAbuse website to see if the bot detects it!</p>
                  </div>
                )
              ) : (
                <div>
                  <p>❌ The monitor couldn't find any reports. This could mean:</p>
                  <ul className="list-disc list-inside ml-4 space-y-1">
                    <li>ChainAbuse changed their website structure</li>
                    <li>The proxy connection is having issues</li>
                    <li>The website is blocking automated requests</li>
                    <li>Environment variables are not set correctly</li>
                  </ul>
                  <p className="mt-2">🔧 Check the debug information above for specific error details.</p>
                </div>
              )}
            </div>
          </div>

          {/* Real-time monitoring controls */}
          {testResult.success && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">🚀 Start Real-time Monitoring</h4>
              <p className="text-blue-700 dark:text-blue-300 text-sm mb-3">
                Since the test passed, you can now start the automatic monitoring that checks every 30 seconds.
              </p>
              <button
                onClick={() => window.location.href = '/monitor'}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                → Go to Monitor Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {!testResult && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">🔍 How to Test:</h4>
          <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-1 list-decimal list-inside">
            <li>Click "Run Live Test" to check if the monitor can find reports on ChainAbuse</li>
            <li>Check the debug information to see what's happening under the hood</li>
            <li>If successful, you'll see how many reports were found</li>
            <li>Use "Send Test Message" to verify your Telegram bot is working</li>
            <li>If everything works, proceed to start the real-time monitoring</li>
          </ol>
        </div>
      )}
    </div>
  );
}