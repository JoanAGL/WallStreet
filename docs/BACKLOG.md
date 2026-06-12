# Backlog de nuevas funcionalidades — auditoría completa (junio 2026)

> Registrado como issue #63. Backlog identificado tras auditoría del código, el
> historial de transacciones DEGIRO y los cuatro apartados de la app (Dashboard,
> Rendimiento, Simulación, Insights). No duplica las issues abiertas #18 (alertas),
> #19 (auto-refresh), #20 (vista comparativa) ni #53 (webhooks).

## Estado (actualizado 12/06/2026)

| # | Feature | Estado |
|---|---------|--------|
| 1 | Splits y contrasplits | ✅ PRs #65 (motor + UI), #68 (detección automática), #70 (corroboración) |
| 2 | Comisiones y dividendos | ✅ PR #65 |
| 3 | Equity curve + TWR | ✅ PR #71 (el benchmark SPY real se adelantó en #64) |
| 4 | Informe fiscal (IRPF) | ⬜ Pendiente |
| 5 | Watchlist | ⬜ Pendiente (el contador del límite ya ignora cerradas, #64) |
| 6 | Multi-broker | ⬜ Pendiente |
| 7 | Efectivo y aportaciones | ⬜ Pendiente |

El clasificador de régimen de mercado (issue #49) también quedó implementado en #71.

---

## 1. ✅ Gestión de splits y acciones corporativas

**Motivación:** el split 10:1 de NFLX (nov 2025) es visible en los datos reales: precio
medio de venta de **1.112,17 US$** conviviendo con precio actual de 81,41 US$ y compra
media de 96,55 US$. Las transacciones pre-split no se ajustan, lo que distorsiona el WAC,
el PnL realizado, el precio medio de venta y hace que el detector de «ventas prematuras»
descarte el caso por el filtro de ratio >5×.

- Nuevo tipo de transacción `SPLIT` (ratio N:M) o tabla `CorporateAction`
- Ajuste retroactivo de shares/price en `calculatePositionMetrics` al cruzar la fecha del split
- Detección automática opcional vía Yahoo Finance (`events=splits` del endpoint chart)
- UI en el TransactionPanel para registrar un split manualmente

## 2. ✅ Comisiones y dividendos en el motor de transacciones

**Motivación:** el CSV de DEGIRO incluye columnas de costes de transacción que hoy se
descartan, y varias posiciones pagan dividendo (ORCL 1.0%, CRM 1.0%, NVDA 0.5%) que no se
refleja en el P&L. El rendimiento mostrado está sobreestimado.

- Campo `fee Float?` en `Transaction` + parseo de la columna de costes en `importService`
- Nuevo tipo `DIVIDEND` (importe, fecha, retención) con import automático desde el CSV de DEGIRO (Account statements)
- P&L neto de comisiones en `transactionService` y `/dashboard/portfolio`
- **Break-even real**: `breakEvenPrice = (openCostBasis − realizedPnL + fees) / openShares`
  en lugar del actual `breakEvenPrice = avgBuyPrice` (hoy «Precio equilibrio» siempre
  duplica el precio medio de compra y no aporta información)

## 3. ✅ Curva de evolución de cartera (equity curve) con TWR y benchmark continuo

**Motivación:** no existe ninguna vista de la evolución temporal del valor de la cartera.
Además, el benchmark de Insights usa una tabla `SPY_HISTORY` hardcodeada con interpolación
lineal en `decisionAnalysisService.ts`, lo que limita la precisión del alpha (−17.56% mostrado).

- Snapshot diario del valor de cartera (cron existente) en una tabla `PortfolioSnapshot`
- Gráfico de evolución (valor, coste base, PnL) en `/dashboard/portfolio`
- Time-Weighted Return (TWR) y Money-Weighted Return (XIRR) como métricas de rentabilidad reales
- Sustituir `SPY_HISTORY` por histórico real de Yahoo Finance con caché

## 4. Informe fiscal exportable (IRPF España)

**Motivación:** el Tax Harvesting ya referencia el art. 33 LIRPF, pero no hay forma de
exportar las ganancias/pérdidas realizadas del año fiscal para la declaración.

- Vista/export CSV o PDF por año fiscal: operaciones cerradas con fecha, coste, venta, resultado
- Detección de la regla de los 2 meses (recompra del mismo valor tras venta con pérdida → pérdida no computable)
- Agregado por valor y total anual compensable

## 5. Watchlist separada del límite de cartera

**Motivación:** el límite de 20 acciones se consume con posiciones históricas ya cerradas
(la app muestra «Límite alcanzado (20/20)» con solo 8 posiciones abiertas). Una watchlist
permitiría seguir tickers sin posición sin consumir plazas ni coste de análisis IA completo.

- Tabla `WatchlistItem` (ticker, userId) sin análisis Gemini (solo precio + cambio diario)
- Promoción directa watchlist → cartera al registrar la primera compra
- Relacionado: el contador del límite debería ignorar posiciones cerradas (`quantity = 0`)

## 6. Importación multi-broker

**Motivación:** el motor de importación está acoplado al formato DEGIRO. El parser
defensivo (BOM, decimales europeos, ejecuciones parciales, dedupe) es reutilizable.

- Capa de mapeo por broker: Interactive Brokers (Flex Query CSV), Trading212, eToro, XTB
- Autodetección de formato por cabeceras
- Reutilizar resolución de ticker por ISIN y deduplicación existentes

## 7. Gestión de efectivo y aportaciones

**Motivación:** sin registrar depósitos/retiradas no se puede calcular la rentabilidad
sobre el capital aportado ni saber el % invertido vs. liquidez.

- Transacciones de tipo `DEPOSIT` / `WITHDRAWAL` (importables del CSV de DEGIRO)
- Saldo de efectivo en el resumen de cartera y % invertido
- Base para XIRR (punto 3) y para la simulación Monte Carlo con aportaciones reales

---

## Priorización sugerida (restante)

| Prioridad | Feature | Razón |
|---|---|---|
| Media | 5. Watchlist | Seguimiento sin coste de análisis |
| Baja | 4. Informe fiscal | Estacional (campaña renta) |
| Baja | 6. Multi-broker, 7. Cash | Dependen de adopción |
