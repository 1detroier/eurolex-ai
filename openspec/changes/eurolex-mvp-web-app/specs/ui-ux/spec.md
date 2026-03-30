# UI/UX Specification

## Purpose

Chat interface, error display, and legal disclaimer banner.

## Requirements

### Requirement: Chat Interface

The system MUST provide a chat UI with a message list and input form. User messages and streamed assistant responses are displayed in chronological order.

#### Scenario: Send a message

- GIVEN the user types a question in the input field
- WHEN the user presses Enter or clicks the send button
- THEN the message appears in the chat as a user bubble
- AND a loading indicator shows while the response streams
- AND the assistant response streams token-by-token into an assistant bubble

#### Scenario: Empty message submission

- GIVEN the input field is empty or whitespace-only
- WHEN the user attempts to submit
- THEN the send button is disabled
- AND no request is made

### Requirement: Error Display

The system MUST display user-friendly error messages in the chat when the API returns an error. Errors MUST NOT expose internal details (stack traces, API keys, provider names).

#### Scenario: API returns 503

- GIVEN the LLM providers are unavailable
- WHEN the chat receives a 503 response
- THEN a system message appears: "The AI service is temporarily unavailable. Please try again in a moment."
- AND the message has a distinct error style (red/orange accent)

#### Scenario: Network failure

- GIVEN the client loses connectivity
- WHEN the fetch request fails entirely
- THEN a system message appears: "Connection lost. Check your internet and try again."
- AND the user's input is preserved in the field

#### Scenario: API returns 400

- GIVEN the request body is invalid
- WHEN the chat receives a 400 response
- THEN a system message appears: "Something went wrong with your request. Please refresh and try again."

### Requirement: Legal Disclaimer

The system MUST display a persistent legal disclaimer banner visible at all times during chat interaction.

**Env vars**: (none — content is hardcoded)

#### Scenario: Disclaimer visible on load

- GIVEN the user opens the application
- WHEN the page renders
- THEN a banner is visible stating: "EuroLex AI provides informational responses only. This is not legal advice. Always consult official EUR-Lex sources and qualified legal professionals."
- AND the banner is positioned at the top or bottom of the viewport
- AND the banner has a distinct visual style (yellow/amber background)

#### Scenario: Disclaimer persists during chat

- GIVEN the disclaimer banner is displayed
- WHEN the user sends messages and receives responses
- THEN the banner remains visible and is not obscured by chat content
- AND the chat area accounts for the banner height

### Requirement: Responsive Layout

The chat UI SHOULD be usable on viewports from 375px width and above.

#### Scenario: Mobile viewport

- GIVEN the viewport is 375px wide
- WHEN the chat renders
- THEN the input form and messages fit within the viewport without horizontal scroll
- AND citation badges wrap to multiple lines if needed

## Phase 2 (DEFERRED)

### Requirement: Dark Mode (DEFERRED)

The system MAY support dark mode via Tailwind `dark:` classes.

### Requirement: Dismissible Disclaimer (DEFERRED)

The system MAY allow users to dismiss the disclaimer with a cookie to remember the choice for 30 days.
