"use client";

import { formatGramsAsKilograms, parseKilogramsToGrams } from "@bmp/domain";
import { useState } from "react";

export interface WeightedQuantityInputProps {
  grams: number;
  onChange: (grams: number) => void;
  autoFocus?: boolean;
  label: string;
}

/** KG-decimal input (D-008: grams are the authoritative unit; KG is only ever an input/display convention). */
export function WeightedQuantityInput({
  grams,
  onChange,
  autoFocus,
  label,
}: WeightedQuantityInputProps) {
  const [text, setText] = useState(() => (grams > 0 ? formatGramsAsKilograms(grams) : ""));

  const handleChange = (value: string) => {
    setText(value);
    try {
      onChange(value.trim() === "" ? 0 : parseKilogramsToGrams(value));
    } catch {
      // Invalid/incomplete input while typing (e.g. "1.") -- keep the
      // text as typed without propagating an invalid grams value yet.
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoFocus={autoFocus}
      value={text}
      onChange={(event) => handleChange(event.target.value)}
      placeholder="0.000 kg"
      aria-label={label}
      className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
    />
  );
}
