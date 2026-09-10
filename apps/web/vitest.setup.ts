import "@testing-library/jest-dom/vitest";
// jsdom does not implement IndexedDB -- polyfill it for any test that
// touches the Dexie-backed POS reference cache (lib/pos-cache).
import "fake-indexeddb/auto";

// jsdom does not implement <dialog>'s showModal()/close() (used by
// components/ui/dialog.tsx for every modal form) -- a minimal polyfill so
// component tests can open/close dialogs without a real browser.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
