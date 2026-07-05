# TypedLinks

Record-to-record references + Copy (BS §2.2, §5; api-contracts.md §9).

- `TypedLinksService` — list / add / remove typed links for the Relationships card. Access is gated
  through the FROM record (`IRequestsService.GetByIdAsync`; forbidden / non-existent → 403, BS §22.6).
  `usp_CreateTypedLink` validates the target exists and the same-family rule for `duplicate-of`;
  `usp_GetTypedLinksForRecord` resolves the far record's name/stage access-respectingly (id-only when
  the caller can't see it); `usp_DeleteTypedLink` soft-deletes, gated by membership. Emits
  `link.added` / `link.removed`.
- `CopyService` — `POST /records/{id}/copy` copies a record into a fresh personal Draft in a target
  workspace (Member+ on both sides), stripping outcome/hold/stage/system keys and queuing an optional
  link-back (`related` / `re-pursuit-of`) on the draft. The link-back is stamped as a typed link when
  the draft is submitted (`usp_CreateRequest` queued-links path). `includeAttachments` is accepted but
  a no-op until the Attachments object exists (slice 11).

Consumed by: Tasks (promote-to-request runs Copy + a queued `related` link). Depends on: Requests,
Drafts. Slice 10.
