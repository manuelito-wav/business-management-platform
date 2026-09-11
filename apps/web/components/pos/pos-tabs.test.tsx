import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useCartStore } from "../../lib/pos/cart";
import { PosTabs } from "./pos-tabs";

beforeEach(() => {
  useCartStore.getState().resetForBusiness("biz-tabs-test");
});

describe("PosTabs", () => {
  it("shows a single tab with no close button when it is the only one", () => {
    render(<PosTabs />);

    expect(screen.getByRole("button", { name: "Venta 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cerrar/ })).not.toBeInTheDocument();
  });

  it("adds and switches to a new tab when '+' is clicked", async () => {
    render(<PosTabs />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Nueva venta" }));

    expect(screen.getByRole("button", { name: "Venta 2" })).toBeInTheDocument();
    expect(useCartStore.getState().tabs).toHaveLength(2);
    const secondTab = useCartStore.getState().tabs[1]!;
    expect(useCartStore.getState().activeTabId).toBe(secondTab.id);
  });

  it("switches the active tab when clicking a different one", async () => {
    useCartStore.getState().addTab();
    const firstTabId = useCartStore.getState().tabs[0]!.id;
    const user = userEvent.setup();
    render(<PosTabs />);

    await user.click(screen.getByRole("button", { name: "Venta 1" }));

    expect(useCartStore.getState().activeTabId).toBe(firstTabId);
  });

  it("closes a tab and falls back to another one", async () => {
    useCartStore.getState().addTab();
    const user = userEvent.setup();
    render(<PosTabs />);

    await user.click(screen.getByRole("button", { name: "Cerrar Venta 2" }));

    expect(screen.queryByRole("button", { name: "Venta 2" })).not.toBeInTheDocument();
    expect(useCartStore.getState().tabs).toHaveLength(1);
  });

  it("shows the line count next to a tab's label once it has items", () => {
    useCartStore.getState().addProduct(
      {
        id: "prod-1",
        businessId: "biz-tabs-test",
        categoryId: "cat-1",
        name: "Cola",
        saleMode: "unit",
        weightUnit: null,
        imageUrl: null,
        status: "active",
        salePrice: 10000,
        identifiers: [],
      },
      1,
    );
    render(<PosTabs />);

    expect(screen.getByRole("button", { name: "Venta 1 (1)" })).toBeInTheDocument();
  });
});
