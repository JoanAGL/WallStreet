# My Personal Advisor — Memoria del Trabajo Final de Bachelor (PROPUESTA v0.1)

> **Cómo usar este documento:** es una propuesta de estructura con cada sección ya
> redactada en borrador. Revisa: (1) los datos administrativos de la portada,
> (2) la sección 2.6 sobre metodología de desarrollo asistido por IA — inclúyela u
> omítela según la normativa de tu universidad, (3) los huecos marcados `[FIGURA]`
> y `[REVISAR]`. La extensión objetivo orientativa es 40–60 páginas; cada sección
> indica su peso sugerido.

---

## Portada `[REVISAR: datos administrativos]`

- **Título:** My Personal Advisor: plataforma de análisis cuantitativo de carteras de inversión asistida por modelos generativos de lenguaje
- **Autor:** Joan Antoni González López
- **Titulación / Universidad:** `[REVISAR]`
- **Tutor/a:** `[REVISAR]`
- **Curso académico:** 2025–2026
- **Repositorio:** github.com/JoanAGL/WallStreet · **Demo:** wall-street-jan.vercel.app

---

## Resumen / Abstract *(½ página + traducción al inglés)*

Este trabajo presenta el diseño, implementación y validación de una plataforma web
de análisis de carteras de inversión que combina un motor cuantitativo clásico
(coste medio ponderado, simulación de Monte Carlo, volatilidad GARCH, optimización
de carteras) con un modelo generativo de lenguaje (Google Gemini) que sintetiza
señales técnicas, fundamentales y de contexto en proyecciones multi-horizonte. La
plataforma importa el historial real de transacciones del bróker DEGIRO y se valida
mediante la reconciliación contable contra una cartera real, proceso que destapó y
permitió corregir defectos no triviales de integración de datos financieros
(ejecuciones parciales duplicadas, divisas sin tipo de cambio, splits de acciones).
El sistema se despliega en producción con integración y despliegue continuos.

**Palabras clave:** análisis cuantitativo, LLM, Monte Carlo, GARCH, Next.js,
gestión de carteras, fintech.

---

## Índice propuesto

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

## 1. Introducción *(3–4 páginas)*

### 1.1 Motivación
El inversor minorista europeo opera con herramientas fragmentadas: el bróker da
ejecución pero análisis pobre; las plataformas de análisis profesional (Bloomberg,
FactSet) son inaccesibles por coste; y los "robo-advisors" comerciales no explican
sus decisiones. Al mismo tiempo, los modelos generativos de lenguaje han abierto la
posibilidad de generar análisis textual contextualizado a coste marginal cercano a
cero. La pregunta que motiva este trabajo: **¿puede un sistema construido con
servicios gratuitos o de bajo coste ofrecer análisis de cartera con rigor
cuantitativo verificable y explicaciones en lenguaje natural?**

### 1.2 Objetivos
- **O1.** Construir un motor contable de posiciones basado en coste medio ponderado (WAC) que soporte el ciclo de vida completo: compras, ventas, comisiones, dividendos y operaciones corporativas (splits).
- **O2.** Implementar un conjunto de herramientas cuantitativas con base estadística documentada: Monte Carlo con colas pesadas, GARCH(1,1), exponente de Hurst, VaR/CVaR, optimización de Markowitz y Black-Litterman, TWR.
- **O3.** Diseñar un pipeline que inyecte las métricas cuantitativas como anclas de un LLM para generar proyecciones multi-horizonte acotadas y trazables, no alucinadas.
- **O4.** Integrar datos reales: importación del historial del bróker DEGIRO y cotizaciones multi-divisa de fuentes públicas con tolerancia a fallos.
- **O5.** Validar el sistema mediante reconciliación contable contra una cartera real.

### 1.3 Alcance y limitaciones
Uso académico e informativo; el sistema no constituye asesoramiento financiero y
así se comunica en toda la interfaz. Limitado a renta variable de mercados cubiertos
por Yahoo Finance/Finnhub; sin gestión de efectivo ni derivados.

### 1.4 Estructura de la memoria
`[Párrafo estándar describiendo los capítulos.]`

---

## 2. Estado del arte y fundamentos *(6–8 páginas)*

### 2.1 Gestión de carteras computacional
Revisión breve: teoría moderna de carteras (Markowitz, 1952), el modelo de
Black-Litterman (1992) como respuesta a la inestabilidad de los pesos de Markowitz,
y la regularización por shrinkage de Ledoit-Wolf (2004).

### 2.2 Modelado de riesgo
- Movimiento browniano geométrico y sus limitaciones (colas gaussianas).
- Distribución t de Student como corrección de colas pesadas; necesidad de **reescalar a varianza unitaria** (√((df−2)/df)) para no sesgar la mediana — defecto detectado y corregido durante el propio desarrollo (§9.3).
- Volatilidad condicional: GARCH(1,1) (Bollerslev, 1986).
- VaR y Expected Shortfall (CVaR) como medidas de riesgo de cola.
- Persistencia de series: exponente de Hurst mediante análisis R/S.

### 2.3 Medidas de rentabilidad
Diferencia entre rentabilidad simple, CAGR, **Time-Weighted Return** (neutraliza
flujos externos; estándar GIPS) y money-weighted return. Justificación de TWR para
evaluar habilidad inversora con aportaciones periódicas.

### 2.4 Heurísticas de valoración fundamental
El ratio PEG de Peter Lynch como ancla de convicción; umbrales y limitaciones.

### 2.5 LLMs en análisis financiero
Estado del arte de modelos generativos aplicados a finanzas; riesgo de alucinación;
el patrón emergente de "LLM como sintetizador acotado": el modelo no calcula, sino
que **interpreta métricas calculadas de forma determinista** que se le inyectan
como contexto estructurado. Posicionamiento de este trabajo en ese patrón.

### 2.6 Metodología de desarrollo `[REVISAR: decidir si incluir]`
Desarrollo iterativo con integración continua (una rama → pull request → suite de
tests + build + despliegue de previsualización → merge → despliegue a producción),
asistido por herramientas de IA para generación de código bajo revisión humana.
Esta sección documenta honestamente el proceso si la normativa del centro lo
permite/exige; en caso contrario, redúcela a la metodología CI/CD.

---

## 3. Análisis y especificación de requisitos *(3–4 páginas)*

### 3.1 Requisitos funcionales (selección)
| ID | Requisito |
|----|-----------|
| RF1 | Gestión de cartera de hasta 20 valores con validación de ticker en tiempo real |
| RF2 | Registro de transacciones BUY/SELL/SPLIT/DIVIDEND con comisiones |
| RF3 | Importación del CSV de transacciones de DEGIRO (resolución de ticker por ISIN) |
| RF4 | Cotizaciones multi-divisa con conversión a USD por divisa real |
| RF5 | Análisis IA multi-horizonte (corto/medio/largo) por valor |
| RF6 | Simulación Monte Carlo, stress testing y optimización de pesos |
| RF7 | Métricas de cartera: P&L realizado/no realizado, TWR, curva de evolución |
| RF8 | Detección automática de splits con salvaguardas |
| RF9 | Análisis de sesgos de comportamiento (efecto disposición, ventas prematuras) y benchmark S&P 500 |
| RF10 | Tax harvesting informativo (año fiscal, art. 33 LIRPF) |

### 3.2 Requisitos no funcionales
Presupuesto cero/mínimo (APIs gratuitas, Vercel, Supabase free tier); latencia de
actualización completa < 300 s (límite Vercel Pro); degradación elegante ante fallo
de cualquier fuente de datos; idempotencia de importación; seguridad RLS; suite de
tests automatizada.

### 3.3 Casos de uso
`[FIGURA: diagrama de casos de uso — actor inversor: importar, actualizar, analizar, simular, registrar transacción.]`

---

## 4. Diseño y arquitectura *(5–6 páginas)*

### 4.1 Visión general
`[FIGURA: diagrama de arquitectura — Next.js App Router (SSR + API routes) → capa de servicios → repositorios Prisma → PostgreSQL (Supabase); integraciones: Finnhub, Yahoo Finance, NewsAPI, Gemini; cron diario de Vercel.]`

Arquitectura en capas dentro de un monolito Next.js 14:
- **Presentación:** páginas server-rendered + componentes cliente puntuales (paneles interactivos); SVG propio para gráficos (sin dependencias de charting).
- **Servicios de dominio** (`src/services`): transacciones/WAC, orquestador de análisis, datos de mercado, cuantitativo, detección de splits, snapshots, decisiones, importación.
- **Repositorios** (`src/repositories`): acceso a datos tipado sobre Prisma.
- **Infraestructura** (`src/lib`): clientes HTTP de terceros, caché en BD con fallback en memoria, timeouts, circuit breaker, autenticación.

### 4.2 Modelo de datos
`[FIGURA: diagrama entidad-relación generado desde schema.prisma]`
Entidades: User, Stock, Transaction (BUY/SELL/SPLIT/DIVIDEND + fee), StockAnalysis
(incluye divisa nativa, priceUSD y régimen de mercado), StockAnalysisHistory,
PortfolioSnapshot, PortfolioAnalysis, ManualSellEntry, CacheEntry, UserProfile.

### 4.3 Decisiones arquitectónicas relevantes
- **Doble fuente de cotización** con fallback total (Finnhub → Yahoo) y conservación del último precio válido ante fallo de ambas: nunca se persiste un precio 0 destructivo.
- **Conversión FX por divisa real** (`{CUR}USD=X`, caché 1 h; GBp→GBP/100) con fallo explícito si no hay tipo: es preferible no valorar a valorar mal.
- **Caché estratificada**: TTL 4 h para análisis, 24 h para splits/SPY/FX, 30 días para earnings; tabla CacheEntry con fallback en memoria.
- **Presupuesto de timeouts por fuente** en el orquestador para que ninguna API lenta bloquee el pipeline; calidad de datos (`dataQuality`) propagada hasta el prompt.

---

## 5. Motor cuantitativo *(8–10 páginas — núcleo técnico 1)*

### 5.1 Contabilidad de posiciones (WAC)
Algoritmo de coste medio ponderado con procesado cronológico; tratamiento de:
comisiones capitalizadas en compra y netas en venta (criterio fiscal), dividendos
(bruto − retención, sin alterar posición), splits (factor multiplicativo con
capital invariante), break-even real `(coste − realizado − dividendos)/acciones`,
CAGR con riqueza final = valor abierto + proceeds + dividendos (supresión bajo 30
días por extrapolación no significativa). *Incluir las fórmulas y un ejemplo
numérico trazado a mano (tabla).*

### 5.2 Detección automática de splits con corroboración
Problema: un historial puede venir ya ajustado (DEGIRO codifica el split de NFLX
como par de transacciones) o sin ajustar. Solución: detección vía eventos de Yahoo
+ **test de corroboración** — el WAC en la fecha del split dividido por el factor
debe ser coherente (ratio 0,5–2×) con las compras post-split o el precio de mercado;
sin referencia no se auto-aplica. *Discutir falsos positivos/negativos.*

### 5.3 Simulación de Monte Carlo
GBM con muestreo t de Student (df=5) **reescalado a varianza unitaria**; corrección
de Itô; sigma de entrada = volatilidad de la **cartera** (retornos diarios ponderados
por valor, con efecto diversificación), no media de volatilidades individuales.
VaR95/CVaR95 sobre valores finales; percentiles p10–p90. *Comparativa NORMAL vs
STUDENT_T con gráfico.*

### 5.4 Volatilidad condicional y régimen de mercado
GARCH(1,1) anualizada; exponente de Hurst (R/S); clasificador de régimen de 6
estados (tabla de umbrales) que combina persistencia, momentum, actividad y
volatilidad, persistido y usado como sesgo del LLM (§6.3).

### 5.5 Optimización de carteras
Markowitz de varianza mínima con gradiente proyectado y shrinkage de Ledoit-Wolf;
Black-Litterman con prior de equilibrio y vistas generadas por el LLM (τ=0,05,
δ=2,5) y fallback a Markowitz; exclusión de activos sin precio fiable.

### 5.6 Medidas de rentabilidad y evolución
Snapshot diario (valor, coste, flujos externos netos) y TWR encadenado
`r_i = (V_i − F_i)/V_{i−1} − 1` con anualización ≥ 30 días; curva de evolución.

### 5.7 Análisis de comportamiento
Efecto disposición, profit factor, ventas prematuras (con filtro anti-ticker
erróneo), benchmark S&P 500 sobre el **mismo período de tenencia** de cada
operación con histórico real de SPY.

---

## 6. Pipeline de análisis con IA generativa *(6–8 páginas — núcleo técnico 2)*

### 6.1 Arquitectura del pipeline
`[FIGURA: fases del orquestador — frescura → detección de splits → datos de mercado paralelos con timeouts → noticias batch → métricas cuantitativas → prompt batch a Gemini (grupos de 4) → validación Zod → persistencia + snapshot.]`

### 6.2 Diseño del prompt
- Instrucción de sistema **estática** (cacheable por prefijo KV) con las reglas de sesgo; contexto dinámico (macro, earnings, perfil de riesgo) en el mensaje de usuario como JSON compacto.
- El LLM **no calcula**: recibe RSI, SMA, PEG-Lynch clasificado, Sharpe, Kelly, Fear&Greed, correlaciones, régimen de mercado y calidad de datos, y debe emitir JSON validado contra esquema (Zod) con acción, confianza acotada y justificación.
- Anclas de convicción: pegLynch limita confianza de COMPRA si SOBREVALORADA; perfil conservador acota a 55; régimen TRENDING_BEAR sesga el escenario negativo, etc.

### 6.3 Control de alucinación y degradación
Validación estricta de esquema con fallback por valor; batching con reintento
individual; presupuesto < 50 tokens por señal añadida; `degraded=true` instruye
cautela. *Discutir limitaciones: el LLM sigue siendo no determinista; el sistema
acota el espacio de salida pero no garantiza corrección semántica.*

### 6.4 Coste y rendimiento
Una actualización completa de 20 valores ≈ 5 llamadas batch (~185 s peor caso);
coste por actualización con Gemini 2.5 Flash Lite ≈ `[REVISAR: estimar €]`.

---

## 7. Integración de datos financieros reales *(4–5 páginas)*

### 7.1 El problema de los datos de bróker
El CSV de DEGIRO es un formato no documentado y cambiante: BOM, decimales europeos,
orden inverso, columnas sin nombre para divisas, **ID de orden desplazado a una
columna extra en exports recientes**, ejecuciones parciales multi-centro, filas de
ajuste por split, columnas de coste con sufijo de divisa en la cabecera.

### 7.2 Parser defensivo
Resolución de cabeceras por prefijo normalizado; fusión de ejecuciones parciales
por ID de orden (con rescate del GUID por regex en columnas finales); conversión a
USD en parseo con fallback de FX por divisa; **deduplicación por multiconjunto**
(clave → apariciones) que permite fills legítimos idénticos manteniendo la
idempotencia de la reimportación; resolución de ticker por ISIN contra Yahoo
(lotes de 8, timeout 4 s).

### 7.3 Lecciones de ingeniería
Cada defecto de esta sección fue descubierto **con datos reales, no sintéticos**
(§9). Argumento central del capítulo: la robustez de un sistema financiero se
juega en la integración de datos, no en las fórmulas.

---

## 8. Seguridad y privacidad *(2–3 páginas)*

Autenticación con NextAuth (credenciales + bcrypt); autorización por usuario en
cada repositorio; **Row-Level Security activado en todas las tablas** (PostgREST
de Supabase bloqueado; Prisma accede como rol propietario); secretos en variables
de entorno; rate limiting de actualizaciones; endpoint de cron autenticado por
token; borrado en cascada y función «Limpiar cartera» con confirmación explícita.
Aviso legal permanente de uso informativo.

---

## 9. Validación y resultados: caso de estudio con cartera real *(6–8 páginas — la joya de la memoria)*

### 9.1 Metodología de validación
Reconciliación contable iterativa entre la plataforma y el bróker (capturas
paralelas DEGIRO ↔ aplicación) con una cartera real de ~25 000 €, 20+ valores y
~70 transacciones en 18 meses, incluyendo casos límite reales: split 10:1 de
Netflix, acciones en EUR (Sabadell) y DKK (Novo Nordisk), ventas en ejecuciones
parciales idénticas, posiciones cerradas.

### 9.2 Defectos detectados y corregidos (tabla resumen)
| Defecto | Síntoma observado | Causa raíz | Corrección |
|---|---|---|---|
| CAGR negativo en posiciones ganadoras | ORCL −86 % con P&L +16 % | Riqueza final omitía proceeds de ventas | Fórmula completa + supresión < 30 días |
| Posición europea a $0 permanente | SAB.MC/NOVO sin precio | Excepción 403 de Finnhub saltaba el fallback | Fallback total a Yahoo + conservar último precio |
| Novo Nordisk a ~$279 | DKK convertido con EURUSD | FX único para toda divisa | FX por divisa real (`DKKUSD=X`) |
| Split aplicado de más (NFLX ×10) | 230 acciones fantasma | Heurística sin corroboración sobre historial ya ajustado | Test de coherencia WAC/factor/referencia |
| Venta "fantasma" de Sabadell | 363 acciones tras vender todo | Fill duplicado descartado por dedupe + GUID en columna extra | Multiconjunto + rescate de GUID |
| Comisiones a cero | Coste base infravalorado | Nombre real de columna con sufijo | Resolución por prefijo + AutoFX |

### 9.3 Resultados de la reconciliación final
`[REVISAR: tras la última reimportación, tabla comparativa DEGIRO vs app por posición: nº acciones, BEP, valor, P&L — objetivo: diferencias < 1 %.]`

### 9.4 Calidad del software
72+ tests unitarios (motor WAC: 22; Monte Carlo: 9; TWR: 7; régimen: 12; splits:
10; cotizaciones: 5; PEG y matemáticas de cartera); build + lint en CI; ~10 pull
requests con previsualización desplegada antes de merge. `[FIGURA: captura del
historial de PRs.]`

### 9.5 Evaluación cualitativa del análisis IA
`[REVISAR: 2–3 ejemplos de análisis generado (captura) comentando coherencia entre
señal, métricas inyectadas y justificación; y un ejemplo de limitación.]`

---

## 10. Conclusiones y trabajo futuro *(2–3 páginas)*

### 10.1 Conclusiones
- Es viable una plataforma de análisis con rigor cuantitativo sobre infraestructura gratuita; el LLM aporta valor como **sintetizador acotado**, no como calculadora.
- La validación con datos reales es insustituible: seis defectos relevantes eran invisibles con datos sintéticos.
- El patrón "métricas deterministas + LLM con esquema validado" controla la alucinación a coste de expresividad.

### 10.2 Trabajo futuro
Backlog priorizado ya documentado (issue #63): watchlist, informe fiscal IRPF con
regla de los 2 meses, importación multi-broker, gestión de efectivo y XIRR; además:
alertas push (#18/#53), vista comparativa (#20) y evaluación cuantitativa del
acierto de las señales IA contra el mercado (backtesting de recomendaciones).

---

## 11. Bibliografía *(formato según normativa)*

Markowitz (1952); Black & Litterman (1992); Ledoit & Wolf (2004); Bollerslev (1986);
Hurst (1951); Lynch, *One Up on Wall Street* (1989); Jorion, *Value at Risk*;
documentación técnica: Next.js, Prisma, Supabase, Google Gemini API, GIPS Standards
(TWR). `[REVISAR: completar con las referencias exigidas por el centro.]`

## 12. Anexos
- A. Esquema completo de base de datos (schema.prisma)
- B. Tabla de endpoints de la API
- C. Ejemplo de prompt completo enviado a Gemini y respuesta validada
- D. Manual de usuario (capturas de los cuatro módulos)
- E. Guía de despliegue (Vercel + Supabase + variables de entorno)
