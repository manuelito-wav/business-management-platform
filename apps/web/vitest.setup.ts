import "@testing-library/jest-dom/vitest";
// jsdom does not implement IndexedDB -- polyfill it for any test that
// touches the Dexie-backed POS reference cache (lib/pos-cache).
import "fake-indexeddb/auto";
