// app/page.tsx - Strona główna z testem i prostym monitorem
import LiveTestTool from '../components/LiveTestTool';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <LiveTestTool />
    </main>
  );
}