// "New field" toolbar affordance for a Global custom object (SP3b Slice 2a, Task 6) — a top-level
// object picker limited to Global custom objects (built-ins never appear; they have no fields
// authored from this screen) plus a New field button. Extracted from PlatformFieldsCatalogTab so
// the tab stays under the component line budget (web-component-architecture.md). Renders nothing
// when there are no Global custom objects yet (nothing to attach a field to).

import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import type { ObjectDefinitionDto } from '@shared/types';

import { Button } from '@/shared/components/Button';

interface GlobalObjectFieldPickerProps {
  objects: readonly ObjectDefinitionDto[];
  onCreateField: (object: ObjectDefinitionDto) => void;
}

export function GlobalObjectFieldPicker({ objects, onCreateField }: GlobalObjectFieldPickerProps) {
  const [objectKey, setObjectKey] = useState('');

  if (objects.length === 0) {
    return null;
  }

  return (
    <>
      <label className="mws-field fields-catalog__object-picker">
        <span className="caption">Object</span>
        <select
          className="mws-select"
          aria-label="Global object for new field"
          value={objectKey}
          onChange={(event) => setObjectKey(event.target.value)}
        >
          <option value="">Select an object…</option>
          {objects.map((object) => (
            <option key={object.objectKey} value={object.objectKey}>
              {object.name}
            </option>
          ))}
        </select>
      </label>
      <Button
        disabled={!objectKey}
        onClick={() => {
          const object = objects.find((candidate) => candidate.objectKey === objectKey);
          if (object) onCreateField(object);
        }}
      >
        <Plus size={16} aria-hidden /> New field
      </Button>
    </>
  );
}
