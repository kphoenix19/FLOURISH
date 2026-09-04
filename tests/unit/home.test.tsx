import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("foundation home", () => {
  it("identifies the FLOURISH application", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "FLOURISH" })).toBeInTheDocument();
    expect(screen.getByText(/Your real life is the game/)).toBeInTheDocument();
  });
});
