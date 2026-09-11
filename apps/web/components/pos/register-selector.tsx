"use client";

import { useState } from "react";
import { isApiError } from "../../lib/api/error";
import { useConfiguration } from "../../lib/configuration/queries";
import { useOpenRegisterSession, useRegisters } from "../../lib/registers/queries";
import type { Register } from "../../lib/registers/types";

export interface RegisterSelectorProps {
  businessId: string;
}

/**
 * SPECS.md 15.2's employee flow starts "Login -> Select Register -> Sell"
 * -- the POS workspace has nothing coherent to operate on without an open
 * register session (ROADMAP.md Phase 4 "Depends on... an open authorized
 * register session"). Every backend piece here (registers, sessions,
 * registerPolicy) already shipped in Phase 2; this is its first UI.
 */
export function RegisterSelector({ businessId }: RegisterSelectorProps) {
  const {
    data: registers,
    isPending: registersLoading,
    isError: registersError,
  } = useRegisters(businessId);
  const { data: configuration } = useConfiguration(businessId);
  const openSession = useOpenRegisterSession(businessId);
  const [openingAmountInput, setOpeningAmountInput] = useState("");
  const [pendingRegisterId, setPendingRegisterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requireOpeningAmount = configuration?.registerPolicy.requireOpeningAmount ?? false;

  const handleOpen = async (register: Register) => {
    setError(null);
    if (requireOpeningAmount && openingAmountInput.trim() === "") {
      setError("Este negocio requiere un monto de apertura.");
      return;
    }
    const openingAmount = openingAmountInput.trim()
      ? Math.round(Number(openingAmountInput) * 100)
      : undefined;
    setPendingRegisterId(register.id);
    try {
      await openSession.mutateAsync({ registerId: register.id, openingAmount });
    } catch (err) {
      setError(isApiError(err) ? err.message : "No se pudo abrir la caja.");
    } finally {
      setPendingRegisterId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-lg font-semibold text-gray-900">Elegí una caja</h1>
      <p className="mt-1 text-sm text-gray-500">
        Necesitás abrir una sesión de caja para empezar a vender.
      </p>

      {requireOpeningAmount && (
        <div className="mt-4">
          <label htmlFor="opening-amount" className="block text-sm font-medium text-gray-700">
            Monto de apertura
          </label>
          <input
            id="opening-amount"
            type="text"
            inputMode="decimal"
            value={openingAmountInput}
            onChange={(event) => setOpeningAmountInput(event.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {registersLoading && <p className="mt-4 text-sm text-gray-500">Cargando...</p>}
      {registersError && (
        <p className="mt-4 text-sm text-red-600">No se pudieron cargar las cajas.</p>
      )}
      {registers && registers.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">
          Todavía no hay cajas configuradas para este negocio.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {registers?.map((register) => (
          <li key={register.id}>
            <button
              type="button"
              disabled={register.status !== "active" || pendingRegisterId === register.id}
              onClick={() => void handleOpen(register)}
              className="w-full rounded border border-gray-200 px-4 py-3 text-left hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block font-medium text-gray-900">{register.name}</span>
              {register.status !== "active" && (
                <span className="block text-sm text-gray-500">Inactiva</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </main>
  );
}
