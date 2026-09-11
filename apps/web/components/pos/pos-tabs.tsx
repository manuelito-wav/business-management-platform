"use client";

import { useCartStore } from "../../lib/pos/cart";

/**
 * SPECS.md 6.4: "The POS must support multiple concurrent sale tabs. The
 * behavior should resemble browser tabs... Each sale tab should maintain
 * its own independent state until completed or cancelled." A thin strip
 * above the current-sale section: click a tab to switch to it, "+"
 * starts a new one, "x" closes one (hidden while only one tab remains --
 * SPECS.md has no "zero tabs" state, see cart.ts's closeTab).
 */
export function PosTabs() {
  const tabs = useCartStore((state) => state.tabs);
  const activeTabId = useCartStore((state) => state.activeTabId);
  const selectTab = useCartStore((state) => state.selectTab);
  const addTab = useCartStore((state) => state.addTab);
  const closeTab = useCartStore((state) => state.closeTab);

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`flex shrink-0 items-center gap-1 rounded-t border-b-2 px-2 py-1 text-sm ${
              isActive
                ? "border-gray-900 bg-white font-medium text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <button
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={isActive ? "true" : undefined}
              className="max-w-[8rem] truncate"
            >
              {tab.label}
              {tab.lines.length > 0 && ` (${tab.lines.length})`}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                onClick={() => closeTab(tab.id)}
                aria-label={`Cerrar ${tab.label}`}
                className="text-gray-400 hover:text-red-600"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addTab}
        aria-label="Nueva venta"
        className="ml-1 shrink-0 rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
      >
        +
      </button>
    </div>
  );
}
