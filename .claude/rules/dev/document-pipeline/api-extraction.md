# Document Extraction — .claude/rules/dev/document-pipeline/api-extraction.md
> See `api/CLAUDE.md` for pipeline overview

Downloads the document from Blob Storage and extracts text using Azure Document
Intelligence. Produces `NormalisedDocument` passed to all downstream stages.

## ADI model
Use `prebuilt-layout` for native-text documents (PDF, Word, Excel, HTML).
Use `prebuilt-read` for scanned, image-only, or handwritten documents.
For PDFs with embedded images, run `prebuilt-layout` on the document then
`prebuilt-read` on each extracted image separately.
Pin API version `2024-11-30`. Always pass bytes via `Base64Source` — never use `StartAnalyzeDocumentFromUri`.

Always pass the source document's HTTP `Content-Type` to ADI alongside the bytes — `BinaryData.FromBytes(bytes, mediaType)` requires `System.Memory.Data` 8.0+ (see `api-coding-standards.md` NuGet Package Pins). Without an explicit media type, ADI silently treats the payload as `application/octet-stream` and may misclassify or under-extract OOXML formats.

## Format-specific behaviour — PDF vs OOXML/HTML

`prebuilt-layout` has **two extraction code paths** depending on the source format. The same model name produces structurally different output, and the rule has historically conflated them — leading to silent zero-output extractions on non-PDF formats.

**Path A — PDF + images.** ADI populates `result.Paragraphs[]` with `BoundingRegions` (page number, polygon). The default `MapPages` walks this collection, builds `NormalisedLine` entries with `BoundingPolygon`, and the chunker runs over paragraph-shaped output. Citations work end-to-end.

**Path B — DOCX, XLSX, PPTX, HTML.** ADI does **NOT** populate `Paragraphs[]`. Content lives only in `result.Content` as a flat string. With the default `OutputContentFormat = Text`, `result.Content` may even come back `null` and `Paragraphs[]` is empty — the call returns "successfully" with zero output.

**Mandatory configuration and fallback:**

1. **Always** set `OutputContentFormat = DocumentContentFormat.Markdown` on `AnalyzeDocumentOptions`. This ensures non-PDF formats produce content in `result.Content` rather than returning `null`.
2. **Implement a Markdown fallback path.** When `Paragraphs[]` is empty, synthesise paragraphs from `result.Content` by splitting on blank lines (`\n\n`). The chunker still runs; the document still becomes searchable.
3. **Citations on non-PDF formats have zero bounding boxes.** The Markdown fallback path does not carry bbox data. The UI must render those citations with file-name and page only — no rectangle overlay. Document this in the citations rule and on the SPA viewer code.
4. **Treat "Paragraphs empty AND Markdown content empty" as a permanent failure.** Set `ExtractionStatus = Failed` with a `FailureReason` of `"Extraction returned no content"`. Never persist as `Ready` with `ChunkCount = 0` — that is indistinguishable in the UI from a successful index and the document looks invisible to the user without explanation.

This was discovered after non-PDF documents uploaded against an earlier extractor reached `Status=Ready, ChunkCount=0` and were silently invisible in the UI. New uploads after the fix index correctly; existing zero-chunk rows are not auto-backfilled.

## Citations flag
Check `CitationsEnabled` before calling ADI. When true, map `BoundingPolygon`
(8-float array, PDF points, origin top-left) from ADI onto every `NormalisedLine`.
When false, leave `BoundingPolygon` null — no coordinate data stored, no extra processing.

`NormalisedDocument` contains: `DocumentId`, `ClassificationTier`, `CitationsEnabled`,
`FullText` (all pages, reading order, `\n\n` between pages), `Pages`, `TokenCount`,
`ExtractionStatus`, and `ConvertedPdfBlobPath` (set for Word/Doc only — UI uses this for highlighting).

`NormalisedLine` contains: `LineId` (`p{page}_l{seq:D3}`), `Text`, `Role`
(heading / paragraph / subheading / footnote), `BoundingPolygon?`, `CharOffsetStart`, `CharOffsetEnd`, `Confidence`.

## Token limit and routing
After extraction, count tokens using the selected provider's tokeniser.
Compare against the model's own context limit (retrieved at runtime from the provider — do not use a fixed config threshold).
Within limit → pass `NormalisedDocument` to `api-llm-auth.md`.
Exceeds model context limit → pass to `api-vector-search.md`.
Cache `TokenCount` on the SQL document record to avoid recalculating on repeat requests.
