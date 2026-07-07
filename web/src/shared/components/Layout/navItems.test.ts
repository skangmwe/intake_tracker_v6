import { NAV_SECTIONS, titleForPath } from './navItems';

describe('navItems', () => {
  it('NAV_SECTIONS — has the four grouped sections', () => {
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      'Workspace',
      'Reference',
      'Admin',
      'Platform',
    ]);
  });

  it('titleForPath — root — returns Home', () => {
    expect(titleForPath('/')).toBe('Home');
  });

  it('titleForPath — a nav route — returns that item label', () => {
    expect(titleForPath('/requests')).toBe('Requests');
    expect(titleForPath('/admin/lifecycle')).toBe('Lifecycle & gates');
  });

  it('titleForPath — a sub-route — matches the nav prefix', () => {
    expect(titleForPath('/requests/AIS-00000001')).toBe('Requests');
  });

  it('titleForPath — unknown route — falls back to the app name', () => {
    expect(titleForPath('/nowhere')).toBe('AI Solutions Tracker');
  });
});
