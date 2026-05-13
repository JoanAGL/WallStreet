export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">My Personal Advisor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Análisis bursátil informativo
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {children}
        </div>
      </div>

      <footer className="mt-8 text-xs text-gray-400 text-center">
        Developed by Joan Antoni González
      </footer>
    </div>
  );
}
