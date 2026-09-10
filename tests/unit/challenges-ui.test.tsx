import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Challenges } from "@/components/challenges";
import type { ChallengeState } from "@/modules/challenges/service";

const quest = (id: string, poolType: "DAILY" | "WEEKLY") => ({ id, title: `${id} quest`, description: "Description", difficulty: "EASY", baseXp: 100, estimatedMinutes: 10, completionType: "SINGLE", target: 1, currentProgress: 0, status: "AVAILABLE", poolType, windowEndAt: "2026-09-12T00:00:00.000Z", skills: [{ skillCode: "F", rewardPercent: 100, isPrimary: true }], primarySkill: "F", challengeBonusPercent: poolType === "DAILY" ? 10 : 15 });
const state = { timezone: "UTC", daily: { id: "daily-a", poolType: "DAILY", windowStartAt: "2026-09-09T00:00:00.000Z", windowEndAt: "2026-09-10T00:00:00.000Z", completedCount: 0, totalCount: 1, setBonusXp: 100, setBonusAwarded: false, quests: [quest("daily", "DAILY")] }, weekly: { id: "weekly-a", poolType: "WEEKLY", windowStartAt: "2026-09-07T00:00:00.000Z", windowEndAt: "2026-09-14T00:00:00.000Z", completedCount: 0, totalCount: 1, setBonusXp: 300, setBonusAwarded: false, quests: [quest("weekly", "WEEKLY")] } } as unknown as ChallengeState;

afterEach(cleanup);

describe("Challenge accordions", () => {
  it("expands independently, exposes state, and keeps action clicks outside triggers", () => {
    const action = vi.fn(); const { rerender } = render(<Challenges state={state} busy={null} message="" error="" onAction={action} />);
    const daily = screen.getByRole("region", { name: "Daily Challenges" }); const weekly = screen.getByRole("region", { name: "Weekly Challenges" });
    const dailyTrigger = within(daily).getByRole("button", { name: /Daily Challenges/ }); const weeklyTrigger = within(weekly).getByRole("button", { name: /Weekly Challenges/ });
    expect(dailyTrigger).toHaveAttribute("aria-expanded", "false"); expect(weeklyTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(dailyTrigger); fireEvent.click(within(daily).getByRole("button", { name: "Accept" }));
    expect(action).toHaveBeenCalledWith("daily", "accept"); expect(dailyTrigger).toHaveAttribute("aria-expanded", "true");
    rerender(<Challenges state={{ ...state }} busy={null} message="Challenge accepted." error="" onAction={action} />);
    expect(dailyTrigger).toHaveAttribute("aria-expanded", "true"); expect(weeklyTrigger).toHaveAttribute("aria-expanded", "false");
  });

  it("uses native buttons for keyboard-operable pool triggers and retains collapsed summaries", () => {
    render(<Challenges state={state} busy={null} message="" error="" onAction={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Daily Challenges/ });
    expect(trigger).toHaveAttribute("aria-controls", "challenge-panel-daily");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("progressbar", { name: "Daily set progress" })).toBeVisible();
    expect(within(trigger).getByText(/Ends/)).toBeVisible();
  });
});
