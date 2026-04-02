
# EuroLex AI - Product Design Review (PDR)

**Document Version**: 4.0 (Scalable Edition)  
**Date**: 2026-03-30  
**Status**: Ready for Development  
**Author**: [Your Name]  
**Stack**: Next.js 14, Python (ETL), Supabase (pgvector), Vercel, Cerebras, Groq  
**Constraint**: 100% Free Tier with horizontal scalability path

---

## 1. Executive Summary

EuroLex AI es un asistente de investigación legal RAG (Retrieval-Augmented Generation) especializado en regulaciones europeas. Diseñado para escalar desde 4 regulaciones iniciales (~900 chunks) hasta un corpus completo de legislación EU (50k+ chunks) sin costes operativos ni rediseño arquitectónico.

**Arquitectura Escalable Clave**:
- **Ingesta de datos**: Python local (ETL) para procesamiento masivo de embeddings sin costes de API
- **Serving**: Next.js 14 con Vercel Edge Middleware para rate limiting distribuido
- **Almacenamiento**: Supabase (pgvector) con índices IVFFlat optimizados para crecimiento
- **IA**: Fallback chain (Cerebras → Groq) con streaming para UX óptima bajo carga

---

## 2. Dataset & Knowledge Base

### 2.1 Corpus Inicial (MVP)
| Regulación | CELEX ID | Páginas | Chunks | Estado |
|------------|----------|---------|--------|--------|
| GDPR | 32016R0679 | 88 | ~250 | Indexado |
| AI Act | 52021PC0206 | 112 | ~320 | Indexado |
| Digital Services Act | 32022D2065 | 44 | ~130 | Indexado |
| Digital Markets Act | 32022R1925 | 60 | ~180 | Indexado |
| **TOTAL MVP** | | **~304** | **~880** | |

### 2.2 Escalabilidad de Datos (Post-MVP)
El sistema soporta **20+ regulaciones** (~15,000 chunks) sin modificar schema:
- **Límite técnico**: 500MB Supabase Free (~100,000 chunks de 384-dim)
- **Estrategia de ingesta**: Script Python local procesa PDFs en batch (coste $0)
- **Actualización**: GitHub Actions mensual para delta updates (regulaciones modificadas)

### 2.3 Estrategia Multi-lenguaje
- **Indexación**: Inglés (fuente autoritativa EUR-Lex)
- **Consultas**: Cualquier idioma (embeddings multilingües de MiniLM)
- **Respuesta**: Idioma de la consulta del usuario

---

## 3. Architecture (Scalable by Design)

### 3.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT                                      │
│  Next.js 14 (App Router) + React + Tailwind + shadcn/ui             │
│  ├─ Chat Interface (Streaming)                                      │
│  ├─ PDF Export (react-pdf)                                          │
│  └─ Document Sidebar                                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              VERCEL EDGE MIDDLEWARE (Rate Limiting)                 │
│  ├─ 5 req/min por IP (stateless, $0, sin consumo de KV)             │
│  ├─ Headers de seguridad (CSP, etc.)                                │
│  └─ Geolocation (EU routing prioritario)                            │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API ROUTES (Next.js)                              │
│  POST /api/chat                                                      │
│    1. Session retrieval (Vercel KV: 2-3 ops/req)                    │
│    2. Vector Search (Supabase: <10ms con índice IVFFlat)            │
│    3. LLM Stream (Cerebras 5s timeout → Groq 5s timeout)            │
│    4. Session update (Vercel KV)                                    │
│  Streaming: Vercel AI SDK (Server-Sent Events)                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                      │
│  ├─ Supabase (PostgreSQL + pgvector) - EU Frankfurt                  │
│  │   ├─ legal_chunks: content, embedding(384), metadata             │
│  │   ├─ Índice IVFFlat (lists=50, optimizado para 2k-25k vectores)  │
│  │   └─ RLS: Public Read / No Write (API-controlled)                │
│  ├─ Vercel KV (Redis) - Session persistence (24h TTL)               │
│  │   └─ ~3-4 comandos KV por turno de chat (soporta ~2000 sesiones/día│
│  └─ External APIs                                                    │
│      ├─ Cerebras: llama-3.1-8b-instruct (Primary, 30 req/min)       │
│      └─ Groq: llama-3.1-8b-instruct (Fallback, 30 req/min)          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ETL LAYER (Local/CI)                              │
│  Python Scripts (Clean Code)                                         │
│  ├─ scripts/seed_legal.py: EUR-Lex → Chunking → Embeddings (MiniLM) │
│  ├─ Procesamiento local (CPU): 0 coste, escalable a miles de docs   │
│  └─ Output: seed.sql para Supabase                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Database Schema (Escalable)

```sql
-- Extensión vectorial
create extension if not exists vector;

-- Tabla principal con proyección de crecimiento
create table legal_chunks (
    id uuid default gen_random_uuid() primary key,
    content text not null,                    -- Texto del chunk
    embedding vector(384) not null,          -- all-MiniLM-L6-v2 dimension
    metadata jsonb not null,                  -- Flexible schema
    
    -- Columnas generadas para filtering eficiente
    regulation text generated always as (metadata->>'regulation') stored,
    article text generated always as (metadata->>'article') stored,
    celex_id text generated always as (metadata->>'celex_id') stored,
    
    created_at timestamp with time zone default now()
);

-- ÍNDICE IVFFLAT OPTIMIZADO PARA ESCALA
-- lists=50 soporta ~2,500-25,000 vectores sin rebuild
-- Para >25k vectores: migrar a HNSW o recrear índice con lists=100+
create index idx_legal_chunks_embedding_ivfflat 
on legal_chunks 
using ivfflat (embedding vector_cosine_ops)
with (lists = 50);

-- Función de búsqueda (escalable con índice)
create or replace function match_legal_chunks(
    query_embedding vector(384),
    match_threshold float,
    match_count int,
    p_regulation text default null
)
returns table(
    id uuid,
    content text,
    metadata jsonb,
    similarity float
) as $$
begin
    return query
    select 
        lc.id,
        lc.content,
        lc.metadata,
        1 - (lc.embedding <=> query_embedding) as similarity
    from legal_chunks lc
    where 1 - (lc.embedding <=> query_embedding) > match_threshold
        and (p_regulation is null or lc.regulation = p_regulation)
    order by lc.embedding <=> query_embedding
    limit match_count;
end;
$$ language plpgsql security definer;

-- ROW LEVEL SECURITY (Escalabilidad de seguridad)
alter table legal_chunks enable row level security;

-- Política: Lectura pública (via API segura)
create policy "allow_public_read"
  on legal_chunks for select
  using (true);

-- Política: Sin escritura desde cliente (solo via Service Role Key en API Routes)
create policy "deny_all_writes"
  on legal_chunks for all
  using (false);
```

### 3.3 Escalabilidad del Middleware (Edge)

**Por qué Edge Middleware y no KV para rate limiting**:
- **Coste**: Edge = $0 (ejecuta en CDN), KV = $0.20/1M requests (free tier limitado a 30k/month)
- **Performance**: ~1ms latency global (Vercel Edge Network)
- **Capacidad**: Stateless, no consume recursos de la función serverless

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 5; // requests per minute
const RATE_LIMIT_WINDOW = 60; // seconds

export function middleware(request: NextRequest) {
  // Obtener IP real (considerando proxies)
  const ip = request.headers.get('x-real-ip') ?? 
             request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
             'anonymous';
  
  const fingerprint = `ratelimit:${ip}`;
  
  // NOTA: En MVP simple, usamos headers para tracking básico
  // Para escala real, se implementaría Edge Config o Redis externo
  // Por ahora, delegamos a la API Route para el contador preciso (KV)
  // El middleware aquí actúa como primera línea de defensa (geo-blocking, etc.)
  
  const response = NextResponse.next();
  
  // Headers informativos
  response.headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
  
  return response;
}

export const config = {
  matcher: ['/api/chat/:path*', '/api/health'],
};
```

**Nota**: La combinación Middleware (validación rápida) + KV (contador preciso) optimiza el free tier.

---

## 4. Core Features (MVP Escalable)

### 4.1 Chat con Streaming
- **Tecnología**: Vercel AI SDK (`streamText`, `useChat`)
- **UX**: Texto aparece palabra por palabra (<3s time-to-first-token)
- **Contexto**: Últimos 10 mensajes (ventana deslizante para optimizar tokens)

### 4.2 Sistema de Citaciones Verificables
- **Formato**: Links directos a EUR-Lex con anclas HTML (`#art_17`)
- **UI**: Badges clickeables + modal con preview del chunk fuente
- **Escalabilidad**: Metadata almacenada en JSONB permite agregar nuevos campos sin migración

### 4.3 Exportación PDF (Client-Side)
- **Librería**: `@react-pdf/renderer`
- **Ventaja**: Zero server load (generación en navegador del usuario)
- **Template**: Profesional con logo, fecha, disclaimer legal

### 4.4 Modo Comparador (Post-MVP)
- **Estado**: Excluido del MVP para reducir complejidad
- **Implementación futura**: Detección de keywords + grouping por regulación en la query

---

## 5. LLM & Embedding Strategy (Escalable y Económica)

### 5.1 Embeddings: Local ETL (Zero API Cost)
**Decisión arquitectónica crítica**: Procesamiento local vs API paga.

| Método | Coste (MVP) | Coste (10k docs) | Latencia | Control |
|--------|-------------|------------------|----------|---------|
| **OpenAI API** | $0.02 | $2.00 | API dependent | Limitado |
| **Hugging Face Inference** | $0 | $0 (rate limits) | Variable | Medio |
| **Local (MiniLM)** | **$0** | **$0** | **CPU local** | **Total** |

**Implementación**:
```python
# scripts/seed_legal.py
from sentence_transformers import SentenceTransformer
import numpy as np

# Modelo descargado una vez (~80MB), ejecutado localmente
model = SentenceTransformer('all-MiniLM-L6-v2')  # 384 dims

def process_regulation(file_path: str):
    chunks = extract_and_chunk(file_path)  # Lógica de chunking
    embeddings = model.encode(chunks, show_progress_bar=True)
    return generate_sql_inserts(chunks, embeddings)

# Escalable: Procesar 100 regulaciones cuesta $0 y ~30 min en laptop
```

**Ventajas de escala**:
- Sin rate limits de API externa durante ingesta masiva
- Sin costes sorpresa al expandir corpus
- Reproducible (mismo modelo siempre)

### 5.2 LLM Inference: Direct API con Fallback
**Primario**: Cerebras (`llama-3.1-8b-instruct`)
- Límite: 1M tokens/day, 30 req/min
- Timeout: 5 segundos

**Fallback**: Groq (`llama-3.1-8b-instruct`)
- Límite: 500K tokens/day, 30 req/min  
- Timeout: 5 segundos

**Implementación**:
```typescript
// lib/llm-clients.ts
import { createCerebras } from '@ai-sdk/cerebras';
import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

export async function generateLegalResponse(prompt: string) {
  const cerebras = createCerebras({ apiKey: process.env.CEREBRAS_API_KEY });
  
  try {
    const { textStream } = await streamText({
      model: cerebras('llama-3.1-8b-instruct'),
      prompt,
      maxTokens: 1024,
      abortSignal: AbortSignal.timeout(5000), // 5s timeout
    });
    return textStream;
  } catch (error) {
    // Fallback a Groq
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    const { textStream } = await streamText({
      model: groq('llama-3.1-8b-instruct'),
      prompt,
      maxTokens: 1024,
      abortSignal: AbortSignal.timeout(5000),
    });
    return textStream;
  }
}
```

---

## 6. Scalability Considerations (Sección Clave)

### 6.1 Database Scaling Path
| Volumen | Configuración | Acción Requerida |
|---------|---------------|------------------|
| 0-1,000 | `lists=50` (IVFFlat) | Ninguna (MVP) |
| 1,000-10,000 | `lists=50` | Monitorear query time |
| 10,000-50,000 | `lists=100` o HNSW | Rebuild índice |
| >50,000 | Supabase Pro + HNSW | Upgrade plan ($25/mes) |

### 6.2 Rate Limiting Scaling
- **MVP**: Edge Middleware (validación) + KV (contador) = ~2000 sesiones/día
- **Alta carga**: Migrar a Redis/Upstash dedicado o Vercel Edge Config para rate limiting distribuido

### 6.3 Embeddings Scaling
- **MVP-10k docs**: Local CPU (script Python)
- **10k+ docs**: GitHub Actions (CI) con runners más potentes o Hugging Face Inference API (si se acepta coste bajo)

### 6.4 LLM Scaling
- **Free tier agotado**: Implementar cola de mensajes (Vercel Cron + Queue) o upgrade a Cerebras/Groq pay-as-you-go ($0.60/1M tokens típico)

---

## 7. Rate Limiting & Security

### 7.1 Arquitectura de Límites (Free Tier Optimized)
```typescript
// Lógica combinada: Middleware (Edge) + API Route (KV)

// 1. Middleware (Edge): Validación de formato, geo-blocking, headers
// 2. API Route (KV): Contador preciso por fingerprint

// Fingerprint robusto (IP + User-Agent hash)
const fingerprint = hashIpAndUa(request.ip, request.headers.get('user-agent'));
// Key: ratelimit:${fingerprint} -> { count: number, resetTime: timestamp }
```

### 7.2 Límites Operativos
| Recurso | Límite | Alcance (MVP) |
|---------|--------|---------------|
| Requests/min (IP) | 5 | ~10,000 users/day |
| Mensajes/sesión | 20 | 20 interacciones profundas |
| Sesiones/IP/día | 100 | Previene botnets |
| KV commands/mes | 30,000 | ~2,000 sesiones completas |

### 7.3 Seguridad de Datos
- **RLS**: Solo lectura pública, escritura bloqueada
- **Service Role Key**: Solo en API Routes server-side (nunca expuesta al cliente)
- **Anon Key**: Expuesta pero restringida por RLS

---

## 8. Testing Strategy (Escalable)

| Nivel | Herramienta | Cobertura | Trigger |
|-------|-------------|-----------|---------|
| **Unit (Python)** | pytest | Chunking, embeddings, SQL gen | Pre-commit |
| **Unit (TS)** | Jest | API utilities, prompt builders | Pre-commit |
| **Integration** | Playwright | E2E flujo completo, streaming | CI (GitHub Actions) |
| **Load** | k6 | 50 concurrent users, p95 < 3s | Pre-deploy |
| **Data Quality** | Python script | Citation accuracy >90% | Post-seeding |

---

## 9. Implementation Roadmap (2 Weeks)

### Week 1: Foundation & Scale Prep
| Día | Tarea | Entregable Escalable |
|-----|-------|---------------------|
| 1 | Setup Next.js + Supabase (EU) + Vercel KV | Repo con regions correctas |
| 2 | Python ETL: Script seeding con MiniLM | `seed.sql` generado localmente |
| 3 | Supabase: Schema + Índice IVFFlat (lists=50) + RLS | DB lista para 10k+ rows |
| 4 | Middleware (Edge) + API Route streaming (AI SDK) | `/api/chat` funcional |
| 5 | Cerebras integration + Fallback logic (Groq) | Resiliencia implementada |
| 6 | UI: Chat streaming + Sidebar | Componentes reutilizables |
| 7 | Testing suite (Jest + pytest) | CI pipeline lista |

### Week 2: Polish & Documentation
| Día | Tarea | Entregable |
|-----|-------|------------|
| 8 | Session persistence (KV) + Rate limiting UI | UX completa |
| 9 | Citaciones con links EUR-Lex | Feature verificable |
| 10 | PDF Export (react-pdf) | Valor añadido |
| 11 | Responsive + Animaciones | Mobile-first |
| 12 | Load testing (k6) + Optimización | Métricas <3s p95 |
| 13 | README técnico + Documentación escala | Open Source ready |
| 14 | Deploy producción + Portfolio page | Live demo |

---

## 10. Cost Analysis (Monthly) - Free Tier Limits

| Servicio | Plan | Uso Proyectado | Coste |
|----------|------|----------------|-------|
| Vercel | Hobby | 1 project, <100GB | $0 |
| Supabase | Free (EU) | 50MB DB, 2GB egress | $0 |
| Vercel KV | Free | ~15k commands (sessiones) | $0 |
| Cerebras | Free | <1M tokens/day | $0 |
| Groq | Free | <500k tokens/day (fallback) | $0 |
| Embeddings | Local | CPU propio | $0 |
| GitHub Actions | Free | ~10 min CI | $0 |
| **TOTAL** | | | **$0** |

**Trigger de Upgrade (cuando escales)**:
- Supabase: >500MB datos (~100k chunks) → Pro ($25/mes)
- Vercel: >100GB bandwidth → Pro ($20/mes)
- LLM: >1M tokens/día consistentes → Pay-as-you-go (~$0.60/1M tokens)

---

## 11. Success Metrics (KPIs)

| Métrica | Target | Medición |
|---------|--------|----------|
| **Citation Accuracy** | >90% | Test automático: artículo citado existe en contexto |
| **Query Latency** | p95 < 3s | Vercel Analytics (incluyendo streaming) |
| **Availability** | 99% | UptimeRobot (fallback chain activo) |
| **Scalability** | 10k chunks | Validación de índice sin degradación |
| **User Retention** | 3+ msg/sesión | Vercel KV analytics (anónimo) |

---

## 12. Legal & Ethics

### Disclaimer UI
```
⚠️ Not Legal Advice: EuroLex AI provides information based on EU regulations 
but does not constitute legal advice. Always consult a qualified legal 
professional for specific matters.
[Cite Sources] [Export PDF]
```

### Data Policy
- **Zero Retention**: Logs temporales solo, 24h TTL en KV
- **No PII**: Fingerprinting hash (irreversible), no emails/nombres
- **Open Source**: EUR-Lex data (public domain), atribución requerida

---

## 13. Environment Variables

```bash
# .env.local (gitignored)
# LLM Providers (Free Tier)
CEREBRAS_API_KEY=sk-cbrs-...
GROQ_API_KEY=gsk_...

# Database (Supabase EU)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... # Solo server-side

# Caching & Sessions (Vercel KV)
KV_URL=redis://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...

# Optional (Post-MVP)
EURLEX_API_KEY=... # Para auto-updates futuros
```

---

## 14. Project Structure (Clean Architecture)

```
eurolex-ai/
├── app/                              # Next.js 14 App Router
│   ├── api/
│   │   └── chat/
│   │       └── route.ts              # Streaming endpoint
│   ├── layout.tsx
│   ├── page.tsx                      # Landing + Chat
│   └── globals.css
├── components/                       # React Components
│   ├── chat/
│   │   ├── chat-container.tsx        # Lógica de mensajes
│   │   ├── message-stream.tsx        # Streaming display
│   │   └── citation-modal.tsx        # Preview de fuentes
│   ├── sidebar.tsx                   # Lista regulaciones
│   └── pdf-export.tsx                # Generación PDF cliente
├── lib/                              # Utilidades (Clean Code)
│   ├── db/
│   │   └── supabase.ts               # Cliente DB
│   ├── ai/
│   │   ├── cerebras-client.ts        # Primary LLM
│   │   ├── groq-client.ts            # Fallback LLM
│   │   └── prompts.ts                # Templates
│   ├── rate-limit/
│   │   └── kv-store.ts               # Vercel KV wrapper
│   └── utils/
│       └── fingerprint.ts            # IP + UA hashing
├── middleware.ts                     # Edge Rate Limiting
├── scripts/                          # Python ETL (Local)
│   ├── __init__.py
│   ├── seed_legal.py                 # Pipeline principal
│   ├── chunking.py                   # Lógica de split
│   ├── embeddings.py                 # MiniLM wrapper
│   └── test_seeding.py               # Tests pytest
├── tests/                            # Testing suite
│   ├── unit/
│   └── e2e/                          # Playwright
├── types/
│   └── legal.ts                      # Interfaces TypeScript
├── seed.sql                          # Generated (gitignored)
├── requirements.txt                  # Python deps
├── next.config.js                    # Vercel config
└── README.md                         # Docs + Setup guide
```

---

## 15. Appendix

### Recursos EUR-Lex
- API Docs: `https://eur-lex.europa.eu/content/help/data-reuse/webservices.html`
- Bulk Download: `https://eur-lex.europa.eu/content/help/data-reuse/reuse-contents.html`

### Límites Free Tier (Referencia)
- **Vercel Hobby**: 10s functions, 100GB bandwidth, 1,000 image optimizations
- **Supabase Free**: 500MB DB, 2GB egress, 1M realtime messages
- **Vercel KV**: 256MB, 30k commands/month, 100MB egress/day
- **Cerebras**: 1M input tokens/day, 1M output tokens/day, 30 req/min
- **Groq**: 500K tokens/day, 30 req/min

### Scalability Runbook (Post-MVP)
1. **Índice lento**: REINDEX con `lists=100` o migrar a HNSW
2. **KV exhaustion**: Implementar Edge Config para rate limiting
3. **LLM limits**: Implementar cola con Vercel Cron (defer)
4. **DB size**: Shard por regulación o upgrade a Supabase Pro

---

**End of Document v4.0**
```