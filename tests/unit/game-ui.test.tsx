import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DifficultyBadge, Feedback, ProgressBar, SkillBadge, StatusBadge } from "@/components/game-ui";

describe("game UI primitives", () => {
  it("exposes progress semantics and clamps its visual value", () => {
    render(<ProgressBar value={12} max={10} label="Daily set progress" />);
    const progress = screen.getByRole("progressbar", { name: "Daily set progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "10");
    expect(progress.firstElementChild).toHaveStyle({ width: "100%" });
  });

  it("renders skill, difficulty, and status as text rather than color alone", () => {
    render(<><SkillBadge code="F" name="Fitness" /><DifficultyBadge difficulty="HARD" /><StatusBadge status="EXPIRED" /></>);
    expect(screen.getByText("Fitness")).toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("uses assertive semantics for errors and polite semantics for success", () => {
    const { rerender } = render(<Feedback message="Quest accepted." error="" />);
    expect(screen.getByRole("status")).toHaveTextContent("Quest accepted.");
    rerender(<Feedback message="" error="Please try again." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Please try again.");
  });
});
