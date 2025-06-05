// app/page.tsx - Simple page that triggers auto-start
export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-2xl">🤖</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          ChainAbuse Monitor Running
        </h1>
        <p className="text-gray-600">
          Monitor started automatically - checking every 30 seconds
        </p>
        <div className="mt-4 w-3 h-3 bg-green-500 rounded-full animate-pulse mx-auto"></div>
      </div>
    </div>
  );
}