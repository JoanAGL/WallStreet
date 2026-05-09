export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
          WallStreet
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Plataforma de análisis bursátil informativo con IA.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          ⚠️ Solo con fines informativos. No constituye asesoramiento financiero.
        </p>
        <div className="pt-4">
          <p className="text-sm text-gray-400">
            Proyecto en construcción – Issue #1 completado ✓
          </p>
        </div>
      </div>
    </main>
  );
}
