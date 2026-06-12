# My Personal Advisor — Memoria del Trabajo Final de Bachelor (BORRADOR v0.2)

> **Estado del documento:** borrador extendido con el contenido de cada apartado
> redactado. Quedan por resolver los marcadores `[REVISAR]` (decisiones del autor)
> y `[FIGURA n]` (diagramas y capturas a insertar). Extensión estimada una vez
> maquetado: 45–60 páginas.

---

## Portada `[REVISAR: datos administrativos]`

- **Título:** My Personal Advisor: plataforma de análisis cuantitativo de carteras de inversión asistida por modelos generativos de lenguaje
- **Autor:** Joan Antoni González López
- **Titulación / Universidad:** `[REVISAR]`
- **Tutor/a:** `[REVISAR]`
- **Curso académico:** 2025–2026
- **Repositorio:** github.com/JoanAGL/WallStreet · **Demo:** wall-street-jan.vercel.app

---

## Resumen

Este trabajo presenta el diseño, implementación y validación de **My Personal
Advisor**, una plataforma web de análisis de carteras de inversión para el
inversor minorista. El sistema combina un motor cuantitativo determinista —
contabilidad de posiciones por coste medio ponderado, simulación de Monte Carlo
con colas pesadas, volatilidad condicional GARCH(1,1), optimización de carteras de
Markowitz y Black-Litterman, y rentabilidad ponderada por tiempo (TWR) — con un
modelo generativo de lenguaje (Google Gemini) que actúa como *sintetizador
acotado*: interpreta las métricas calculadas y las traduce a proyecciones
multi-horizonte explicadas en lenguaje natural, con salida validada contra esquema
para controlar la alucinación.

La plataforma importa el historial real de transacciones del bróker DEGIRO,
resuelve instrumentos por ISIN y gestiona cotizaciones multi-divisa con doble
fuente de datos. La validación se realizó mediante **reconciliación contable
iterativa contra una cartera real** de ~25 000 € con 18 meses de operativa, proceso
que destapó seis defectos no triviales de integración de datos financieros
(ejecuciones parciales duplicadas, conversión de divisa incorrecta, splits de
acciones sobre historiales ya ajustados, comisiones no importadas) que fueron
corregidos y cubiertos con tests de regresión. El sistema opera en producción
sobre infraestructura de coste cero o marginal, con integración y despliegue
continuos y una suite de más de 70 tests unitarios.

**Palabras clave:** análisis cuantitativo, gestión de carteras, LLM, Monte Carlo,
GARCH, Time-Weighted Return, Next.js, fintech.

## Abstract `[REVISAR: traducción final]`

This thesis presents the design, implementation and validation of **My Personal
Advisor**, a web platform for retail portfolio analysis. The system combines a
deterministic quantitative engine — weighted-average-cost position accounting,
fat-tailed Monte Carlo simulation, GARCH(1,1) conditional volatility, Markowitz
and Black-Litterman portfolio optimization, and time-weighted returns — with a
generative language model (Google Gemini) acting as a *bounded synthesizer* that
interprets pre-computed metrics into schema-validated, multi-horizon projections.
The platform imports real DEGIRO transaction history and was validated through
iterative accounting reconciliation against a real ~€25,000 portfolio, a process
that surfaced and fixed six non-trivial financial data-integration defects. The
system runs in production on zero-to-marginal-cost infrastructure with CI/CD and
70+ unit tests.

---

## Índice

1. Introducción
2. Estado del arte y fundamentos
3. Análisis y especificación de requisitos
4. Diseño y arquitectura del sistema
5. Motor cuantitativo
6. Pipeline de análisis con IA generativa
7. Integración de datos financieros reales
8. Seguridad y privacidad
9. Validación y resultados: caso de estudio con cartera real
10. Conclusiones y trabajo futuro
11. Bibliografía
12. Anexos

---

# 1. Introducción

## 1.1 Motivación

El acceso del inversor minorista a los mercados financieros se ha democratizado en
la última década: brókeres de bajo coste como DEGIRO permiten operar en bolsas de
medio mundo con comisiones de céntimos. Sin embargo, las **herramientas de
análisis** no han seguido el mismo camino. El minorista europeo se encuentra con
un panorama fragmentado:

- El bróker ofrece ejecución, pero un análisis pobre: posición, precio medio y
  poco más. Conceptos como la rentabilidad ponderada por tiempo, el valor en
  riesgo o la concentración por correlación están ausentes.
- Las plataformas profesionales (Bloomberg Terminal, FactSet) resuelven el
  problema, pero a un coste de decenas de miles de euros anuales.
- Los *robo-advisors* comerciales automatizan la gestión, pero funcionan como
  cajas negras: ni explican sus decisiones ni permiten analizar una cartera
  autogestionada existente.

En paralelo, los modelos generativos de lenguaje (LLM) han alcanzado la capacidad
de producir análisis textual contextualizado a un coste marginal cercano a cero.
Su aplicación ingenua a finanzas es, no obstante, peligrosa: un LLM al que se le
pregunta "¿cómo va mi cartera?" *alucina* cifras con la misma fluidez con la que
redacta. La oportunidad técnica que explora este trabajo es el patrón inverso:
**calcular todo de forma determinista y usar el LLM únicamente para interpretar y
comunicar**, acotando su salida con esquemas validados y anclas cuantitativas.

La pregunta que motiva el proyecto es: *¿puede un único desarrollador, con
servicios gratuitos o de bajo coste, construir una plataforma de análisis de
cartera con rigor cuantitativo verificable, datos reales de bróker y explicaciones
en lenguaje natural, con calidad suficiente para uso propio diario?*

## 1.2 Objetivos

**Objetivo general:** diseñar, implementar y validar una plataforma web de
análisis de carteras que integre un motor cuantitativo clásico con análisis
generativo acotado, alimentada por datos reales de bróker y mercado.

**Objetivos específicos:**

| ID | Objetivo | Criterio de éxito |
|----|----------|-------------------|
| O1 | Motor contable de posiciones (WAC) con ciclo de vida completo: compras, ventas, comisiones, dividendos y splits | Reconciliación con el bróker con diferencias < 1 % |
| O2 | Herramientas cuantitativas con base estadística documentada: Monte Carlo t-Student, GARCH(1,1), Hurst, VaR/CVaR, Markowitz, Black-Litterman, TWR | Cada métrica con fórmula trazable y test unitario |
| O3 | Pipeline LLM con salida acotada y trazable (sin cifras alucinadas) | 100 % de respuestas validadas contra esquema o degradadas a fallback explícito |
| O4 | Integración de datos reales: importación DEGIRO idempotente y cotizaciones multi-divisa tolerantes a fallos | Reimportación sin duplicados; ningún precio incorrecto persistido ante fallo de fuente |
| O5 | Validación contra cartera real en producción | Caso de estudio documentado (capítulo 9) |

## 1.3 Alcance y limitaciones

El sistema es de **uso académico e informativo** y así lo comunica de forma
permanente en la interfaz: los análisis generados no constituyen asesoramiento
financiero, conforme a la distinción regulatoria entre información y
recomendación personalizada (MiFID II). El alcance se limita a renta variable al
contado en mercados cubiertos por las fuentes de datos empleadas; quedan fuera
derivados, renta fija y la gestión de efectivo (esta última, identificada como
trabajo futuro). El límite de 20 valores activos por usuario responde al
presupuesto de tiempo de cómputo del plan de despliegue utilizado.

## 1.4 Estructura de la memoria

El capítulo 2 revisa los fundamentos teóricos y el estado del arte. El capítulo 3
especifica los requisitos. El capítulo 4 describe la arquitectura. Los capítulos 5
y 6 desarrollan los dos núcleos técnicos: el motor cuantitativo y el pipeline de
IA. El capítulo 7 aborda la integración de datos reales de bróker, y el 8 la
seguridad. El capítulo 9 presenta la validación mediante un caso de estudio con
una cartera real, y el 10 las conclusiones y líneas futuras.

---

# 2. Estado del arte y fundamentos

## 2.1 Teoría moderna de carteras

Markowitz (1952) formalizó la selección de carteras como un problema de
optimización media-varianza: para un vector de retornos esperados μ y una matriz
de covarianzas Σ, la cartera de mínima varianza resuelve

> min<sub>w</sub> wᵀΣw   s.a.  Σwᵢ = 1, wᵢ ≥ 0

La solución es notoriamente **inestable**: pequeños cambios en las estimaciones de
Σ producen pesos radicalmente distintos. Dos respuestas clásicas que este trabajo
implementa son (a) la **regularización por shrinkage** de Ledoit y Wolf (2004),
que contrae la covarianza muestral hacia un objetivo estructurado
(Σ* = αF + (1−α)S), y (b) el modelo de **Black-Litterman** (1992), que parte de un
prior de equilibrio de mercado y lo combina bayesianamente con "vistas" del
inversor sobre retornos esperados. La aportación particular de este trabajo es el
origen de esas vistas: se generan mediante un LLM a partir del contexto macro y
fundamental (§6), con confianzas acotadas, y el sistema degrada a Markowitz puro
si las vistas no superan la validación.

## 2.2 Modelado de riesgo

**Movimiento browniano geométrico (GBM).** El modelo canónico de precios,
dS = μS dt + σS dW, produce retornos log-normales. Su limitación empírica es
conocida desde Mandelbrot (1963): las colas de los retornos reales son más pesadas
que las gaussianas.

**Colas pesadas con t de Student.** Sustituir el shock gaussiano por una variable
t de Student con ν grados de libertad captura el exceso de curtosis. Un punto
técnico crítico — verificado empíricamente en este proyecto (§9.2, defecto D2) —
es que la t de Student con ν g.l. tiene varianza ν/(ν−2) ≠ 1, por lo que el shock
debe **reescalarse por √((ν−2)/ν)** para que la volatilidad realizada coincida
con la σ estimada; de lo contrario la corrección de Itô (−σ²/2) deja de
corresponder a la varianza real del proceso y toda la distribución simulada queda
sesgada a la baja.

**Volatilidad condicional.** El modelo GARCH(1,1) de Bollerslev (1986),
σ²ₜ = ω + α·r²ₜ₋₁ + β·σ²ₜ₋₁, captura el agrupamiento de volatilidad. Se emplea con
α = 0,09 y β = 0,90 (valores típicos en renta variable diaria) y se anualiza por
√252.

**Medidas de riesgo de cola.** El VaR al 95 % (pérdida no superada con
probabilidad 0,95) se complementa con el Expected Shortfall o CVaR (media de
pérdidas en el 5 % peor), medida coherente en el sentido de Artzner et al. (1999).

**Persistencia de series.** El exponente de Hurst, estimado por análisis de rango
reescalado (R/S), distingue series con tendencia (H > 0,5), reversión a la media
(H < 0,5) y paseo aleatorio (H ≈ 0,5). Este trabajo lo combina con RSI, volumen
relativo y GARCH en un clasificador de régimen de seis estados (§5.4).

## 2.3 Medidas de rentabilidad

La rentabilidad simple sobre el coste confunde habilidad inversora con calendario
de aportaciones. El estándar profesional (GIPS, CFA Institute) es el
**Time-Weighted Return**: la rentabilidad se trocea en subperíodos delimitados por
los flujos externos de capital y se encadena geométricamente,

> r<sub>i</sub> = (V<sub>i</sub> − F<sub>i</sub>) / V<sub>i−1</sub> − 1 ;  TWR = Π(1+r<sub>i</sub>) − 1

donde F<sub>i</sub> son los flujos netos del subperíodo. El TWR neutraliza el
efecto de aportar o retirar dinero: mide la gestión, no el tamaño de las
aportaciones. El CAGR por posición, en cambio, requiere computar la *riqueza
final completa* (valor abierto + ingresos por ventas + dividendos): omitir los
ingresos de ventas parciales produce CAGRs absurdamente negativos en posiciones
ganadoras, defecto real detectado durante la validación (§9.2, defecto D1).

## 2.4 Valoración fundamental heurística

Como ancla de convicción fundamental se emplea el ratio PEG popularizado por
Peter Lynch (1989): PEG = PER / crecimiento esperado del BPA. Valores < 1 sugieren
crecimiento infravalorado. El sistema lo clasifica en cinco bandas
(ULTRA_GANGA < 0,5 · INFRAVALORADA < 1 · JUSTA ≤ 1,5 · SOBREVALORADA > 1,5 ·
NO_DISPONIBLE) con un *score* de convicción 0–100 que se inyecta al LLM con
reglas duras (p. ej., SOBREVALORADA limita la confianza de COMPRA a ≤ 40). Se
discuten sus limitaciones: sensibilidad a la estimación de crecimiento y no
aplicabilidad a empresas sin beneficios.

## 2.5 LLMs en análisis financiero

La literatura reciente (BloombergGPT, FinGPT, 2023) explora LLMs específicos de
dominio; en paralelo, la práctica industrial converge hacia un patrón más
conservador para aplicaciones con cifras: **el LLM no calcula** — recibe métricas
computadas de forma determinista como contexto estructurado y produce
interpretación, con salida restringida por esquema (*structured output*). Las
técnicas empleadas en este trabajo se alinean con ese patrón: contexto JSON
compacto, instrucción de sistema estática y cacheable, validación con esquemas
declarativos (Zod), confianza acotada por reglas, *fallback* explícito ante
salida inválida y propagación de la calidad de los datos de entrada
(`degraded`) como instrucción de cautela. La hipótesis evaluada es que este
patrón produce análisis útiles y sin cifras inventadas a coste marginal.

## 2.6 Metodología de desarrollo `[REVISAR: mantener/recortar según normativa]`

El proyecto se desarrolló de forma iterativa con integración continua: cada cambio
viaja en una *pull request* que ejecuta la suite de tests, el build y un
despliegue de previsualización en dos entornos antes del merge a `main`, que
despliega automáticamente a producción (Vercel) y aplica las migraciones de base
de datos (Prisma Migrate). Se emplearon herramientas de IA generativa como
asistente de programación bajo revisión humana, con el historial completo de
decisiones documentado en las pull requests del repositorio. Diez PRs principales
estructuraron el trabajo: auditoría y corrección de defectos (#64, #66, #67, #70,
#73), funcionalidades del motor de transacciones (#65, #68), seguridad (#69),
clasificador de régimen y curva de evolución (#71) y documentación (#72, #74).

---

# 3. Análisis y especificación de requisitos

## 3.1 Requisitos funcionales

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| RF1 | Registro/login de usuario con sesión persistente | Alta |
| RF2 | Gestión de cartera de hasta 20 valores activos con validación de ticker en tiempo real contra el mercado | Alta |
| RF3 | Registro de transacciones BUY / SELL / SPLIT / DIVIDEND con comisiones, fecha y notas; edición y borrado con recálculo automático | Alta |
| RF4 | Importación del CSV de transacciones de DEGIRO con resolución de ticker por ISIN, fusión de ejecuciones parciales e idempotencia | Alta |
| RF5 | Cotizaciones con doble fuente (Finnhub → Yahoo) y conversión a USD por la divisa real de cotización | Alta |
| RF6 | Análisis IA multi-horizonte (corto/medio/largo) por valor: escenario, acción prescriptiva, confianza acotada y justificación | Alta |
| RF7 | Métricas de posición: WAC, break-even real, P&L realizado/no realizado, dividendos, comisiones, días en cartera, CAGR | Alta |
| RF8 | Métricas de cartera: valor/coste agregado, TWR con curva de evolución diaria, peso por posición, matriz de correlación | Alta |
| RF9 | Simulación Monte Carlo (1 000 trayectorias, VaR95/CVaR95), stress testing histórico y optimización Markowitz/Black-Litterman | Media |
| RF10 | Detección automática de splits con salvaguardas anti-doble-aplicación | Media |
| RF11 | Análisis de comportamiento: efecto disposición, profit factor, ventas prematuras, benchmark S&P 500 del mismo período | Media |
| RF12 | Tax harvesting informativo del año fiscal (pérdidas confirmadas y latentes, referencia art. 33 LIRPF) | Media |
| RF13 | Clasificación de régimen de mercado por valor e inyección como sesgo del análisis IA | Media |
| RF14 | Exportación CSV de cartera; historial de ventas con P&L por operación; ventas históricas manuales | Baja |
| RF15 | Cuestionario de perfil de riesgo (12 ítems) inyectado como contexto del análisis | Baja |

## 3.2 Requisitos no funcionales

| ID | Requisito |
|----|-----------|
| RNF1 | **Coste**: operación con planes gratuitos o de coste marginal (Supabase free, APIs gratuitas, Gemini Flash Lite) |
| RNF2 | **Latencia**: actualización completa de 20 valores < 300 s (límite de función del despliegue) |
| RNF3 | **Degradación elegante**: el fallo de cualquier fuente externa no aborta el análisis; produce resultado parcial marcado `degraded` |
| RNF4 | **Integridad**: nunca persistir un precio 0/erróneo destructivo; conversión de divisa correcta o fallo explícito |
| RNF5 | **Idempotencia**: reimportar el mismo CSV no genera duplicados |
| RNF6 | **Seguridad**: aislamiento por usuario en cada consulta; RLS en todas las tablas; secretos fuera del código |
| RNF7 | **Calidad**: suite de tests unitarios en CI; tipado estático estricto end-to-end |
| RNF8 | **Trazabilidad**: toda señal IA acompañada de las métricas que la sustentan y de su justificación |

## 3.3 Casos de uso

`[FIGURA 1: diagrama de casos de uso]` Actor único (inversor autenticado) con los
casos: gestionar cartera, registrar/editar transacciones, importar historial del
bróker, actualizar datos y análisis, consultar análisis multi-horizonte, simular
escenarios, optimizar pesos, consultar rendimiento y evolución, consultar
insights de comportamiento, configurar perfil de riesgo, exportar datos, limpiar
cartera. Actor secundario: el planificador (cron) que ejecuta la actualización
diaria y el snapshot de cartera.

---

# 4. Diseño y arquitectura del sistema

## 4.1 Stack tecnológico y justificación

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| Framework | Next.js 14 (App Router) | SSR + API routes en un solo despliegue; ecosistema TypeScript |
| Lenguaje | TypeScript estricto | Tipado end-to-end desde la BD (Prisma) hasta la UI |
| ORM / BD | Prisma 5 + PostgreSQL (Supabase) | Migraciones versionadas; plan gratuito con pooling |
| Autenticación | NextAuth (credenciales + bcrypt) | Sesiones JWT sin servicio externo |
| IA generativa | Google Gemini 2.5 Flash Lite | Mejor relación coste/latencia; salida JSON; caché implícita de prefijo |
| Datos de mercado | Finnhub + Yahoo Finance (fallback) | Cobertura conjunta de mercados US y europeos sin coste |
| Noticias | NewsAPI | Artículos de las últimas 48 h por valor |
| Despliegue | Vercel (+ cron diario) | CI/CD por PR con previsualizaciones; migraciones en build |
| Tests | Vitest (+ Playwright e2e) | Suite unitaria rápida en CI |

## 4.2 Arquitectura en capas

`[FIGURA 2: diagrama de arquitectura]`

Monolito Next.js organizado en cuatro capas con dependencia unidireccional:

1. **Presentación** (`src/app`, `src/components`): páginas server-rendered; los
   componentes interactivos (panel de transacciones, formularios) son islas de
   cliente. Los gráficos (curva de evolución, abanico Monte Carlo, sparklines) son
   SVG generado en servidor, sin librerías de charting.
2. **Servicios de dominio** (`src/services`): contienen toda la lógica —
   `transactionService` (motor WAC), `analysisOrchestrator` (pipeline de
   actualización), `marketDataService` (cotizaciones), `quantitativeService`
   (métricas), `splitDetectionService`, `portfolioSnapshotService` (TWR),
   `decisionAnalysisService` (comportamiento), `importService` (DEGIRO),
   `aiAnalysisService` (prompting y validación).
3. **Repositorios** (`src/repositories`): acceso a datos tipado; cada consulta
   filtra por `userId`.
4. **Infraestructura** (`src/lib`): clientes HTTP de terceros, caché de dos
   niveles (tabla `CacheEntry` + memoria), `withTimeout`, circuit breaker,
   utilidades matemáticas puras (`src/lib/math`).

## 4.3 Modelo de datos

`[FIGURA 3: diagrama E-R desde schema.prisma]`

| Entidad | Propósito | Campos clave |
|---------|-----------|--------------|
| User | Cuenta y sesión | email único, hash bcrypt, lastLogin |
| Stock | Valor en cartera | ticker+userId únicos, ISIN, divisa, horizonte de inversión, quantity/purchasePrice (sincronizados desde transacciones) |
| Transaction | Operación | type ∈ {BUY, SELL, SPLIT, DIVIDEND}, shares, price, **fee**, date, notes |
| StockAnalysis | Último análisis por valor | precio nativo + **priceUSD** + divisa, indicadores (SMA/RSI), **marketRegime**, escenarios 3-horizontes (JSON), divergencias, calidad de datos |
| StockAnalysisHistory | Snapshots de análisis (30 días) | escenario, RSI, precio |
| PortfolioSnapshot | Punto diario de la curva de evolución | totalValue, costBasis, **netFlows** (para TWR), único por usuario+día |
| PortfolioAnalysis | Análisis IA global de cartera | diversificación, riesgos, rebalanceo |
| ManualSellEntry | Ventas históricas pre-sistema | sin relación con Stock |
| CacheEntry | Caché persistente con TTL | key, value JSON, expiresAt |
| UserProfile | Perfil de riesgo | score 0–36, etiqueta |

Decisiones de modelado destacables: (a) el tipo de transacción es un enum de BD
ampliado por migraciones aditivas (`ADD VALUE IF NOT EXISTS`); (b) `SPLIT`
codifica el factor en `shares` (10 = 10:1, 0,1 = contrasplit) con precio
sin significado fijado a 1; (c) `Stock.quantity/purchasePrice` son una
*proyección* del estado WAC que se resincroniza tras cada mutación de
transacciones, manteniendo coherentes el dashboard y la vista de rendimiento.

## 4.4 Decisiones arquitectónicas

**AD1 — Doble fuente de cotización con conservación del último precio.** Finnhub
no cubre bolsas europeas (responde 403); Yahoo sí. `getCurrentQuote` intenta
Finnhub y ante *cualquier* fallo (excepción o precio ≤ 0) recurre a Yahoo; si
ambas fallan, el orquestador conserva el último precio válido marcando el
análisis como degradado. Principio: *un precio viejo es mejor que un precio 0
que pinta la posición como pérdida total*.

**AD2 — FX por divisa real con fallo explícito.** La conversión a USD usa el par
`{divisa}USD=X` de la divisa de cotización (con caché de 1 h y caso especial
GBp = GBP/100). Si el tipo no está disponible, la cotización falla y aplica AD1.
Principio: *mejor no valorar que valorar con el tipo equivocado* (defecto D3,
§9.2).

**AD3 — Caché estratificada por coste de la fuente.** Análisis IA: 4 h.
Splits, histórico de SPY y FX: 24 h/1 h. Earnings: 30 días (una inferencia por
trimestre fiscal). Contexto macro: 4 h. La caché vive en BD (`CacheEntry`) con
réplica en memoria para el mismo proceso, y degrada a solo-memoria si la BD falla.

**AD4 — Presupuesto de timeouts por fuente.** Cada fuente externa tiene un budget
individual (cotización 10 s, histórico 8 s, fundamentales 6 s, noticias 10 s,
Gemini 25 s/valor) dentro de un presupuesto global < 300 s para 20 valores; el
agotamiento de una fuente degrada esa pieza sin bloquear el pipeline.

**AD5 — El LLM como dependencia opcional.** Si Gemini falla o su respuesta no
valida, cada valor recibe un análisis *fallback* explícito; las métricas
cuantitativas y el estado de cartera no dependen del LLM en ningún caso.

---

# 5. Motor cuantitativo

## 5.1 Contabilidad de posiciones por coste medio ponderado

El motor procesa las transacciones de cada valor en orden cronológico
manteniendo el par (acciones abiertas, coste medio):

- **BUY:** coste ← (avgCost·open + precio·acc + comisión) / (open + acc). La
  comisión de compra se **capitaliza** en el coste base (criterio fiscal español).
- **SELL:** resultado realizado ← acc_vendibles·(precio − avgCost) − comisión;
  el coste medio no cambia. Las ventas se recortan a las acciones disponibles.
- **SPLIT (factor f):** open ← open·f; avgCost ← avgCost/f. Capital y P&L
  realizado invariantes; sobre posición cerrada es un no-op y no altera fechas.
- **DIVIDEND:** dividendos ← dividendos + (acc·importe − retención); no altera la
  posición ni su período de tenencia.

Derivadas: break-even real = (coste abierto − realizado − dividendos) / acciones
abiertas (precio de venta al que el P&L total queda a cero); días en cartera
hasta hoy si abierta o hasta la última operación si cerrada; CAGR sobre la
riqueza final completa

> CAGR = [(V<sub>abierto</sub> + Ingresos<sub>ventas</sub> + Dividendos) / Invertido]^(365/d) − 1

suprimido con menos de 30 días por extrapolación no significativa (un −16 % en
8 días anualiza a −99,97 %, cifra correcta pero engañosa).

**Tabla 5.1 — Ejemplo trazado** `[REVISAR: ejemplo numérico de 6 transacciones
con split y dividendo, calculado a mano y contrastado con el test unitario]`.

## 5.2 Detección automática de splits con corroboración

Los brókeres tratan los splits de forma heterogénea: DEGIRO los codifica como un
par de transacciones de ajuste (se observó en el caso real de Netflix:
−2 títulos a 1 112,17 + 20 títulos a 111,217), mientras que un historial
introducido a mano puede no reflejarlos. Aplicar un split automáticamente sobre
un historial *ya ajustado* lo corrompe (defecto D4, §9.2). La solución tiene tres
salvaguardas:

1. Solo eventos (Yahoo, `events=splits`, 10 años, caché 24 h) posteriores a la
   primera compra y con posición abierta en la fecha del evento.
2. Dedupe ±7 días contra splits ya registrados.
3. **Test de corroboración:** sea A el WAC en la fecha del split y f el factor;
   el split se aplica solo si A/f es coherente (ratio ∈ [0,5, 2]) con el precio
   medio de las compras posteriores al split o, en su defecto, con el precio de
   mercado actual. Sin referencia, no se auto-aplica (queda el registro manual).

Las transacciones insertadas llevan nota «Auto-detectado» y son eliminables, con
recálculo automático.

## 5.3 Simulación de Monte Carlo

1 000 trayectorias de S<sub>t+1</sub> = S<sub>t</sub>·exp((μ − σ²/2) + σ·ξ) con
ξ ~ t(5)·√(3/5) (shock reescalado a varianza unitaria, §2.2) o ξ ~ N(0,1)
comparativa. Dos decisiones de estimación de entrada con impacto material:

- **σ es la volatilidad de la cartera**, estimada del histórico de 60 días como
  la serie de retornos diarios ponderados por valor de las posiciones — no la
  media de las volatilidades individuales, que ignora el efecto diversificación
  y llegó a inflar la volatilidad anualizada del caso real del ~36 % al 62,9 %
  (defecto corregido, §9.2).
- Los cierres ≤ 0 (datos degradados) se excluyen de la estimación.

Salidas: percentiles p10–p90 día a día (gráfico de abanico), VaR95 y CVaR95
sobre valores finales, probabilidad de pérdida, y aportaciones mensuales
opcionales. Stress testing complementario contra cinco crisis históricas
parametrizadas (2008, COVID, 2022, puntocom, 1987). `[FIGURA 4: abanico Monte
Carlo + tarjetas VaR/CVaR]`

## 5.4 Régimen de mercado

Clasificador determinista de seis estados que cruza persistencia (Hurst),
momentum (RSI14), actividad (volumen relativo) y volatilidad condicional
(GARCH(1,1) anualizada):

| Régimen | Condición | Uso |
|---------|-----------|-----|
| HIGH_VOLATILITY | σ<sub>GARCH</sub> > 40 % o volumen > 3× | Ampliar rangos objetivo |
| VOLATILITY_CRUSH | σ<sub>GARCH</sub> < 15 % | Estrechar rangos |
| TRENDING_BULL | H > 0,6 y RSI > 55 | Sesgo escenario positivo (corto plazo) |
| TRENDING_BEAR | H > 0,6 y RSI < 45 | Sesgo escenario negativo |
| MEAN_REVERTING | H < 0,45 | Mayor peso del escenario neutral |
| RANDOM_WALK | resto | Escenarios equiprobables, intervalos anchos |

El régimen se persiste por valor y se inyecta al LLM como `regime:{state,bias}`
(~15 tokens). La variante tolerante a datos ausentes devuelve nulo sin Hurst o
RSI (régimen no interpretable).

## 5.5 Optimización de carteras

Markowitz de varianza mínima por gradiente proyectado (3 000 pasos, sin cortos)
sobre covarianzas con shrinkage de Ledoit-Wolf (α = 0,2); Black-Litterman
(τ = 0,05, δ = 2,5) cuando el LLM aporta vistas válidas, con fallback a Markowitz.
Se excluyen activos sin precio fiable y posiciones cerradas: optimizar sobre un
precio 0 producía recomendaciones de asignar ~14 % a un activo degradado
(defecto corregido). Salida: pesos actual vs. óptimo, retorno/volatilidad/Sharpe
comparados y limitaciones del modelo explícitas en la UI.

## 5.6 Rentabilidad y evolución de cartera

Snapshot diario idempotente (valor de mercado USD, coste WAC, flujos externos
netos del día) capturado tras cada actualización y por el cron. TWR encadenado
(§2.3) con anualización a partir de 30 días, mostrado junto a la curva
valor-vs-coste. `[FIGURA 5: curva de evolución con TWR]`

## 5.7 Análisis de comportamiento

Sobre las operaciones cerradas (reconstruidas con WAC cronológico): efecto
disposición (días medios en ganadoras vs. perdedoras, sesgo si ratio > 1,3),
profit factor, ventas prematuras (precio actual > 110 % del precio de venta, con
filtro anti-ticker-erróneo > 5×), mejores/peores decisiones, y benchmark contra
S&P 500 **del mismo período de tenencia** de cada operación (precios reales de
SPY de Yahoo con caché; comparar contra SPY mantenido hasta hoy penalizaba
injustamente las salidas antiguas).

---

# 6. Pipeline de análisis con IA generativa

## 6.1 Orquestación

`[FIGURA 6: diagrama de fases]` Para cada actualización:

1. **Frescura:** valores con análisis < 4 h se sirven de caché (salvo forzado);
   un precio 0 cuenta como caducado.
2. **Splits:** detección y registro automático (§5.2) antes de calcular métricas.
3. **Datos de mercado** en paralelo con timeouts por fuente: cotización (doble
   fuente), histórico 60 días, fundamentales. Fallos → *fallbacks* tipados +
   `dataQuality.degraded`.
4. **Noticias** en batch (una pasada de sentimiento para todos los valores).
5. **Métricas cuantitativas** de cartera (Sharpe, Kelly, GARCH, correlaciones,
   pesos) + Fear&Greed + régimen de mercado.
6. **LLM en batch** (grupos de 4 valores → ⌈N/4⌉ llamadas): cada grupo produce
   los tres horizontes de cada valor; si el batch falla, reintento individual;
   si falla, *fallback*.
7. **Persistencia** + snapshot de historial + snapshot de cartera.

## 6.2 Diseño del prompt

Tres principios:

- **Instrucción de sistema estática** (idéntica en toda llamada → caché implícita
  de prefijo del proveedor): formato de entrada/salida, reglas por horizonte y
  tabla de sesgos (macro, earnings, perfil de riesgo, pegLynch, régimen,
  degradación).
- **Contexto dinámico como JSON compacto en el mensaje de usuario**: fecha, macro
  clasificado por impacto, guidance de resultados, perfil de riesgo y, por valor:
  precio, técnicos, fundamentales con pegLynch ya clasificado, sentimiento de
  noticias, métricas cuantitativas, régimen y bandera de degradación.
- **Esquema de salida en el propio mensaje** (modo keyed/direct, campos por
  horizonte), validado a la vuelta con Zod; cualquier respuesta no conforme se
  descarta y el valor recibe el análisis *fallback*.

*Ejemplo de ancla (extracto de la instrucción de sistema):*
«SOBREVALORADA (score=20) → limita confidenceScore de COMPRA a ≤ 40 en
mediumTerm/longTerm», «ctx.risk=Conservador → confidenceScore máximo 55 en
COMPRA», «TRENDING_BEAR → sesga escenario NEGATIVO en shortTerm». El anexo C
incluye un prompt completo real y su respuesta validada.

## 6.3 Control de la alucinación

El LLM nunca origina cifras: todas las magnitudes mostradas en la UI provienen
del motor determinista; el texto generado *referencia* esas métricas. Las
defensas, por capa: entrada (métricas pre-clasificadas, p. ej. pegLynch en bandas
discretas), salida (esquema Zod con rangos), política (confianza acotada por
reglas), y operación (fallback explícito, marca de degradación, sello temporal y
disclaimer permanente). Limitación honesta: la coherencia *semántica* de la
justificación no es verificable automáticamente; se evalúa cualitativamente
(§9.5).

## 6.4 Coste y rendimiento

Actualización completa de 20 valores: ~5 llamadas batch a Gemini ≈ 125 s de
presupuesto + fuentes de datos ≈ 30 s → ~185 s en el peor caso, dentro del límite
de 300 s. El batching reduce las llamadas de N a ⌈N/4⌉ y la instrucción estática
permite el cacheo del prefijo. Coste por actualización completa con Gemini 2.5
Flash Lite: `[REVISAR: ~8k tokens entrada + ~2k salida por batch → estimar € con
tarifa vigente]` — del orden de céntimos.

---

# 7. Integración de datos financieros reales

## 7.1 El CSV de DEGIRO como caso de estudio de datos hostiles

El formato de exportación de DEGIRO no está documentado y presenta, observado
sobre archivos reales:

| Peculiaridad | Ejemplo real |
|--------------|--------------|
| BOM UTF-8 y decimales con coma | `"3,2980"` |
| Orden inverso (reciente → antiguo) | el WAC exige procesar cronológicamente |
| Columnas de divisa **sin nombre** tras precio/valor | `…,Precio,,Valor local,,…` |
| Nombre de columna de costes con sufijo | «Costes de transacción **y/o externos EUR**» |
| **ID de orden desplazado** a una columna extra sin nombre en exports recientes | GUID en la columna 18 con «ID Orden» vacío |
| Ejecuciones parciales multi-centro de una misma orden | venta de 726 títulos en 2 fills de 363 (MESI + XMAD) |
| Splits codificados como par de transacciones de ajuste | NFLX: −2 @ 1 112,17 / +20 @ 111,217, sin hora ni orden |
| Filas en divisa extranjera sin tipo de cambio | compras en EUR con columna FX vacía |

## 7.2 Parser defensivo

Pipeline de importación: normalización de cabeceras (acentos, prefijos) →
parseo tolerante por fila (descarta filas sin ISIN, sin título o sin precio) →
conversión a USD en parseo (tipo de la fila o *fallback* al FX actual por
divisa) → **fusión de ejecuciones parciales** por ID de orden (con rescate del
GUID por expresión regular en las últimas columnas) → resolución de ticker por
ISIN contra Yahoo (lotes de 8, timeout 4 s, fallback al nombre del producto) →
**deduplicación por multiconjunto** (clave → apariciones existentes en BD: cada
fila del archivo consume una aparición antes de poder insertarse, lo que
preserva la idempotencia de la reimportación *y* permite que dos ejecuciones
legítimas idénticas se importen ambas) → inserción masiva → resincronización de
posiciones desde el WAC.

## 7.3 Lección de ingeniería

Cinco de los seis defectos del capítulo 9 pertenecen a esta capa. La conclusión
del capítulo: en software financiero, la dificultad no está en las fórmulas —
está en que los datos de entrada digan la verdad. Un parser de datos de bróker
debe diseñarse como un sistema *adversarial*: cada suposición sobre el formato
debe tener una salvaguarda y un comportamiento de fallo explícito.

---

# 8. Seguridad y privacidad

- **Autenticación:** NextAuth con credenciales, hash bcrypt, sesión JWT,
  registro de último acceso no bloqueante.
- **Autorización:** toda consulta de repositorio filtra por `userId`; los
  endpoints validan propiedad del recurso (`findByIdAndUser`).
- **Row-Level Security:** activado en **todas** las tablas del esquema público.
  La aplicación accede vía Prisma con el rol propietario (no afectado por RLS sin
  `FORCE`), de modo que la API REST autogenerada de Supabase (PostgREST) queda
  bloqueada por defecto-denegación para los roles `anon`/`authenticated` —
  cerrando el hallazgo del Security Advisor de Supabase sin tocar la aplicación.
- **Secretos** en variables de entorno; el endpoint de cron exige token Bearer;
  rate limiting de actualizaciones (5 min global, 1 min por ticker).
- **Privacidad:** los datos importados del bróker permanecen en la BD del
  usuario; al LLM solo viajan ticker y métricas agregadas, nunca identidad ni
  importes de cuenta. Borrado en cascada y función «Limpiar cartera» con
  confirmación textual explícita.
- **Cumplimiento informativo:** disclaimer permanente (análisis informativos, no
  asesoramiento — MiFID II) y aviso fiscal específico (art. 33 LIRPF) en el
  módulo de tax harvesting.

---

# 9. Validación y resultados: caso de estudio con cartera real

## 9.1 Metodología

La validación siguió un protocolo de **reconciliación contable iterativa** entre
la plataforma y el bróker, con una cartera real: ~25 000 €, 20+ valores operados
y ~70 transacciones a lo largo de 18 meses, incluyendo deliberadamente los casos
límite del mundo real: un split 10:1 (Netflix), valores en tres divisas (USD,
EUR — Sabadell, DKK — Novo Nordisk), una venta ejecutada en dos fills idénticos,
dividendos y posiciones totalmente cerradas. Cada iteración: importar → comparar
contra las pantallas del bróker → investigar cada discrepancia hasta su causa
raíz → corregir con test de regresión → reimportar desde cero (LIMPIAR) →
repetir.

## 9.2 Defectos detectados y corregidos

| ID | Síntoma observado | Causa raíz | Corrección | Test |
|----|-------------------|------------|------------|------|
| D1 | CAGR −86 % en posición con +16 % de beneficio (ORCL); −99 % en cerradas ganadoras | La riqueza final omitía los ingresos de ventas; días en cartera contados hasta hoy en posiciones cerradas | Riqueza final completa; fin del período en la última operación; supresión < 30 días | ✓ |
| D2 | VaR95 del 72 % de la cartera; mediana simulada sesgada | Shock t(5) sin reescalar (varianza 5/3) y σ estimada agrupando retornos individuales sin diversificación | Reescalado √((ν−2)/ν); σ de cartera ponderada por valor | ✓ |
| D3 | Novo Nordisk valorada a ~279 $ (real ~44 $) | Conversión de DKK a USD usando el tipo EUR/USD para toda divisa | FX por divisa real (`DKKUSD=X`), GBp/100, fallo explícito sin tipo | ✓ |
| D4 | Netflix con 230 títulos tras auto-split (real: 55) | Heurística de splits sin corroboración aplicada a un historial ya ajustado por el bróker | Test de coherencia WAC/factor contra compras post-split o mercado | ✓ |
| D5 | Sabadell con 363 títulos "fantasma" tras vender todo | Venta en 2 fills idénticos: GUID de orden en columna extra (no agrupados) + dedupe por conjunto que descartó el segundo | Rescate del GUID por regex + deduplicación por multiconjunto | ✓ |
| D6 | Comisiones a cero en todas las posiciones | Nombre real de la columna con sufijo («… y/o externos EUR») no coincidía con la búsqueda exacta | Resolución de cabeceras por prefijo; divisa del coste desde la cabecera; inclusión de la comisión AutoFX | ✓ |

Adicionalmente se corrigieron durante la auditoría inicial: posiciones sin precio
contadas como pérdida del −100 % en el agregado, límite de cartera consumido por
posiciones cerradas, doble fuente de verdad del P&L (panel fiscal vs.
rendimiento), y precio 0 persistido ante fallo del proveedor (precursor de D3).

## 9.3 Reconciliación final

`[REVISAR: completar tras la última reimportación con la tabla comparativa]`

| Valor | Títulos (bróker / app) | BEP (bróker / app) | Valor (bróker / app) | Δ |
|-------|------------------------|--------------------|-----------------------|---|
| NFLX | 55 / `[ ]` | 94,66 / `[ ]` | … | `[ ]` |
| NOVC | 12 / `[ ]` | 45,15 € / `[ ]` | … | `[ ]` |
| …    | | | | |

Criterio de éxito (O1): diferencias < 1 % atribuibles a redondeo de FX
intradía. Diferencias estructurales restantes conocidas: el efectivo de la
cuenta (fuera de alcance, §10.2).

## 9.4 Calidad del software

- **72+ tests unitarios**: motor WAC (22 — incluye splits, dividendos,
  comisiones, ventas con exceso), Monte Carlo (9 — incluye el reescalado t),
  TWR (7 — neutralización de flujos), régimen de mercado (12 — seis ramas con
  valores frontera), detección de splits (10 — corroboración y rechazo del caso
  D4), cotizaciones con fallback (5), PEG y matemáticas de cartera.
- **CI/CD:** cada PR ejecuta tests + build + lint + 2 despliegues de
  previsualización; 10 PRs mergeadas a producción durante el período documentado.
  `[FIGURA 7: historial de PRs]`
- Deuda conocida: los tests de integración del orquestador requieren BD y no se
  ejecutan en CI; los e2e de Playwright existen pero no están en el pipeline.

## 9.5 Evaluación cualitativa del análisis IA

`[REVISAR: 2–3 capturas comentadas]` Pauta de evaluación propuesta por ejemplo:
(1) ¿la señal es consistente con las métricas inyectadas? (2) ¿la justificación
referencia métricas reales y no inventadas? (3) ¿la confianza respeta las anclas?
Ejemplo positivo observado: con pegLynch SOBREVALORADA, la confianza de COMPRA
quedó sistemáticamente ≤ 40 y la justificación lo cita. Limitación observada:
con datos degradados el texto puede ser genérico («ausencia de señales claras»),
correcto pero poco informativo.

---

# 10. Conclusiones y trabajo futuro

## 10.1 Conclusiones por objetivo

- **O1 ✓** El motor WAC soporta el ciclo completo (incl. splits con
  corroboración y dividendos) y reconcilia contra el bróker real
  `[REVISAR: cifra final de §9.3]`.
- **O2 ✓** Todas las métricas tienen fórmula documentada y test; dos defectos
  estadísticos sutiles (reescalado t, σ de cartera) demuestran el valor de
  validar la implementación y no solo la teoría.
- **O3 ✓** El patrón "métricas deterministas + LLM acotado por esquema" produjo
  el 100 % de salidas validadas o degradadas a fallback explícito; ninguna cifra
  mostrada procede del LLM.
- **O4 ✓** La importación es idempotente (multiconjunto) y la capa de
  cotizaciones nunca persiste un precio destructivo; el coste de esta robustez
  fue el grueso del esfuerzo de ingeniería (capítulo 7).
- **O5 ✓** El caso de estudio (capítulo 9) constituye la principal aportación
  metodológica: seis defectos relevantes eran **invisibles con datos sintéticos**
  y solo emergieron con datos reales de bróker.

**Conclusión general:** es viable que un desarrollador individual construya, con
infraestructura gratuita, una plataforma de análisis con rigor verificable. El
LLM aporta valor real como capa de comunicación; el rigor lo aporta el motor
determinista. La frontera de calidad del producto no estuvo en los modelos
matemáticos sino en la integración de datos.

## 10.2 Trabajo futuro

Documentado y priorizado en el repositorio (issue #63): watchlist sin coste de
análisis; informe fiscal IRPF con regla de los dos meses; importación
multi-bróker (IBKR, Trading212); gestión de efectivo y aportaciones, que
habilitaría el XIRR (money-weighted) y la probabilidad de alcanzar objetivos.
Líneas de investigación: **backtesting de las señales IA** contra el mercado
(evaluación cuantitativa del acierto, no solo cualitativa), alertas push (#18,
#53) y comparación de proveedores LLM bajo el mismo esquema acotado.

---

# 11. Bibliografía `[REVISAR: adaptar al formato exigido]`

- Markowitz, H. (1952). *Portfolio Selection*. The Journal of Finance, 7(1).
- Black, F.; Litterman, R. (1992). *Global Portfolio Optimization*. Financial Analysts Journal, 48(5).
- Ledoit, O.; Wolf, M. (2004). *A well-conditioned estimator for large-dimensional covariance matrices*. Journal of Multivariate Analysis, 88(2).
- Bollerslev, T. (1986). *Generalized Autoregressive Conditional Heteroskedasticity*. Journal of Econometrics, 31(3).
- Artzner, P. et al. (1999). *Coherent Measures of Risk*. Mathematical Finance, 9(3).
- Hurst, H. E. (1951). *Long-term storage capacity of reservoirs*. Trans. ASCE, 116.
- Mandelbrot, B. (1963). *The Variation of Certain Speculative Prices*. The Journal of Business, 36(4).
- Lynch, P.; Rothchild, J. (1989). *One Up on Wall Street*. Simon & Schuster.
- Jorion, P. (2006). *Value at Risk* (3.ª ed.). McGraw-Hill.
- CFA Institute (2020). *Global Investment Performance Standards (GIPS)*.
- Wu, S. et al. (2023). *BloombergGPT: A Large Language Model for Finance*. arXiv:2303.17564.
- Documentación técnica: Next.js 14, Prisma 5, Supabase (RLS), Google Gemini API, NextAuth, Vercel.

---

# 12. Anexos

## Anexo A — Esquema de base de datos
`schema.prisma` completo con comentarios (10 entidades, 17 migraciones versionadas).

## Anexo B — API de la plataforma (selección)

| Método y ruta | Función |
|---------------|---------|
| POST /api/update?force= | Pipeline completo de actualización (tipos: price/news/technicals/ai/portfolio) |
| GET/POST/PATCH/DELETE /api/portfolio/transactions[/id] | Motor de transacciones |
| POST /api/portfolio/import/degiro | Importación CSV (FormData, ≤ 10 MB) |
| POST /api/portfolio/simulation | Monte Carlo + stress tests |
| GET /api/portfolio/optimize | Markowitz / Black-Litterman |
| GET /api/portfolio/correlation · /export?format=csv · /rebalance | Métricas y utilidades |
| GET /api/portfolio/insights/decisions | Análisis de comportamiento |
| DELETE /api/portfolio/reset | Limpieza de cartera |
| GET /api/cron/daily-update | Actualización diaria autenticada + snapshots |

## Anexo C — Prompt completo y respuesta validada
`[REVISAR: volcar un ejemplo real (instrucción de sistema + mensaje de usuario JSON + respuesta) anonimizado.]`

## Anexo D — Manual de usuario
Capturas y guía de los módulos: Dashboard, Rendimiento, Simulación, Insights, Importar, Ajustes.

## Anexo E — Guía de despliegue
Vercel + Supabase: variables de entorno (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET`, `GEMINI_API_KEY`, `FINNHUB_API_KEY`, `NEWS_API_KEY`, `CRON_SECRET`), migraciones en build y configuración del cron.
