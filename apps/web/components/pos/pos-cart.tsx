"use client";

import { formatMoney } from "../../lib/catalog/money";
import { useActiveTab, useCartStore } from "../../lib/pos/cart";
import { computeCartTotal, computeLineTotal } from "../../lib/pos/totals";
import { WeightedQuantityInput } from "./weighted-quantity-input";

/**
 * SPECS.md 6.2's "Left Section: Current Sale" -- products, quantity
 * controls, individual prices, and the total, for whichever tab is
 * currently active (SPECS.md 6.4: multiple sale tabs, PosTabs switches
 * between them). Promotions/discounts are intentionally absent: no
 * promotion evaluator exists yet (ROADMAP.md Phase 5), so there is
 * nothing real to show there.
 */
export function PosCart() {
  const { lines } = useActiveTab();
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeLine = useCartStore((state) => state.removeLine);
  const clear = useCartStore((state) => state.clear);

  const total = computeCartTotal(lines);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Venta actual</h2>
        {lines.length > 0 && (
          <button type="button" onClick={clear} className="text-xs text-gray-500 underline">
            Vaciar
          </button>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto p-4">
        {lines.length === 0 && (
          <li className="text-sm text-gray-400">Buscá o escaneá un producto para empezar.</li>
        )}
        {lines.map((line) => {
          const lineTotal = computeLineTotal(line);
          return (
            <li
              key={line.productId}
              className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{line.name}</p>
                <p className="text-xs text-gray-500">
                  {line.unitPrice === null
                    ? "Sin precio"
                    : line.saleMode === "weighted"
                      ? `${formatMoney(line.unitPrice)}/kg`
                      : formatMoney(line.unitPrice)}
                </p>
              </div>

              {line.saleMode === "unit" ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.productId, Math.max(1, line.quantity - 1))}
                    aria-label={`Restar unidad de ${line.name}`}
                    className="h-7 w-7 rounded border border-gray-300 text-sm"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) =>
                      setQuantity(line.productId, Math.max(1, Number(event.target.value) || 1))
                    }
                    aria-label={`Cantidad de ${line.name}`}
                    className="w-12 rounded border border-gray-300 px-1 py-1 text-center text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(line.productId, line.quantity + 1)}
                    aria-label={`Sumar unidad de ${line.name}`}
                    className="h-7 w-7 rounded border border-gray-300 text-sm"
                  >
                    +
                  </button>
                </div>
              ) : (
                <WeightedQuantityInput
                  grams={line.quantity}
                  onChange={(grams) => setQuantity(line.productId, grams)}
                  label={`Peso de ${line.name}`}
                />
              )}

              <span className="w-20 shrink-0 text-right text-sm font-medium text-gray-900">
                {lineTotal === null ? "--" : formatMoney(lineTotal)}
              </span>

              <button
                type="button"
                onClick={() => removeLine(line.productId)}
                aria-label={`Quitar ${line.name}`}
                className="shrink-0 text-gray-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-between text-base font-semibold text-gray-900">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}
