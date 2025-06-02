// app/monitor/page.tsx
import SimpleAutoMonitor from '../../components/SimpleAutoMonitor';

export default function MonitorPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <SimpleAutoMonitor />
    </main>
  );
}