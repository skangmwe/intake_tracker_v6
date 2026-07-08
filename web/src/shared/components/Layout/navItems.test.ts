import { NAV_SECTIONS, titleForPath } from './navItems';

describe('navItems', () => {
  it('NAV_SECTIONS — has the three grouped sections', () => {
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      'Workspace',
      'Reference',
      'Admin',
    ]);
  });

  it('titleForPath — root — returns Home', () => {
    expect(titleForPath('/')).toBe('Home');
  });

  it('titleForPath — a nav route — returns that item label', () => {
    expect(titleForPath('/requests')).toBe('Requests');
    expect(titleForPath('/dashboards')).toBe('Dashboards');
  });

  it('titleForPath — a sub-route — matches the nav prefix', () => {
    expect(titleForPath('/requests/AIS-00000001')).toBe('Requests');
  });

  it('NAV_SECTIONS — Admin groups Workspace and a platform-gated Platform entry', () => {
    const admin = NAV_SECTIONS.find((section) => section.label === 'Admin');
    expect(admin?.items.map((item) => item.label)).toEqual(['Workspace', 'Platform']);
    expect(admin?.items.find((item) => item.to === '/admin')?.platformOnly).toBeUndefined();
    expect(admin?.items.find((item) => item.to === '/platform')?.platformOnly).toBe(true);
  });

  it('titleForPath — an admin surface — resolves to Workspace', () => {
    expect(titleForPath('/admin')).toBe('Workspace');
    expect(titleForPath('/admin/users')).toBe('Workspace');
  });

  it('titleForPath — a platform surface — resolves to Platform', () => {
    expect(titleForPath('/platform')).toBe('Platform');
    expect(titleForPath('/platform/crossing-map')).toBe('Platform');
  });

  it('titleForPath — unknown route — falls back to the app name', () => {
    expect(titleForPath('/nowhere')).toBe('AI Solutions Tracker');
  });
});
