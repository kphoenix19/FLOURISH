import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Landing } from "@/components/landing";

describe("foundation home", () => {
  it("identifies the FLOURISH application", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { name: "FLOURISH" })).toBeInTheDocument();
    expect(screen.getByText(/Your real life is the game/)).toBeInTheDocument();
  });
});
