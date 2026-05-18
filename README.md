# My Personal Advisor

Plataforma de análisis de cartera de acciones impulsada por IA. Proporciona análisis técnico, fundamental y contextual de hasta 10 acciones, con escenarios de corto, medio y largo plazo generados por Google Gemini. Uso académico e informativo — no constituye asesoramiento financiero.

**Demo:** [wall-street-jan.vercel.app](https://wall-street-jan.vercel.app)

---

## Características

- **Análisis multi-horizonte** — Escenarios Positivo / Neutral / Negativo para corto plazo (técnico), medio plazo (fundamentales de crecimiento) y largo plazo (valor y dividendos)
- **Indicadores técnicos** — SMA20, SMA50, RSI14, ATR14, volumen relativo
- **Fundamentales** — PEG ratio, EPS forward, ROE, D/E ratio, margen de beneficio, FCF yield, P/E trailing, rentabilidad por dividendo
- **Análisis de noticias** — Resumen y sentimiento de las últimas 48h via NewsAPI + Gemini
- **P&L en tiempo real** — Seguimiento de posición con precio de compra, cantidad y fecha
- **Análisis global de cartera** — Score de diversificación, perfil de riesgo agregado y recomendaciones de rebalanceo
- **Historial de análisis** — Snapshots automáticos del escenario y RSI con retención de 30 días
- **Actualización automática** — Cron job diario (lunes–viernes 08:00 UTC) + actualización manual con caché de 4h
- **Validación de tickers** — Verificación en tiempo real contra Yahoo Finance antes de añadir

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | Tailwind CSS |
| Auth | NextAuth.js v4 (JWT + bcrypt) |
| ORM | Prisma v5 |
| Base de datos | PostgreSQL (Supabase) |
| Precios | Finnhub API (quote en tiempo real) |
| Histórico + Fundamentales | Yahoo Finance (candles, quoteSummary) |
| IA | Google Gemini 1.5 Flash |
| Noticias | NewsAPI |
| Deploy | Vercel |

---

## Arquitectura

```
src/
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── auth/               # NextAuth + registro
│   │   ├── stocks/             # CRUD de acciones
│   │   ├── update/             # Actualización manual
│   │   └── cron/daily-update/  # Cron job de Vercel
│   ├── dashboard/              # Panel principal + detalle por ticker
│   └── (auth)/                 # Login + registro
├── services/                   # Lógica de negocio
│   ├── analysisOrchestrator    # Pipeline principal de análisis
│   ├── technicalAnalysisService # SMA, RSI, ATR, RelVol
│   ├── aiAnalysisService       # Generación de escenarios con Gemini
│   ├── newsAnalysisService     # Sentimiento de noticias
│   ├── marketDataService       # Datos de mercado actuales e históricos
│   └── portfolioAIService      # Análisis agregado de cartera
├── repositories/               # Acceso a datos (Prisma)
├── lib/                        # Clientes externos (Finnhub, Yahoo, Gemini, NewsAPI)
└── components/                 # Componentes React
```

### Flujo de análisis

```
Usuario pulsa "Actualizar"
        │
        ▼
getCurrentQuote()       ←─ Finnhub API
getHistoricalCloses()   ←─ Yahoo Finance
        │
        ▼
calculateIndicators()   ←─ SMA20, SMA50, RSI14, ATR14, RelVol
fetchAllFundamentals()  ←─ Yahoo quoteSummary
analyzeNewsForTicker()  ←─ NewsAPI + Gemini
        │
        ▼
generateStockAnalysis() ←─ Gemini (multi-horizonte)
        │
        ▼
upsertAnalysis()        ──► PostgreSQL (Supabase)
saveHistorySnapshot()   ──► StockAnalysisHistory
        │
        ▼
runPortfolioAnalysis()  ←─ Gemini (si ≥2 acciones)
```

---

## Variables de entorno

```bash
# Base de datos (Supabase)
DATABASE_URL="postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://USER:PASS@HOST:5432/postgres"

# Autenticación
NEXTAUTH_SECRET="cadena-aleatoria-32-bytes"
NEXTAUTH_URL="https://tu-dominio.vercel.app"

# APIs externas
FINNHUB_API_KEY="tu-finnhub-key"
GEMINI_API_KEY="tu-gemini-key"
NEWS_API_KEY="tu-newsapi-key"

# Cron job
CRON_SECRET="cadena-aleatoria-32-bytes"
```

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# Aplicar migraciones (requiere DIRECT_URL con puerto 5432)
npx prisma migrate deploy

# Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Schema de base de datos

```
User ──────────────────── Stock ──────────────────────── StockAnalysis
  id                        id                              id
  email (unique)            ticker                          price, changePercent
  password (bcrypt)         userId → User                   sma20, sma50, rsi14
  name                      investmentHorizon               analysisText
                            purchasePrice?                  scenarioLabel
                            purchaseDate?                   allHorizons (JSON)
                            quantity?                       metricsData (JSON)
                                                            divergenceAlert

User ──────────────────── PortfolioAnalysis      Stock ── StockAnalysisHistory
                            analysisJson (JSON)              snapshotAt
                            stockCount                       price, scenarioLabel, rsi14
```

---

## Despliegue

La aplicación se despliega automáticamente en Vercel al hacer push a `main`.

El cron job `/api/cron/daily-update` se ejecuta **lunes–viernes a las 08:00 UTC** (antes de la apertura de Wall Street a las 14:30 UTC).

---

## Aviso legal

Este proyecto es de uso académico y educativo. Los análisis generados por IA son meramente informativos y **no constituyen asesoramiento financiero**. No se recomienda comprar, vender ni mantener ningún activo basándose en los datos de esta aplicación.
