# Slice: Objects tab (S30 Fields & objects)

**Branch:** `slice/objects-tab` · **Capability:** the Objects tab on Workspace settings → Fields & objects.

## Why

The prototype's Fields & objects page (S30) has three tabs — **Fields · Objects · Relationships** — but
the build only had Fields · Relationships. The whole **Objects** management surface was missing, and the
page subtitle was wrong. This slice adds the Objects tab to match the prototype.

## Scope (built)

- **Objects table** (shared list-surface `TableShell` + `FilterFunnel` + `TableFooter`): columns
  Object name · Plural label · Records · Fields · Location · Description. Sort (name/plural/location text,
  records/fields numeric), funnel filters (name/plural text, location select), resizable columns, footer
  "N objects". Row click opens the editor sheet.
- **Object editor side-sheet**: Display name, Plural label + Location (2-col), Description, Show-in-sidebar
  switch, conditional Sidebar category (+ create-new), read-only Records/Fields meta in edit mode.
- **CRUD**: create / edit / delete custom objects (soft-delete). Matches the prototype's Create/Edit/Delete
  (no retire/restore for objects).
- **Page**: subtitle fixed to "Define the fields analysts can add to requests and tasks in this workspace.";
  3-tab bar restyled to the prototype's bordered segmented control with Phosphor icons (textbox/stack/graph);
  "Workspace settings" eyebrow added.
- **Backend**: `dbo.ObjectDefinition` (custom objects only) + procs; `ObjectsController` + `ObjectSchemaService`;
  shared `ObjectDefinitionDto`.

## Key architecture decisions

1. **System objects (the 5 built-ins) are C# constants**, not table rows — no per-workspace seeding. Their
   **Records** count is a live count of the backing table (`Requests`/`Tasks`/`Attachments`/`Features`/`ToolkitItem`)
   and their **Fields** count is a live count of `FieldDefinition` (Attachment & Toolkit item have no field
   schema → 0). `dbo.ObjectDefinition` stores only user-created custom objects.
2. **Counts are real derived values, not the prototype's mock numbers** (standards forbid fabricated data), so
   e.g. Records/Fields reflect the actual workspace, not "128 / 7".
3. **Built-in objects are read-only in the editor** (view metadata + counts; no edit, no delete). This matches
   the blueprint's "built-ins locked" and is a deliberate, data-safe tightening of the prototype (which leaves
   built-in metadata editable and even deletable). Only custom objects are editable/deletable.

## Documented deviations / follow-ups (out of this slice)

- Custom objects are **registry entries**: creating one records its metadata (name/plural/nav) but does **not**
  provision a backing records table or make it selectable as a field/relationship object type, and does **not**
  yet dynamically add it to the live left sidebar. `showInSidebar`/`sidebarCategory` are persisted; wiring the
  runtime sidebar to them is a follow-up.
- The "Workspace settings" eyebrow is added to this page only; the sibling settings pages (Users & access, etc.)
  still lack it — a small follow-up could lift it into `SideNavLayout` for all of them.
