import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog, DifficultyBadge, Feedback, ProgressBar, SkillBadge, StatusBadge } from "@/components/game-ui";

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

  it("traps focus and supports Escape dismissal for confirmations", () => {
    const cancel = vi.fn();
    render(<ConfirmationDialog open title="Abandon quest?" confirmLabel="Abandon quest" pending={false} onCancel={cancel} onConfirm={vi.fn()}><p>Quest name</p></ConfirmationDialog>);
    const dialog = screen.getByRole("alertdialog", { name: "Abandon quest?" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
