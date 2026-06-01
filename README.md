# My Personal Advisor

Plataforma de análisis de cartera de acciones impulsada por IA. Gestiona hasta 20 acciones con análisis técnico, fundamental y contextual multi-horizonte generado por Google Gemini 2.5 Flash Lite, junto con herramientas cuantitativas avanzadas (Monte Carlo, stress testing, optimización Black-Litterman, correlación). Uso académico e informativo — no constituye asesoramiento financiero.

**Demo:** [wall-street-jan.vercel.app](https://wall-street-jan.vercel.app)

---

## Funcionalidades

### Análisis de acciones
- **Análisis multi-horizonte** — Escenarios Positivo / Neutral / Negativo para corto plazo (técnico), medio plazo (fundamentales) y largo plazo (valor), generados en una sola llamada Gemini por acción
- **Señales algorítmicas** — Acción prescriptiva (COMPRA / VENTA / MANTENER / REDUCIR) con `confidenceScore` 0–100, nivel técnico de referencia (`executionPriceLimit`) y justificación cuantitativa
- **Indicadores técnicos** — SMA20, SMA50, RSI14, ATR14, volumen relativo, exponente de Hurst (R/S), serie RSI completa para detección de divergencia
- **Fundamentales** — PEG ratio, EPS forward, ROE, Deuda/Equity (medio plazo); P/E trailing, Dividend Yield, margen neto, FCF Yield, Beta (largo plazo)
- **Divergencia precio/RSI clásica** — Detecta los cuatro tipos canónicos comparando máximos/mínimos de precio y RSI entre dos mitades de una ventana de 14 barras: `REGULAR_BEARISH` (precio HH, RSI LH — agotamiento alcista), `REGULAR_BULLISH` (precio LL, RSI HL — suelo potencial), `HIDDEN_BEARISH` (precio LH, RSI HH — continuación bajista), `HIDDEN_BULLISH` (precio HL, RSI LL — continuación alcista). Intensidad `WEAK / MODERATE / STRONG` según delta RSI (>5 pts / >10 pts). Badge rojo/verde en `StockCard` con tooltip descriptivo (ej. "Precio +3.2% pero RSI -8pts en 14 días")
- **Divergencia técnico-sentimiento (IA)** — Alerta separada cuando los indicadores técnicos y el sentimiento noticioso apuntan en direcciones opuestas, generada por Gemini por horizonte
- **Alertas de cartera por acción** — Detecta solapamiento de correlación con el resto de posiciones dentro del análisis de cada horizonte

### Contexto de mercado
- **Análisis de noticias** — Sentimiento Positivo / Neutral / Negativo de artículos de las últimas 48h via NewsAPI, procesado en batch con una sola llamada Gemini para todas las acciones
- **Contexto macroeconómico** — Clasificación de noticias globales (bancos centrales, geopolítica, inflación/PIB) con nivel de impacto HIGH / MEDIUM / LOW e inyección automática como sesgo en el análisis IA; caché 4h en Supabase
- **Earnings guidance** — Inferencia del guidance corporativo más reciente (sentimiento EXPANSIVO / PRUDENTE / CONTRACTIVO, revenue YoY, EPS status, citas CEO/CFO); caché 30 días (una inferencia por trimestre fiscal)
- **Índice Fear & Greed propio** — Compuesto de RSI (40%) + sentimiento noticioso (60%), escala 0–100

### Motor de Valoración Fundamental (Peter Lynch PEG Ratio)

El backend calcula y clasifica el Ratio PEG (Price/Earnings-to-Growth) siguiendo la metodología de Peter Lynch en `quantitativeService.ts`. El cálculo es matemáticamente defensivo: cualquier valor nulo, negativo, cero o no finito en el PER o en la tasa de crecimiento del EPS devuelve `NO_DISPONIBLE` con `pegScore: 50` (neutral), evitando divisiones por cero o resultados `NaN`/`Infinity`.

**Rangos de clasificación y scores de convicción:**

| PEG | Clasificación | `pegScore` | Significado |
|-----|--------------|-----------|-------------|
| < 0.5 | `ULTRA_GANGA` | 100 | Crecimiento cotiza muy por debajo de su valor intrínseco |
| 0.5 – < 1.0 | `INFRAVALORADA` | 85 | Precio atractivo respecto al crecimiento esperado |
| 1.0 – 1.5 | `JUSTA` | 60 | Valoración equilibrada; Lynch la considera el umbral neutro |
| > 1.5 | `SOBREVALORADA` | 20 | Precio excesivo respecto al crecimiento; reduce convicción de compra |
| inválido | `NO_DISPONIBLE` | 50 | Dato no disponible; señal ignorada en el prompt |

**Integración en el pipeline:** el insight PEG (`valuationStatus` + `pegScore`) se inyecta como campo `fund.pegLynch` en el payload JSON enviado a Gemini en la Fase 4 del pipeline. La instrucción estática de sistema (`STATIC_SYSTEM_INSTRUCTION`) le indica al modelo que use `pegLynch` como **ancla fundamental de convicción** para los horizontes `mediumTerm` y `longTerm`: un status `ULTRA_GANGA` sesga hacia COMPRA salvo RSI sobrecomprado o macro adverso; `SOBREVALORADA` limita el `confidenceScore` de COMPRA a ≤ 40. El `pegScore` contribuye con peso 0.25 al `confidenceScore` final junto a señales técnicas (RSI, ATR), cuantitativas (Sharpe, Kelly, Fear & Greed) y macro (earnings guidance, contexto global).

### Métricas cuantitativas de cartera
- **Sharpe ratio** — Anualizado con tasa libre de riesgo configurable (default 3.5%)
- **Kelly Criterion** — Fracción óptima de posición sin restricciones (0–1)
- **Volatilidad GARCH(1,1)** — Modelado de heterocedasticidad condicional (α=0.09, β=0.90) anualizado a 30 días
- **Matriz de correlación** — Pearson entre todos los pares de acciones con mapa de calor; detección de pares de alta correlación (>0.75)
- **Portfolio weight** — Peso relativo de cada posición según valor de mercado actual

### Herramientas de análisis avanzado
- **Simulación Monte Carlo** — 1 000 trayectorias GBM, horizontes configurables (1–30 años), aportaciones mensuales opcionales; distribución t de Student df=5 por defecto (fat tails, VaR95 ~15–25% más conservador que GBM normal); la página de simulación muestra tarjetas explícitas de **VaR95** (pérdida máxima probable al 95%) y **CVaR95** (Expected Shortfall: media de pérdidas en el peor 5% de escenarios), más probabilidad de pérdida; percentiles p10/p25/p50/p75/p90 en gráfico de abanico. Parámetros `distribution` y `degreesOfFreedom` configurables via API para comparativa NORMAL vs STUDENT_T
- **Stress Testing histórico** — 5 escenarios: Crisis 2008 (-56.5%, 356d), COVID 2020 (-34%, 33d), Subida tipos 2022 (-25.5%, 282d), Punto com 2000 (-49.1%, 638d), Lunes negro 1987 (-33.6%, 101d); calcula pérdida total, valor final y días estimados de recuperación
- **Optimización Black-Litterman** — Prior de equilibrio de mercado + vistas de retorno esperado generadas por Gemini + combinación bayesiana (τ=0.05, δ=2.5); fallback a Markowitz si matriz singular o sin vistas
- **Markowitz (Varianza Mínima)** — Gradiente descendente (3 000 pasos), sin posiciones cortas, shrinkage de Ledoit-Wolf simplificada (α=0.2)
- **Tax Harvesting** — Detecta posiciones con pérdida latente > $100 y sugiere ETF alternativo por sector (QQQ para tech, XLF para finanzas, XLE para energía, etc.)
- **Rebalanceo de cartera** — Calcula trades necesarios para alcanzar pesos objetivo con detección de oportunidades de tax harvesting integrada

### Perfil de riesgo
- **Cuestionario de 12 preguntas** — Escala Likert 0–3, puntuación total 0–36
- **Clasificación automática** — Conservador (<12) / Moderado (12–24) / Agresivo (>24)
- **Inyección en análisis IA** — El perfil del inversor se incluye en cada llamada a Gemini como contexto de aversión al riesgo

### Gestión de cartera
- **Hasta 20 acciones** — NYSE y NASDAQ, validadas en tiempo real contra Yahoo Finance antes de añadir. Con batch de 4, 20 acciones = 5 llamadas Gemini (~185s en el peor caso; requiere Vercel Pro o superior para el cron)
- **P&L por posición** — Precio de compra, cantidad, fecha, coste base, valor actual, ganancia/pérdida en USD y %
- **Historial de análisis** — Snapshots automáticos (escenario, RSI, precio) con retención de 30 días e índice DESC por fecha
- **Análisis global de cartera** — Resumen IA de diversificación, riesgo agregado y recomendaciones de rebalanceo (mínimo 2 acciones con análisis)
- **Benchmark de cartera** — Comparación de rendimiento vs índice de referencia
- **Exportación CSV** — `GET /api/portfolio/export?format=csv` descarga un CSV con 34 campos por acción: precio, cambio %, escenario activo, confidenceScore, indicadores técnicos (RSI14, SMA20/50, ATR14, volumen relativo), escenarios por horizonte (corto/medio/largo plazo), divergencia precio/RSI, datos de posición (precio compra, cantidad, coste base, valor actual, P&L en USD y %), y timestamp de generación. Requiere sesión autenticada; solo exporta datos del usuario en sesión. Botón «↓ CSV» en el resumen de cartera
- **Motor de ventas** — `POST /api/portfolio/sell` registra una venta parcial o total de una posición. Body: `{ stockId, shares, price }`. Verifica propiedad y disponibilidad de acciones, calcula con precisión de 2 decimales `investedAmount = shares × buyPrice`, `revenueAmount = shares × sellPrice`, `profitAmount = revenueAmount − investedAmount` y `profitPercentage = (profitAmount / investedAmount) × 100`. Persiste la operación en `ClosedOperation` y actualiza la posición (reduce `quantity` o elimina el registro si `quantity` llega a 0). Devuelve el registro de la operación cerrada y el estado actualizado. HTTP 400 si acciones insuficientes o precio de compra no registrado; 404 si la posición no existe
- **Historial de operaciones cerradas** — `GET /api/portfolio/history` devuelve el listado completo de ventas ejecutadas (orden `closedAt DESC`) junto a los agregados globales de la cartera: capital total invertido en operaciones cerradas, retorno total recaudado, profit absoluto acumulado ($) y ROI global (%). El ROI se calcula como `(Σ revenueAmount − Σ investedAmount) / Σ investedAmount × 100` sobre todas las operaciones cerradas del usuario

### Actualización de datos
- **Actualización manual** — Botón en dashboard con caché de 4h; muestra resultado completo: actualizadas · en caché · con error (con tickers afectados)
- **Actualización parcial** — Opciones individuales: solo precio, solo técnicos, solo noticias (sin consumir créditos IA)
- **Cron job diario** — Lunes–viernes a las 08:00 UTC (antes de la apertura de Wall Street a las 14:30 UTC), ejecutado por Vercel Cron
- **Procesado en batch** — Grupos de hasta 4 acciones por llamada Gemini para minimizar latencia y consumo de API

### Resiliencia y seguridad
- **Timeouts por servicio** — Cada llamada externa usa `withTimeout`: Finnhub quote 3s, Yahoo histórico 8s, Yahoo fundamentals 6s, NewsAPI por acción 5s (batch 10s), Gemini por acción 25s, Gemini portfolio 30s
- **Degradación graceful** — Si una fuente falla (timeout o error de red), el análisis continúa con datos parciales en lugar de abortar el stock completo; `DataQuality { technical, fundamentals, news, degraded }` advierte a Gemini cuando los datos son incompletos
- **Paralelismo en el pipeline** — Fetch de macro y artículos de noticias se lanzan en paralelo (independientes); sentimiento batch y earnings también en paralelo (tras recibir artículos)
- **Validación CRON_SECRET resistente a timing attacks** — `crypto.timingSafeEqual` + SHA-256 en ambos lados; la comparación tarda tiempo constante independientemente del secreto enviado
- **System instruction estática** — `STATIC_SYSTEM_INSTRUCTION` se define una vez a nivel de módulo; el contexto dinámico (macro, earnings, riskProfile) va en el mensaje de usuario como JSON compacto, permitiendo que el prefijo del sistema se almacene en la caché KV implícita de Gemini y reduciendo el coste de tokens de entrada en cada llamada batch

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) + TypeScript | 14.2.35 / 5 |
| UI | Tailwind CSS | 3.3.0 |
| Auth | NextAuth.js (JWT, Credentials) + bcryptjs | 4.24.14 / 3.0.3 |
| ORM | Prisma | 5.22.0 |
| Base de datos | PostgreSQL — Supabase | — |
| Validación | Zod | 4.4.3 |
| Precios en tiempo real | Finnhub API | — |
| Histórico + Fundamentales | Yahoo Finance (client propio, sin SDK) | — |
| Noticias | NewsAPI | — |
| IA generativa | Google Gemini 2.5 Flash Lite | — |
| Tests | Vitest + Playwright | 2.1.9 / 1.60.0 |
| Deploy | Vercel | — |

---

## Arquitectura

```
src/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── auth/                 # NextAuth + registro
│   │   │   ├── [...nextauth]/    # Catch-all NextAuth
│   │   │   └── register/         # POST: email + password
│   │   ├── stocks/               # GET/POST/DELETE acciones
│   │   ├── update/               # POST: actualización manual
│   │   ├── cron/daily-update/    # POST: cron job Vercel (L–V 08:00 UTC)
│   │   ├── portfolio/
│   │   │   ├── correlation/      # GET: matriz de correlación
│   │   │   ├── optimize/         # GET: Black-Litterman
│   │   │   ├── rebalance/        # POST: rebalanceo + tax harvesting
│   │   │   ├── simulation/       # POST: Monte Carlo + stress tests
│   │   │   ├── export/           # GET: exportación CSV de cartera (?format=csv)
│   │   │   ├── sell/             # POST: registrar venta + cerrar/reducir posición
│   │   │   └── history/          # GET: historial de operaciones cerradas + ROI agregado
│   │   ├── market/top-gainers/   # GET: top movers Finnhub
│   │   ├── macro/flash/          # GET: contexto macro (caché 4h)
│   │   ├── search/               # GET: búsqueda de tickers
│   │   └── user/                 # GET/PATCH perfil, contraseña, risk profile
│   ├── dashboard/                # Panel principal
│   │   ├── page.tsx              # Home: resumen + lista de acciones
│   │   ├── [ticker]/page.tsx     # Detalle: análisis, métricas, noticias, P&L
│   │   ├── simulation/page.tsx   # Monte Carlo + stress tests
│   │   ├── risk-profile/page.tsx # Cuestionario + resultado de perfil
│   │   ├── settings/page.tsx     # Ajustes de cuenta
│   │   └── help/page.tsx         # Documentación de uso
│   └── (auth)/                   # Login + registro
├── services/                     # Lógica de negocio
│   ├── analysisOrchestrator.ts   # Pipeline principal multi-fase
│   ├── aiAnalysisService.ts      # Análisis multi-horizonte + batch Gemini
│   ├── technicalAnalysisService.ts # SMA, RSI, RSISeries, ATR, RelVol, Hurst, divergencia precio/RSI
│   ├── newsAnalysisService.ts    # Sentimiento batch de noticias
│   ├── marketDataService.ts      # Precio actual e histórico
│   ├── macroService.ts           # Contexto macro global (caché Supabase)
│   ├── earningsService.ts        # Guidance de earnings (caché 30d)
│   ├── quantitativeService.ts    # Sharpe, Kelly, GARCH, correlaciones, Fear&Greed, PEG Lynch
│   ├── portfolioService.ts       # executeSell (motor de ventas), getClosedPerformance (ROI)
│   └── portfolioAIService.ts     # Análisis global de cartera
├── repositories/                 # Acceso a Prisma/PostgreSQL
│   ├── stockRepository.ts
│   ├── analysisRepository.ts
│   ├── analysisHistoryRepository.ts
│   ├── portfolioAnalysisRepository.ts
│   └── closedOperationRepository.ts  # CRUD de operaciones de venta cerradas
├── lib/                          # Clientes externos y utilidades
│   ├── geminiClient.ts           # Google Gemini (JSON mode, retries, STATIC_SYSTEM_INSTRUCTION)
│   ├── withTimeout.ts            # Promise.race wrapper con clearTimeout en .finally()
│   ├── cronAuth.ts               # validateCronSecret (timingSafeEqual), isCronAuthorized
│   ├── finnhubClient.ts          # Cotizaciones en tiempo real
│   ├── yahooFinanceClient.ts     # Candles históricos + fundamentales
│   ├── newsApiClient.ts          # Artículos de noticias
│   ├── portfolioMath.ts          # @deprecated — re-exporta src/lib/math/* (retrocompatibilidad)
│   ├── math/                     # Módulos matemáticos por responsabilidad
│   │   ├── index.ts              # Re-exporta todos los módulos
│   │   ├── returns.ts            # dailyReturns
│   │   ├── correlation.ts        # pearson, calculateCorrelationMatrix
│   │   ├── riskMetrics.ts        # (reservado: sharpe, kelly, garch)
│   │   ├── taxHarvesting.ts      # detectHarvestOpportunities, ETF alternativos
│   │   ├── optimization/
│   │   │   ├── markowitz.ts      # runPortfolioOptimization, shrinkCovariance, gradiente
│   │   │   └── blackLitterman.ts # runBlackLitterman, fallback a markowitz
│   │   └── simulation/
│   │       ├── monteCarlo.ts     # runMonteCarlo, sampleStudentT (t df=5 por defecto), VaR95, CVaR95
│   │       └── stressTest.ts     # runStressTests, 5 escenarios históricos
│   ├── cacheStore.ts             # Caché Supabase con fallback en memoria
│   ├── auth.ts                   # authOptions (NextAuth)
│   └── prisma.ts                 # Singleton Prisma Client
└── components/
    ├── dashboard/
    │   ├── StockCard.tsx         # Tarjeta: precio, escenario, métricas, alertas
    │   ├── AddStockForm.tsx      # Input de ticker con autocompletado
    │   ├── UpdateButton.tsx      # Botón de actualización con feedback detallado
    │   ├── StockUpdateMenu.tsx   # Actualización parcial por tipo (precio/técnicos/noticias)
    │   ├── CorrelationMatrix.tsx # Heatmap de correlaciones con leyenda de colores
    │   ├── TaxHarvestingPanel.tsx # Pérdidas latentes + ETF sugeridos por sector
    │   ├── PortfolioSummary.tsx  # Resumen total: valor, P&L, allocación
    │   ├── PortfolioBenchmark.tsx # Rendimiento vs benchmark
    │   ├── PortfolioAIInsights.tsx # Análisis global generado por IA
    │   ├── PriceChart.tsx        # Gráfico de precios históricos
    │   ├── TopMovers.tsx         # Gainers/losers del mercado en tiempo real
    │   ├── HorizonSelector.tsx   # Selector de horizonte de inversión por acción
    │   ├── PurchaseDataEditor.tsx # Editor de precio/fecha/cantidad de compra
    │   ├── RiskProfileBadge.tsx  # Badge visual del perfil de riesgo
    │   └── RegeneratePortfolioButton.tsx # Regenera análisis global sin re-fetch de mercado
    └── ui/                       # Componentes genéricos (Disclaimer, etc.)
```

### Pipeline de análisis

Cada llamada a API externa está envuelta con `withTimeout`. Si una fuente falla, el análisis continúa con datos parciales (`DataQuality.degraded = true`) y Gemini reduce automáticamente el `confidenceScore`.

```
Usuario pulsa "Actualizar"
        │
        ├─ Phase 1: Freshness check (caché 4h por acción)
        │   └─ Acciones con análisis reciente → skipped
        │
        ├─ Phase 2: Market data — Promise.allSettled por acción (timeouts individuales)
        │   ├─ withTimeout(getCurrentQuote(),      3s)  ←─ Finnhub
        │   ├─ withTimeout(getHistoricalCloses(),  8s)  ←─ Yahoo Finance (60d OHLCV)
        │   └─ withTimeout(fetchAllFundamentals(), 6s)  ←─ Yahoo quoteSummary
        │   → Fallo parcial: fallback a precio/datos vacíos, DataQuality.degraded=true
        │
        ├─ Phase 2b: Quant metrics (sobre datos de Phase 2)
        │   └─ calculatePortfolioQuantMetrics()  Sharpe, Kelly, GARCH, correlaciones
        │
        ├─ Phase 2c+3a: PARALELO — fuentes independientes
        │   ├─ withTimeout(getGlobalContext(),              12s)  ←─ NewsAPI+Gemini (caché 4h)
        │   └─ withTimeout(fetchAllArticlesInParallel(),   10s)  ←─ NewsAPI batch
        │
        ├─ Phase 3b: PARALELO — sentimiento (depende artículos) + earnings (caché 30d)
        │   ├─ batchAnalyzeSentiment()                  ←─ 1 llamada Gemini para N acciones
        │   └─ withTimeout(fetchAllEarningsGuidance(),   8s)  ←─ Gemini (caché 30d)
        │
        ├─ Phase 4: Batch AI — ceil(N/4) llamadas Gemini (timeout 25s × N)
        │   └─ batchGenerateAllHorizons()
        │       Mensaje usuario: JSON { ctx:{macro,earnings,risk}, stocks:[...], schema:{...} }
        │       systemInstruction: STATIC (singleton, cacheable por Gemini KV)
        │       shortTerm + mediumTerm + longTerm por acción · validación Zod
        │
        └─ Phase 5: Persistencia (paralelo)
            ├─ upsertAnalysis()            ──► PostgreSQL (Supabase)
            └─ insertSnapshot()            ──► StockAnalysisHistory
```

---

## Schema de base de datos

```
User
  id · email (unique) · password (bcrypt) · name? · createdAt · updatedAt
  → UserProfile (1:1) · Stock[] · PortfolioAnalysis (1:1)

UserProfile
  id · userId → User (unique)
  riskScore (0–36) · riskLabel (Conservador|Moderado|Agresivo)
  answers (JSON) · updatedAt

Stock
  id · ticker · userId → User · investmentHorizon (SHORT|MEDIUM|LONG_TERM)
  purchasePrice? · purchaseDate? · quantity? · createdAt
  Unique: (ticker, userId)
  → StockAnalysis (1:1) · StockAnalysisHistory[]

StockAnalysis
  id · stockId → Stock (unique)
  price · changePercent · sma20? · sma50? · rsi14?
  newsSummary · newsSentiment
  analysisText · scenarioLabel · scenarioJustification
  divergenceAlert? (JSONB — PriceRsiDivergence: type · strength · description)
  horizonMatch? · keyMetrics? (JSON) · metricsData? (JSON) · allHorizons? (JSON)
  generatedAt · updatedAt (@updatedAt — auto)

StockAnalysisHistory
  id · stockId → Stock
  snapshotAt · price · changePercent · scenarioLabel · horizonUsed · rsi14?
  Index: (stockId, snapshotAt DESC)

ClosedOperation
  id (UUID) · stockId → Stock (CASCADE) · ticker
  shares · buyPrice · sellPrice
  investedAmount (shares×buyPrice) · revenueAmount (shares×sellPrice)
  profitAmount (revenue−invested) · profitPercentage ((profit/invested)×100)
  closedAt (@default now)
  Index: (stockId, closedAt DESC)

PortfolioAnalysis
  id · userId → User (unique)
  analysisJson · stockCount · updatedAt

CacheEntry
  key (PK)  — e.g. "macro::global", "earnings::AAPL::Q2 2025"
  value (JSON) · expiresAt · updatedAt (@updatedAt — auto)
```

---

## Variables de entorno

```bash
# Base de datos — Supabase / PostgreSQL
DATABASE_URL="postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://USER:PASS@HOST:5432/postgres"

# Autenticación — NextAuth
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
NEXTAUTH_URL="https://tu-dominio.vercel.app"    # http://localhost:3000 en desarrollo

# APIs externas
FINNHUB_API_KEY="tu-finnhub-key"                # Cotizaciones + market movers
NEWS_API_KEY="tu-newsapi-key"                   # Noticias de acciones y macro
GEMINI_API_KEY="tu-gemini-key"                  # Google AI Studio — Gemini 2.5 Flash Lite

# Cron job
CRON_SECRET="$(openssl rand -hex 32)"           # Valida cabecera Authorization en /api/cron

# Opcional
RISK_FREE_RATE_ANNUAL="0.035"                   # Tasa libre de riesgo para Sharpe/Kelly (default 3.5%)
```

---

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# 3. Aplicar migraciones de base de datos (requiere DIRECT_URL con puerto 5432)
npx prisma migrate deploy

# 4. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Tests

```bash
# Tests unitarios e integración (Vitest)
npm run test

# Cobertura
npm run test:coverage

# Tests E2E (requiere servidor activo en puerto 3000)
npx playwright test
```

---

## Despliegue

La aplicación se despliega automáticamente en Vercel al hacer push a `main`.

El cron job `/api/cron/daily-update` se ejecuta **lunes–viernes a las 08:00 UTC** según `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/daily-update", "schedule": "0 8 * * 1-5" }]
}
```

---

## Aviso legal

Este proyecto es de uso académico y educativo. Los análisis, señales y proyecciones generados por IA son meramente informativos y **no constituyen asesoramiento financiero personalizado**. No se recomienda tomar decisiones de inversión basándose en los datos de esta aplicación.
