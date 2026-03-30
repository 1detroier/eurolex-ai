# Citation System Specification

## Purpose

Extract citations from LLM responses and render them as clickable badges linking to EUR-Lex source documents.

## Requirements

### Requirement: Citation Extraction

The system MUST parse the streamed LLM response for citation markers in the format `[Source: regulation_id article_id]` and extract structured citation data.

#### Scenario: Response contains citations

- GIVEN the LLM response includes text like `[Source: 32016R0679 Art. 17]`
- WHEN the citation parser processes the streamed text
- THEN a citation object is created with `{ regulationId, articleId, sourceUrl }`
- AND the `sourceUrl` follows the pattern `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{regulationId}`

#### Scenario: Response has no citations

- GIVEN the LLM response contains no `[Source: ...]` markers
- WHEN the stream completes
- THEN no citation badges are rendered
- AND the response displays normally

#### Scenario: Malformed citation marker

- GIVEN the LLM response contains text resembling `[Source: incomplete` without a closing bracket
- WHEN the parser encounters the malformed marker
- THEN the system SHALL treat it as plain text
- AND no broken citation badge is created

### Requirement: Citation Badge Rendering

Each extracted citation MUST render as a clickable badge component showing the regulation ID and article number.

#### Scenario: Single citation badge

- GIVEN one citation `{ regulationId: "32016R0679", articleId: "Art. 17" }`
- WHEN the message renders
- THEN a badge displays "32016R0679 — Art. 17"
- AND clicking the badge opens the EUR-lex URL in a new tab

#### Scenario: Multiple citations in one response

- GIVEN the LLM response references three different articles
- WHEN the message renders
- THEN three distinct badges appear at the bottom of the message
- AND duplicates are deduplicated (same regulationId + articleId)

### Requirement: Source Preview on Hover

The system SHOULD display a tooltip on citation badge hover showing the regulation title and a snippet of the referenced article text (from the retrieved context).

#### Scenario: Hover preview available

- GIVEN a citation badge is rendered and the source chunk was retrieved during search
- WHEN the user hovers over the badge for 300ms
- THEN a tooltip appears with the regulation title and first 150 characters of the chunk text

#### Scenario: Hover preview unavailable

- GIVEN a citation badge exists but no matching chunk was retrieved (LLM hallucinated reference)
- WHEN the user hovers over the badge
- THEN the tooltip shows only the regulation ID with message "Source not in retrieved context"

## Phase 2 (DEFERRED)

### Requirement: Citation Panel (DEFERRED)

The system MAY provide a collapsible side panel listing all citations for the current conversation with full article text.
