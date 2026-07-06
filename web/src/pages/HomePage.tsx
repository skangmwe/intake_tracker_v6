// The Home route (S1 — prototyped). The landing surface every user reaches after sign-in. The full
// per-user composition (viewer-scoped panels, pinned strip, Pin-as-home) lives in the home feature;
// this page-level component just mounts it (web-file-structure.md — pages compose feature surfaces).

import { HomeView } from '@/features/home';

export function HomePage() {
  return <HomeView />;
}
