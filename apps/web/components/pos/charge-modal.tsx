"use client";

import { formatMoney } from "../../lib/catalog/money";
import { useActiveTab } from "../../lib/pos/cart";
import { computeCartTotal } from "../../lib/pos/totals";
import { Dialog } from "../ui/dialog";

export interface ChargeModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * SPECS.md 6.6: "Charge... Opening a compact modal/dialog while keeping
 * the underlying sale visible." Payment methods (cash/QR/card/transfer,
 * split payments) are ROADMAP.md's own later checkpoint ("add split
 * payment settlement") -- this establishes the interaction shell only,
 * honestly, rather than fabricating payment functionality that doesn't
 * exist yet.
 */
export function ChargeModal({ open, onClose }: ChargeModalProps) {
  const { lines } = useActiveTab();
  const total = computeCartTotal(lines);

  return (
    <Dialog open={open} onClose={onClose} title="Cobrar">
      <p className="text-sm text-gray-600">
        {lines.length} {lines.length === 1 ? "producto" : "productos"}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatMoney(total)}</p>
      <p className="mt-4 text-sm text-gray-500">
        Los métodos de pago (efectivo, QR, tarjeta, transferencia) se habilitan en un próximo paso
        del desarrollo.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="bg-accent text-accent-foreground mt-4 w-full rounded px-3 py-2 text-sm font-medium"
      >
        Volver a la venta
      </button>
    </Dialog>
  );
}
