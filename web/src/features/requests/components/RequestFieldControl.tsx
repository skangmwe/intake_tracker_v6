// Re-export shim. The data-driven field renderer moved to @/shared/components/Form/FieldControl
// (now shared with custom-object records). Kept here so existing Request call-sites — the S3 intake
// form and the S4 Intake tab — import RequestFieldControl unchanged.

export { FieldControl as RequestFieldControl, type FieldControlProps as RequestFieldControlProps } from '@/shared/components/Form/FieldControl';
