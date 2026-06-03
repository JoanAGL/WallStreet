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
- **Tax Harvesting** — Panel en el dashboard con dos secciones diferenciadas para el año fiscal en curso: (1) **Pérdidas confirmadas** — ventas ya ejecutadas con pérdida (`profitAmount < 0`), deducibles sin ninguna acción adicional, con badge "Confirmada" y total compensable; (2) **Pérdidas latentes realizables** — posiciones abiertas con pérdida > $100 y alternativa ETF por sector sugerida (QQQ para tech, XLF para finanzas, XLE para energía, etc.). Si existen ambas, muestra el potencial total combinado. Las posiciones con precio $0 o quantity ≤ 0 se excluyen del cálculo para evitar falsas alertas. Incluye referencia al art. 33 LIRPF (prohibición de recompra en 2 meses)
- **Rebalanceo de cartera** — Calcula trades necesarios para alcanzar pesos objetivo con detección de oportunidades de tax harvesting integrada

### Perfil de riesgo
- **Cuestionario de 12 preguntas** — Escala Likert 0–3, puntuación total 0–36
- **Clasificación automática** — Conservador (<12) / Moderado (12–24) / Agresivo (>24)
- **Inyección en análisis IA** — El perfil del inversor se incluye en cada llamada a Gemini como contexto de aversión al riesgo

### Gestión de cartera
- **Hasta 20 acciones** — NYSE y NASDAQ, validadas en tiempo real contra Yahoo Finance antes de añadir. Con batch de 4, 20 acciones = 5 llamadas Gemini (~185s en el peor caso; requiere Vercel Pro o superior para el cron)
- **Soporte multi-divisa (EUR/USD)** — Las acciones europeas (SAB.MC, NOVO-B.CO, etc.) detectan automáticamente su divisa nativa vía `meta.currency` de Yahoo Finance. El precio se almacena en EUR/GBP/etc. en `StockAnalysis.price` y se convierte a USD en `priceUSD` usando el tipo de cambio en tiempo real (EURUSD=X). El `StockCard` muestra `€X.XX (~$X.XX)` para acciones europeas. `PortfolioSummary` y `TaxHarvestingPanel` usan `priceUSD` para que el valor agregado de cartera y las pérdidas latentes estén siempre en USD, independientemente de la divisa de cotización
- **P&L por posición** — Precio de compra, cantidad, fecha, coste base, valor actual, ganancia/pérdida en USD y %
- **Historial de análisis** — Snapshots automáticos (escenario, RSI, precio) con retención de 30 días e índice DESC por fecha
- **Análisis global de cartera** — Resumen IA de diversificación, riesgo agregado y recomendaciones de rebalanceo (mínimo 2 acciones con análisis)
- **Benchmark de cartera** — Comparación de rendimiento vs índice de referencia
- **Exportación CSV** — `GET /api/portfolio/export?format=csv` descarga un CSV con 34 campos por acción: precio, cambio %, escenario activo, confidenceScore, indicadores técnicos (RSI14, SMA20/50, ATR14, volumen relativo), escenarios por horizonte (corto/medio/largo plazo), divergencia precio/RSI, datos de posición (precio compra, cantidad, coste base, valor actual, P&L en USD y %), y timestamp de generación. Requiere sesión autenticada; solo exporta datos del usuario en sesión. Botón «↓ CSV» en el resumen de cartera
- **Sistema de transacciones (WAC)** — Motor completo de registro de compras y ventas por posición usando el método de Coste Medio Ponderado (Weighted Average Cost). Cada transacción almacena: tipo (BUY/SELL), acciones, precio, fecha (opcional) y notas (opcional). El servicio calcula en tiempo real: precio medio WAC dinámico (recalculado con cada BUY en orden cronológico), precio medio de venta, coste base abierto, valor actual, PnL no realizado ($ y %), PnL realizado ($ y %), precio de equilibrio, días en cartera (desde primera transacción), rentabilidad anualizada CAGR y peso en cartera (%). API: `POST /api/portfolio/transactions` (registrar BUY/SELL), `GET /api/portfolio/transactions?stockId=xxx&currentPrice=yyy` (métricas completas), `PATCH /api/portfolio/transactions/[id]` (editar transacción), `DELETE /api/portfolio/transactions/[id]` (eliminar). Panel «Transacciones» plegable en cada StockCard con formulario inline (BUY/SELL toggle), métricas compactas y lista de operaciones con edición y eliminación
- **Historial de ventas** — `/dashboard/history` muestra cada transacción SELL ejecutada con el precio medio WAC en el momento de la venta, precio de venta, profit en $ y %, capital invertido y recaudado por operación. `getTransactionHistory()` en `transactionService` recalcula el WAC cronológico para cada venta y extrae el profit individual real. Fusiona automáticamente entradas de `Transaction` (origen `"transaction"`) con entradas manuales de `ManualSellEntry` (origen `"manual"`), ordenadas por fecha descendente. Cada entrada se puede eliminar individualmente; las de tipo `transaction` recalculan el WAC automáticamente. Agrega capital total invertido, recaudado, profit absoluto y ROI global
- **Ventas históricas manuales** — Formulario en `/dashboard/history` para registrar posiciones compradas y vendidas antes de usar el sistema: ticker libre (no necesita estar en el dashboard), número de acciones, precio medio de compra, precio de venta, fecha y notas opcionales. Preview en tiempo real de invertido / recaudado / profit / ROI antes de guardar. Almacenadas en `ManualSellEntry` con relación directa a `User` (sin Stock). API: `POST /api/portfolio/history/manual` y `DELETE /api/portfolio/history/manual/[id]`. Aparecen en el historial con badge «manual» para distinguirlas de las que vienen del TransactionPanel
- **Vista global de rendimiento** — `/dashboard/portfolio` muestra todas las posiciones con transacciones, agregados globales (valor actual total, coste base total, PnL no realizado + %, PnL realizado, PnL total) y detalle por posición con todas las métricas; accesible desde «Rendimiento →» en el resumen de cartera
- **P&L en resumen de cartera** — `PortfolioSummary` muestra tres métricas P&L en el dashboard principal: **No realizado** (posiciones abiertas: valor actual − coste base WAC, con %), **Realizado** (beneficios de ventas ejecutadas, sumado desde `getPortfolioMetrics`) y **Total combinado** (suma de ambos, con %). Realizado y Total solo aparecen cuando hay operaciones cerradas
- **Gestión de posiciones cerradas** — stocks con `quantity = 0` (totalmente vendidos, importados de DEGIRO) se excluyen del dashboard activo y aparecen en un bloque colapsable "Posiciones cerradas (N) ▼" al final. El botón "Actualizar datos" no lanza análisis IA ni NewsAPI en posiciones cerradas (evita consumo de API innecesario)
- **Limpiar cartera** — en Ajustes → "Limpiar cartera", borrado completo de stocks, transacciones, ventas manuales y análisis IA sin eliminar la cuenta. Requiere escribir `LIMPIAR` para confirmar. `DELETE /api/portfolio/reset` en cascada: `ManualSellEntry` → `PortfolioAnalysis` → `Stock` (que arrastra `Transaction`, `StockAnalysis`, `StockAnalysisHistory`, `ClosedOperation`)
- **Registro de último acceso** — `User.lastLogin DateTime?` se actualiza en cada login exitoso vía `prisma.user.update` fire-and-forget en el callback `authorize` de NextAuth (no bloquea la respuesta de autenticación)

### Módulo de Importación Masiva (DEGIRO por ISIN)

Importa automáticamente el historial completo de transacciones desde el broker DEGIRO sin introducción manual de datos. Los tickers se resuelven dinámicamente desde Yahoo Finance usando el ISIN como clave maestra — nunca se procesa el texto del campo `Producto`.

**Flujo de importación:**
1. Exportar desde DEGIRO → Actividad → Transacciones (rango libre) como `.csv`
2. Arrastrar el archivo a `/dashboard/import` o seleccionarlo con el selector
3. El servidor procesa el CSV, resuelve tickers vía Yahoo Finance y actualiza el WAC

**Parser CSV ultra-defensivo:**
- **BOM** — elimina el Byte Order Mark UTF-8 del inicio del archivo
- **Cabeceras vacías** — el patrón `Precio,,Valor local,,Valor EUR` (columnas de divisa sin nombre) se filtra al construir el mapa de columnas
- **Decimales europeos** — `"209,5000"` → `.replace(',', '.')` antes de `parseFloat`
- **Orden inverso** — DEGIRO exporta del más nuevo al más antiguo; el importer invierte el array para procesar en orden cronológico real (necesario para que el WAC sea correcto)
- **Ejecuciones parciales** — DEGIRO divide órdenes grandes en múltiples filas con el mismo ID Orden y distintos centros de ejecución. El importer agrupa por `orderId|isin|tipo` y fusiona: `shares = Σ|numero_i|`, `precio = WAC ponderado en USD`. Las filas sin ID Orden se procesan individualmente
- **Conversión EUR → USD** — lee la divisa del precio desde la columna sin nombre en `col["precio"] + 1` y el tipo de cambio desde la columna `Tipo de cambio`. La conversión `precio × fxRate` ocurre en tiempo de parsing, antes de la fusión de ejecuciones parciales
- **Deduplicación** — carga todas las transacciones existentes en un `Set` en memoria; las filas que ya existen en la BD (mismo stock, tipo, acciones, precio, fecha) se omiten → seguro reimportar el mismo archivo varias veces

**Resolución de tickers por ISIN:**
- Para cada ISIN único: `GET https://query2.finance.yahoo.com/v1/finance/search?q={ISIN}` con headers `User-Agent`
- Preferencia: resultados `EQUITY` o `ETF`; devuelve `symbol` (ticker oficial) y `longname`
- Timeout de 4 s por ISIN (AbortController + clearTimeout en finally)
- Lotes de 8 ISINs en paralelo con pausa de 100 ms entre lotes (~15 ISINs ≈ 2 lotes ≈ 1-2 s total)
- ISINs no resueltos: fallback al campo `Producto` limpio (primeros 8 chars alfanuméricos); reportados en `isinsFailed[]` de la respuesta

**Campos añadidos al modelo `Stock`:**
- `isin String?` — identificador ISIN para deduplicación entre brokers/mercados
- `name String?` — nombre completo del producto (ej. `"Apple Inc"`, `"iShares Core MSCI World..."`)

**API:** `POST /api/portfolio/import/degiro` — recibe `FormData` con campo `file` (CSV ≤ 10 MB). Devuelve `{ imported, skipped, stocksCreated, isinsFailed }`. `maxDuration = 300` (efectivo en Vercel Pro; Hobby tiene hard-cap de 10 s).

### Motor de Psicología Financiera e Insights de Inversión

Dashboard analítico en `/dashboard/insights` que evalúa la calidad histórica de las decisiones de inversión mediante métricas de comportamiento financiero calculadas sobre el historial de transacciones.

**Métricas calculadas (`src/services/decisionAnalysisService.ts`):**

| Métrica | Descripción | Señal de sesgo |
|---------|-------------|----------------|
| **Efecto Disposición** | Días medios de retención en posiciones ganadoras vs perdedoras | Sesgo si `avgDaysLosers > avgDaysWinners × 1.3` con ≥ 2 operaciones de cada tipo |
| **Profit Factor** | Σganancias cerradas / Σpérdidas cerradas | ≥ 2 = excelente · 1–2 = positivo · < 1 = pérdidas > ganancias |
| **Ventas Prematuras** | Precio de venta histórico vs precio actual de mercado (Yahoo Finance live) | Alerta si el activo ha subido > 10% desde la venta y < 5× (ratio > 5× descartado = ticker erróneo) |
| **Benchmark S&P 500** | Simula qué habría rendido en SPY el mismo capital invertido en cada operación cerrada | Alpha = retorno cartera − retorno SPY simulado |

**Cálculo del Benchmark S&P 500:**
- Para cada operación cerrada (`trade`): `investedUSD = trade.avgCost × trade.shares` (capital real arriesgado), `entryDate = trade.firstBuyDate`
- Simula: `spyShares = investedUSD / SPY_price(entryDate)` → `value_today = spyShares × SPY_NOW`
- `SPY_NOW` se obtiene en cada llamada vía `fetchCurrentPrice("SPY")` con fallback a tabla histórica interpolada (precios reales SPY 2014-2026)
- Solo usa operaciones cerradas (excluye posiciones abiertas) → "Capital analizado" = capital efectivamente comprado y vendido

**API:** `GET /api/portfolio/insights/decisions` — análisis completo de sesgos en JSON. `maxDuration = 30`.

### Diseño visual

Tema oscuro fintech inspirado en MyInvestor / DeGiro, implementado mediante un design system con tokens CSS y estilos inline semánticos.

**Paleta de superficies (cuatro capas de profundidad):**

| Layer | Token CSS | Hex | Uso |
|---|---|---|---|
| Shell | `--background` | `#2A3348` | fondo de página |
| Header | `--header-bg` | `#1B2130` | barra sticky superior |
| Card | `--card-bg` | `#344059` | tarjetas primarias |
| Inner | `--card-inner` | `#3B4967` | paneles anidados, inputs, MetricBox |
| Raised | `--card-raised` | `#435474` | hover fills |

**Tokens semánticos de color** — señales financieras siempre por RGBA para funcionar sobre cualquier superficie:

| Señal | Token | Color |
|---|---|---|
| Positivo / COMPRA | `--pos-bg / --pos-bd` | `rgba(16,163,74,...)` |
| Negativo / VENTA | `--neg-bg / --neg-bd` | `rgba(239,68,68,...)` |
| Alerta / REDUCIR | `--warn-bg / --warn-bd` | `rgba(245,158,11,...)` |
| Información | `--info-bg / --info-bd` | `rgba(37,99,235,...)` |

**Rampa de texto:** `--fg-1` (#F1F5F9) → `--fg-5` (#7A8BA0) para titulares, cuerpo, labels y metadatos respectivamente.

**Componentes con estilos inline semánticos** (no dependen de las clases Tailwind remapeadas):
- Banners de escenario Positivo/Neutral/Negativo — RGBA verde/amber/rojo
- Badges de divergencia precio/RSI — RGBA rojo/verde según tipo bearish/bullish
- `RiskBadge` — semi-transparente verde/amber/rojo con texto claro (`#4ADE80`/`#FCD34D`/`#F87171`)
- `HorizonSelector` — activo: `rgba(37,99,235,.18)` + `#93C5FD`; inactivo: `var(--card-inner)`
- `CorrelationMatrix` — celdas con colores sólidos data-viz (`#DCFCE7`/`#FEF9C3`/`#FECACA`) y texto oscuro legible
- `PortfolioSummary` — borde y fondo del contenedor dinámico según sesgo alcista/bajista de la cartera
- `TopMovers` — badge de ganancia `rgba(16,163,74,.12)` + `#4ADE80`
- `Disclaimer` — estilo muted ℹ info en `var(--card-inner)`

**Tipografía:** Inter via `next/font/google`, antialiased. Escala conservadora (máx. `text-2xl` para precio); jerarquía por peso + color, no por tamaño. Eyebrows en `uppercase + tracking-wide`.

**Sin dark-mode automático** — estilos fijos para consistencia visual independientemente de la preferencia del sistema.

### Actualización de datos
- **Actualización manual** — Botón en dashboard con rate-limit de 5 min (completo) / 1 min (por ticker); muestra resultado: actualizadas · en caché · con error (tickers afectados). Excluye automáticamente posiciones cerradas (`quantity = 0`) del análisis IA y noticias
- **Actualización parcial** — Tipos configurables: `price`, `news`, `technicals`, `ai`, `portfolio`; se pueden combinar en el body de `POST /api/update`
- **Cron job diario** — Lunes–viernes a las 08:00 UTC (antes de la apertura de Wall Street a las 14:30 UTC), ejecutado por Vercel Cron (`0 8 * * 1-5`)
- **Procesado en batch** — Grupos de hasta 4 acciones por llamada Gemini para minimizar latencia y consumo de API

### Resiliencia y seguridad
- **Timeouts por servicio** — Cada llamada externa usa `withTimeout`: Finnhub quote 3s, Yahoo histórico 8s, Yahoo fundamentals 6s, NewsAPI por acción 5s (batch 10s), Gemini por acción 25s, Gemini portfolio 30s
- **Degradación graceful** — Si una fuente falla (timeout o error de red), el análisis continúa con datos parciales en lugar de abortar el stock completo; `DataQuality { technical, fundamentals, news, degraded }` advierte a Gemini cuando los datos son incompletos
- **Paralelismo en el pipeline** — Fetch de macro y artículos de noticias se lanzan en paralelo (independientes); sentimiento batch y earnings también en paralelo (tras recibir artículos)
- **Validación CRON_SECRET resistente a timing attacks** — `crypto.timingSafeEqual` + SHA-256 en ambos lados; la comparación tarda tiempo constante independientemente del secreto enviado
- **System instruction estática** — `STATIC_SYSTEM_INSTRUCTION` se define una vez a nivel de módulo; el contexto dinámico (macro, earnings, riskProfile) va en el mensaje de usuario como JSON compacto, permitiendo que el prefijo del sistema se almacene en la caché KV implícita de Gemini y reduciendo el coste de tokens de entrada en cada llamada batch
- **Row-Level Security (RLS)** — Todas las tablas del esquema público en Supabase tienen RLS habilitado (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). Esto bloquea el acceso anónimo vía la API REST de Supabase (rol `anon`/`authenticated`) sin afectar a Prisma, que conecta directamente con PostgreSQL usando `service_role` (bypasea RLS por diseño)

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | Next.js (App Router) + TypeScript | 14.2.35 / 5 |
| UI | Tailwind CSS + Inter (next/font) | 3.3.0 |
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
│   │   ├── stocks/               # GET/POST: listar y añadir acciones
│   │   │   └── [ticker]/         # DELETE: eliminar acción por ticker
│   │   ├── update/               # POST: actualización manual (tipos: price|news|technicals|ai|portfolio)
│   │   ├── cron/daily-update/    # POST: cron job Vercel (L–V 08:00 UTC)
│   │   ├── portfolio/
│   │   │   ├── correlation/      # GET: matriz de correlación
│   │   │   ├── optimize/         # GET: Black-Litterman
│   │   │   ├── rebalance/        # POST: rebalanceo + tax harvesting
│   │   │   ├── simulate/         # POST: Monte Carlo + stress tests
│   │   │   ├── export/           # GET: exportación CSV de cartera (?format=csv)
│   │   │   ├── sell/             # POST: registrar venta (legado)
│   │   │   ├── history/          # GET: historial de ventas paginado
│   │   │   │   └── manual/       # POST: nueva venta histórica manual
│   │   │   │       └── [id]/     # DELETE: eliminar venta histórica manual
│   │   │   ├── import/
│   │   │   │   └── degiro/       # POST: importar CSV DEGIRO (FormData, maxDuration=300)
│   │   │   ├── insights/
│   │   │   │   └── decisions/    # GET: análisis de sesgos psicológicos (maxDuration=30)
│   │   │   ├── reset/            # DELETE: limpiar toda la cartera (sin borrar cuenta)
│   │   │   ├── transactions/     # GET+POST: métricas WAC + registrar BUY/SELL
│   │   │   └── transactions/[id] # PATCH+DELETE: editar/eliminar transacción
│   │   ├── market/top-gainers/   # GET: top movers Finnhub
│   │   ├── macro/flash/          # GET: contexto macro (caché 4h)
│   │   ├── search/               # GET: búsqueda de tickers Yahoo Finance
│   │   └── user/                 # GET/DELETE cuenta
│   │       ├── profile/          # PATCH: nombre de usuario
│   │       ├── password/         # PATCH: cambiar contraseña
│   │       └── risk-profile/     # GET/POST: cuestionario de riesgo
│   ├── dashboard/                # Panel principal
│   │   ├── page.tsx              # Home: resumen + P&L no real./real./total + lista de acciones
│   │   ├── [ticker]/page.tsx     # Detalle: análisis, métricas, noticias, P&L
│   │   ├── portfolio/page.tsx    # Vista global: todas las posiciones con WAC y métricas agregadas
│   │   ├── history/page.tsx      # Historial de ventas WAC + ventas manuales + AddManualSellForm
│   │   ├── simulation/page.tsx   # Monte Carlo + stress tests
│   │   ├── risk-profile/page.tsx # Cuestionario + resultado de perfil
│   │   ├── settings/page.tsx     # Ajustes (perfil, contraseña, limpiar cartera, eliminar cuenta)
│   │   ├── help/page.tsx         # Documentación de uso
│   │   ├── import/page.tsx       # Drag & Drop importación CSV DEGIRO
│   │   └── insights/page.tsx     # Dashboard de sesgos y análisis de decisiones
│   └── (auth)/                   # Login + registro
├── services/                     # Lógica de negocio
│   ├── importService.ts          # Parser CSV DEGIRO: BOM, ejecuciones parciales, EUR→USD,
│   │                             #   resolución ISIN→ticker via Yahoo Finance, createMany sin tx
│   ├── decisionAnalysisService.ts# Sesgos: efecto disposición, profit factor, ventas prematuras,
│   │                             #   benchmark S&P 500 (SPY live + histórico interpolado)
│   ├── analysisOrchestrator.ts   # Pipeline principal multi-fase
│   ├── aiAnalysisService.ts      # Análisis multi-horizonte + batch Gemini
│   ├── technicalAnalysisService.ts # SMA, RSI, RSISeries, ATR, RelVol, Hurst, divergencia precio/RSI
│   ├── newsAnalysisService.ts    # Sentimiento batch de noticias
│   ├── marketDataService.ts      # Precio actual e histórico
│   ├── macroService.ts           # Contexto macro global (caché Supabase)
│   ├── earningsService.ts        # Guidance de earnings (caché 30d)
│   ├── quantitativeService.ts    # Sharpe, Kelly, GARCH, correlaciones, Fear&Greed, PEG Lynch
│   ├── stockService.ts           # Validación de ticker contra Yahoo Finance antes de añadir
│   ├── portfolioService.ts       # executeSell (motor de ventas legado), getClosedPerformance
│   ├── transactionService.ts     # WAC engine: calculatePositionMetrics, addTransaction,
│   │                             #   getPortfolioMetrics, getTransactionHistory (merge WAC+manual)
│   └── portfolioAIService.ts     # Análisis global de cartera
├── repositories/                 # Acceso a Prisma/PostgreSQL
│   ├── stockRepository.ts
│   ├── analysisRepository.ts
│   ├── analysisHistoryRepository.ts
│   ├── portfolioAnalysisRepository.ts
│   ├── closedOperationRepository.ts  # CRUD de operaciones de venta cerradas (legado)
│   ├── transactionRepository.ts      # CRUD de transacciones BUY/SELL
│   └── manualSellRepository.ts       # CRUD de ManualSellEntry (ventas históricas manuales)
├── lib/                          # Clientes externos y utilidades
│   ├── geminiClient.ts           # Google Gemini (JSON mode, retries, STATIC_SYSTEM_INSTRUCTION)
│   ├── withTimeout.ts            # Promise.race wrapper con clearTimeout en .finally()
│   ├── cronAuth.ts               # validateCronSecret (timingSafeEqual), isCronAuthorized
│   ├── finnhubClient.ts          # Cotizaciones en tiempo real
│   ├── yahooFinanceClient.ts     # Candles históricos + fundamentales + validateTickerExists
│   ├── newsApiClient.ts          # Artículos de noticias
│   ├── riskCalculator.ts         # Cálculo de score de riesgo desde respuestas del cuestionario
│   ├── circuitBreaker.ts         # Circuit breaker para llamadas a APIs externas
│   ├── portfolioMath.ts          # @deprecated — re-exporta src/lib/math/* (retrocompatibilidad)
│   ├── math/                     # Módulos matemáticos por responsabilidad
│   │   ├── index.ts              # Re-exporta todos los módulos
│   │   ├── returns.ts            # dailyReturns
│   │   ├── correlation.ts        # pearson, calculateCorrelationMatrix
│   │   ├── riskMetrics.ts        # (reservado: sharpe, kelly, garch)
│   │   ├── taxHarvesting.ts      # detectHarvestOpportunities (umbral $100, excluye precio=0 y qty≤0)
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
    │   ├── StockCard.tsx              # Tarjeta: precio, escenario, métricas, alertas (DS inline)
    │   ├── TransactionPanel.tsx       # Panel plegable BUY/SELL WAC por acción
    │   ├── AddManualSellForm.tsx      # Formulario venta histórica manual con preview live
    │   ├── DeleteTransactionButton.tsx# Botón eliminar genérico (prop deleteUrl)
    │   ├── ClosedStocksSection.tsx    # Bloque colapsable posiciones cerradas (quantity=0)
    │   ├── AddStockForm.tsx           # Input de ticker con autocompletado + validación Yahoo
    │   ├── UpdateButton.tsx           # Botón de actualización con feedback detallado
    │   ├── StockUpdateMenu.tsx        # Actualización parcial por tipo
    │   ├── CorrelationMatrix.tsx      # Heatmap celdas sólidas data-viz + inline styles DS
    │   ├── TaxHarvestingPanel.tsx     # Pérdidas confirmadas año fiscal + latentes (>$100) + ETF
    │   ├── PortfolioSummary.tsx       # P&L no real.+real.+total · advertencia precios ausentes
    │   ├── PortfolioBenchmark.tsx     # Rendimiento vs benchmark
    │   ├── PortfolioAIInsights.tsx    # Análisis global generado por IA
    │   ├── PriceChart.tsx             # Gráfico de precios históricos
    │   ├── TopMovers.tsx              # Gainers del mercado (badge RGBA verde)
    │   ├── HorizonSelector.tsx        # Selector horizonte (activo: RGBA azul + #93C5FD)
    │   ├── RiskProfileBadge.tsx       # Badge perfil de riesgo en header
    │   ├── LogoutButton.tsx           # Botón de cierre de sesión
    │   ├── RemoveStockButton.tsx      # Botón eliminar acción del dashboard
    │   └── RegeneratePortfolioButton.tsx # Regenerar análisis global de cartera
    └── ui/
        ├── RiskBadge.tsx              # Badge riesgo semi-transparente verde/amber/rojo
        └── Disclaimer.tsx             # Aviso legal muted ℹ
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

Transaction
  id (UUID) · stockId → Stock (CASCADE)
  type (BUY|SELL) · shares · price (avg per share)
  date? (optional acquisition/sale date) · notes? (free text)
  createdAt (@default now)
  Index: (stockId, createdAt DESC)

ManualSellEntry
  id (UUID) · userId → User (CASCADE, sin relación a Stock)
  ticker · shares · avgBuyPrice · sellPrice
  investedAmount · revenueAmount · profitAmount · profitPercentage
  date (@default now) · notes? · createdAt (@default now)
  Index: (userId, date DESC)
  — Permite registrar ventas históricas de posiciones no gestionadas en el dashboard

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
