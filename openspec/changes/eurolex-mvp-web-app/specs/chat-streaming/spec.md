# Chat Streaming Specification

## Purpose

Core RAG pipeline: receive user query → embed → vector search → stream LLM response with source context.

## Requirements

### Requirement: Query Embedding

The system MUST generate a 384-dimensional embedding for each user query at runtime using the HuggingFace Inference API with the `all-MiniLM-L6-v2` model.

**Env vars**: `HUGGINGFACE_API_KEY`

#### Scenario: Successful embedding generation

- GIVEN a valid `HUGGINGFACE_API_KEY` is configured
- WHEN the user submits a legal question
- THEN the system returns a 384-dimension float array
- AND the embedding is used as input to the vector search

#### Scenario: HuggingFace API unavailable

- GIVEN the HuggingFace API returns a non-2xx status
- WHEN the system attempts to embed the query
- THEN the system SHALL return a 503 error to the client
- AND the error message SHALL indicate the embedding service is unavailable

### Requirement: Vector Search

The system SHALL query the Supabase `documents` table using `pgvector` cosine similarity, returning the top-K most relevant chunks (default K=5).

**Env vars**: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`

#### Scenario: Relevant documents found

- GIVEN an embedding vector is available
- WHEN the system executes the similarity search
- THEN up to 5 document chunks are returned ordered by similarity descending
- AND each chunk includes its `content`, `source_url`, `article_id`, and `regulation_title`

#### Scenario: No relevant documents found

- GIVEN the query is unrelated to any stored regulation
- WHEN the similarity search returns zero results
- THEN the LLM SHALL receive only the user query without context
- AND the response SHALL indicate no specific sources were found

### Requirement: LLM Streaming

The system MUST stream the LLM response using the Vercel AI SDK `StreamingTextResponse`. Cerebras is the primary provider; Groq is the fallback.

**Env vars**: `CEREBRAS_API_KEY`, `GROQ_API_KEY`

#### Scenario: Successful stream from primary provider

- GIVEN `CEREBRAS_API_KEY` is valid and Cerebras API is reachable
- WHEN the system sends the augmented prompt (system context + retrieved chunks + user query)
- THEN the response streams token-by-token to the client
- AND the stream completes with a 200 status

#### Scenario: Primary provider fails, fallback succeeds

- GIVEN Cerebras returns an error or times out (5s threshold)
- WHEN the system retries with Groq using the same prompt
- THEN the response streams from Groq token-by-token
- AND the response header `X-LLM-Provider: groq` is set

#### Scenario: Both providers fail

- GIVEN both Cerebras and Groq return errors or time out
- WHEN the system exhausts the provider chain
- THEN the system SHALL return a 503 error with message "AI services temporarily unavailable"
- AND no partial response is streamed

### Requirement: Chat API Route

The `/api/chat` POST endpoint MUST accept `{ messages: Message[] }` and return a streaming response.

#### Scenario: Valid chat request

- GIVEN the request body contains a `messages` array with at least one user message
- WHEN the endpoint processes the request
- THEN the pipeline executes: embed → search → stream
- AND the response `Content-Type` is `text/event-stream`

#### Scenario: Invalid request body

- GIVEN the request body is missing or `messages` is empty
- WHEN the endpoint validates input
- THEN the system SHALL return 400 with `{ error: "Messages array required" }`

## Phase 2 (DEFERRED)

### Requirement: Query Caching (DEFERRED)

The system MAY cache query embeddings in Vercel KV to avoid redundant HuggingFace calls for repeated queries.
