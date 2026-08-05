import { Button } from '@linguaai/ui';

export default function StatusPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">LinguaAI</h1>
      <p className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-pill bg-success" aria-hidden="true" />
        apps/web is running
      </p>
      <Button variant="primary">Get started</Button>
    </main>
  );
}
