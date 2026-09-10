"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "../../lib/api/error";
import { useAuth } from "../../lib/auth/session-context";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Ingresá tu usuario o email."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { status, user, login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  // Already has a session (e.g. navigated back to /login manually) --
  // send them straight to where root ("/") would have sent them.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(user?.activeBusinessId ? `/${user.activeBusinessId}` : "/select-business");
    }
  }, [status, user, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.identifier, values.password);
    } catch (error) {
      setFormError(
        isApiError(error) ? error.message : "No se pudo iniciar sesión. Intentá de nuevo.",
      );
    }
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <form
        onSubmit={onSubmit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 p-8 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-gray-900">Iniciar sesión</h1>

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
            Usuario o email
          </label>
          <input
            id="identifier"
            type="text"
            autoComplete="username"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            {...register("identifier")}
          />
          {errors.identifier && (
            <p className="mt-1 text-sm text-red-600">{errors.identifier.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            {...register("password")}
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-accent text-accent-foreground w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
