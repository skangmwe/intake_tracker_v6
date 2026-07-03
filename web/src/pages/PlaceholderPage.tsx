// Generic destination for nav sections whose real screens land in later slices. Keeps the
// shell navigation fully functional now; each route is replaced by its feature as it ships.

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <section aria-labelledby="placeholder-heading">
      <h1 id="placeholder-heading" className="h2">
        {title}
      </h1>
      <p className="body">
        This area is part of the AI Solutions Tracker and is being built. Check back soon.
      </p>
    </section>
  );
}
