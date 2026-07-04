# Platform-scope procedures (Slice 3 — Platform field schema, S34)

Stored procedures for the platform-defined field catalog (BS §4.3, §17.1) — the read-only
band that renders in every workspace and the surface a Platform admin edits in S34. One
central definition per firm.

| Proc | Purpose |
|---|---|
| `usp_GetPlatformFields` | The platform field catalog (read-only band). |
| `usp_UpdatePlatformField` | Edit a platform field's definition (name / options); system fields immutable. |
