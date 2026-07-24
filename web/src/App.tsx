// App root — providers (query + auth), router, and the app shell. The McDermott design-system
// CSS is imported once here: base tokens (mws/styles.css), the token override layer
// (mws/tokens.css), then the app-shell layer (mws/app-shell.css).

import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/shared/auth/AuthProvider';
import { AppShell } from '@/shared/components/Layout/AppShell';
import { SideNavLayout } from '@/shared/components/Layout/SideNavLayout';
import { ADMIN_NAV } from '@/shared/components/Layout/adminNav';
import { NAV_SECTIONS } from '@/shared/components/Layout/navItems';
import { queryClient } from '@/shared/queryClient';
import {
  AnnouncementDetailPage,
  AnnouncementsListPage,
  ManageAnnouncementsPage,
  PlatformAnnouncementsPage,
} from '@/features/announcements';
import { FieldsAdminPage, PlatformFieldsPage } from '@/features/fields';
import { DashboardPage, DashboardsListPage } from '@/features/dashboards';
import { AddToCatalogPage, FeatureCatalogPage, FeatureDetailPage } from '@/features/features';
import { ToolkitSurface } from '@/features/toolkit';
import { ImportExportPage } from '@/features/import-export';
import { LifecyclePage } from '@/features/lifecycle';
import {
  DraftsPage,
  IntakeFormPage,
  RecordDetailPage,
  RequestsListPage,
} from '@/features/requests';
import { SearchResultsPage } from '@/features/search';
import { ViewsDashboardsPage } from '@/features/saved-views';
import { WorkspaceAuditPage } from '@/features/audit';
import {
  AccessPage,
  CrossingMapPage,
  FirmWideAuditPage,
  PlatformLayout,
  WorkspaceProvisioningPage,
} from '@/features/platform-admin';
import { UsersAccessPage } from '@/features/users';
import { HomePage } from '@/pages/HomePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

import '@/mws/styles.css';
import '@/mws/tokens.css';
import '@/mws/app-shell.css';
import '@/features/home/home.css';
import '@/features/announcements/announcements.css';
import '@/features/fields/fields.css';
import '@/features/objects/objects.css';
import '@/features/lifecycle/lifecycle.css';
import '@/features/requests/requests.css';
import '@/features/features/features.css';
import '@/features/toolkit/toolkit.css';
import '@/features/dashboards/dashboards.css';
import '@/features/saved-views/savedViews.css';
import '@/features/search/search.css';
import '@/features/import-export/importExport.css';
import '@/features/users/users.css';
import '@/features/audit/audit.css';
import '@/features/platform-admin/platformAdmin.css';
import '@/shared/components/Layout/sideNav.css';

// Routes implemented by real feature surfaces; excluded from the placeholder fallback.
const IMPLEMENTED_ROUTES = new Set([
  '/admin',
  '/platform',
  '/requests',
  '/feature-catalog',
  '/dashboards',
  '/toolkit',
]);

const PLACEHOLDER_ROUTES = NAV_SECTIONS.flatMap((section) => section.items).filter(
  (item) => item.to !== '/' && !IMPLEMENTED_ROUTES.has(item.to),
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/admin"
                element={<SideNavLayout navLabel="Workspace settings" items={ADMIN_NAV} />}
              >
                <Route index element={<Navigate to="users" replace />} />
                <Route path="users" element={<UsersAccessPage />} />
                <Route path="fields" element={<FieldsAdminPage />} />
                <Route path="views" element={<ViewsDashboardsPage />} />
                <Route path="lifecycle" element={<LifecyclePage />} />
                <Route path="announcements" element={<ManageAnnouncementsPage />} />
                <Route path="import-export" element={<ImportExportPage />} />
                <Route path="audit" element={<WorkspaceAuditPage />} />
              </Route>
              <Route path="/platform" element={<PlatformLayout />}>
                <Route index element={<Navigate to="fields" replace />} />
                <Route path="fields" element={<PlatformFieldsPage />} />
                <Route path="crossing-map" element={<CrossingMapPage />} />
                <Route path="access" element={<AccessPage />} />
                <Route path="announcements" element={<PlatformAnnouncementsPage />} />
                <Route path="workspaces" element={<WorkspaceProvisioningPage />} />
                <Route path="audit" element={<FirmWideAuditPage />} />
              </Route>
              <Route path="/requests" element={<RequestsListPage />} />
              <Route path="/requests/new" element={<IntakeFormPage />} />
              <Route path="/requests/:recordId" element={<RecordDetailPage />} />
              <Route path="/drafts" element={<DraftsPage />} />
              <Route path="/dashboards" element={<DashboardsListPage />} />
              <Route path="/dashboards/:id" element={<DashboardPage />} />
              <Route path="/feature-catalog" element={<FeatureCatalogPage />} />
              <Route path="/feature-catalog/new" element={<AddToCatalogPage />} />
              <Route path="/feature-catalog/:recordId" element={<FeatureDetailPage />} />
              <Route path="/toolkit" element={<ToolkitSurface />} />
              <Route path="/search" element={<SearchResultsPage />} />
              <Route path="/announcements" element={<AnnouncementsListPage />} />
              <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
              {PLACEHOLDER_ROUTES.map((item) => (
                <Route
                  key={item.to}
                  path={item.to}
                  element={<PlaceholderPage title={item.label} />}
                />
              ))}
              <Route path="*" element={<PlaceholderPage title="Page not found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
