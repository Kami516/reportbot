// app/monitor/page.tsx - Test page (moved from main page)
import LiveTestTool from '../../components/LiveTestTool';

export default function MonitorPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-4">
            🧪 ChainAbuse Monitor - Test Page
          </h2>
          <div className="flex gap-4">
            <a 
              href="/" 
              className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              🏠 Back to Auto Monitor
            </a>
            <button 
              onClick={() => window.location.reload()}
              className="inline-block px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              🔄 Refresh page
            </button>
          </div>
          
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">💡 Test Page:</h4>
            <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              <p>• This page is for testing the monitor before starting auto-start</p>
              <p>• Main monitor with auto-start is on the home page (/)</p>
              <p>• Use these tools for debugging and testing</p>
            </div>
          </div>
        </div>

        <LiveTestTool />
      </div>
    </main>
  );
}