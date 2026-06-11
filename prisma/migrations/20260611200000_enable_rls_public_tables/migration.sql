-- Activa Row Level Security en todas las tablas del esquema public.
--
-- Supabase expone el esquema public vía PostgREST (API REST con anon key);
-- sin RLS, las tablas serían potencialmente accesibles desde fuera. Esta app
-- accede SIEMPRE vía Prisma con el rol postgres (propietario de las tablas,
-- al que RLS no aplica salvo FORCE), así que activar RLS sin definir
-- políticas bloquea PostgREST por completo sin afectar a la aplicación.
ALTER TABLE "_prisma_migrations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserProfile"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PortfolioAnalysis"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Stock"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClosedOperation"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockAnalysis"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockAnalysisHistory"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualSellEntry"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CacheEntry"            ENABLE ROW LEVEL SECURITY;
