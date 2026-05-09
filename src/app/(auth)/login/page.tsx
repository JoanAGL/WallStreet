import LoginForm from "@/components/auth/LoginForm";

interface Props {
  searchParams: { registered?: string };
}

export default function LoginPage({ searchParams }: Props) {
  return (
    <>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        Iniciar sesión
      </h2>

      {searchParams.registered === "1" && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">
          Cuenta creada correctamente. Ya puedes iniciar sesión.
        </p>
      )}

      <LoginForm />
    </>
  );
}
