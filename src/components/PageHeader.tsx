export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}
