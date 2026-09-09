import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerShell } from "../../src/components/player-shell";

describe("player navigation", () => {
  it("exposes Profile in the product navigation and keeps Settings reachable", () => {
    render(<PlayerShell><h1>Content</h1></PlayerShell>);
    const mobile = screen.getByRole("navigation", { name: "Mobile player navigation" });
    expect(within(mobile).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("navigation", { name: "Player navigation" }).querySelector('a[href="/settings"]')).not.toBeNull();
  });
});
