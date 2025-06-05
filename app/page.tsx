// app/page.tsx - Strona główna z auto-startującym monitorem
import AutoStartMonitor from '../components/AutoStartMonitor';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <AutoStartMonitor />
    </main>
  );
}