export function Flash({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="no-print mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      {message}
    </div>
  );
}
