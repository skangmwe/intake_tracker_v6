# Time

## What belongs here

IClock abstraction. Every timestamp read goes through IClock.UtcNow — never DateTime.UtcNow directly (testability).

## What does not belong here

Time-zone conversions. All storage and comparison are UTC; presentation-time zone conversion is a web-side concern.

_Traced from `/artifacts/docs/dev/architecture/shared-inventory.md`._
