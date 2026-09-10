import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StandardQuests } from "@/components/standard-quests";
import type { StandardState } from "@/modules/quests/standard/view";
import type { HomeRecommendation } from "@/modules/recommendations/service";
import type { ChallengeState } from "@/modules/challenges/service";

const quest = (id: string, status: "AVAILABLE" | "ACCEPTED" | "EXPIRED", title: string) => ({ id, definitionId: `definition-${id}`, stableKey: id, title, description: "Useful description", status, difficulty: "EASY", baseXp: 100, estimatedMinutes: 10, completionWindowHours: 24, completionType: "SINGLE", completionTarget: 1, currentProgress: 0, skills: [{ skillCode: "F", rewardPercent: 100, isPrimary: true }], acceptedAt: status !== "AVAILABLE" ? "2026-09-09T12:00:00.000Z" : null, deadlineAt: status !== "AVAILABLE" ? "2026-09-10T12:00:00.000Z" : null, failurePenaltyXp: status === "EXPIRED" ? 20 : null, failurePenaltyAppliedAt: null, clearedAt: null, canReroll: status === "AVAILABLE", nextDifficulty: null });
const state = { overallLevel: 1, overallXp: 0, overallProgress: { levelStartXp: 0, nextLevelXp: 1000, xpIntoLevel: 0, xpToNextLevel: 1000 }, resolution: null, timezone: "UTC", skills: [{ id: "skill-f", code: "F", name: "Fitness", description: "Fitness", currentXp: 0, lifetimeXp: 0, currentLevel: 1, levelProgress: { levelStartXp: 0, nextLevelXp: 300, xpIntoLevel: 0, xpToNextLevel: 300 }, currentStreakDays: 0, longestStreakDays: 0, streakActive: false, streakBonusPercent: 0, nextStreakTier: null, slots: [{ id: "slot-1", slotNumber: 1, quest: quest("available", "AVAILABLE", "Available quest") }, { id: "slot-2", slotNumber: 2, quest: quest("accepted", "ACCEPTED", "Accepted quest") }] }] } as unknown as StandardState;
const recommendation = { playerQuestId: "available", slotId: "slot-1", skillCode: "F", skillName: "Fitness", title: "Available quest", description: "Useful description", difficulty: "EASY", estimatedMinutes: 10, reasonCodes: [], calculatedAt: "2026-09-09T12:00:00.000Z" } satisfies HomeRecommendation;
const alternative = { ...recommendation, playerQuestId: "different", slotId: "slot-3", title: "Different quest", differentAvailable: true };
const challengeQuest = (id: string, poolType: "DAILY" | "WEEKLY", status: "AVAILABLE" | "ACCEPTED" | "COMPLETED" | "EXPIRED", completionType: "SINGLE" | "COUNT" = "SINGLE") => ({ id, title: `${id} title`, description: "Challenge description", difficulty: "MEDIUM", baseXp: 120, estimatedMinutes: 15, completionType, target: completionType === "COUNT" ? 3 : 1, currentProgress: completionType === "COUNT" ? 1 : 0, status, poolType, windowEndAt: "2026-09-11T12:00:00.000Z", skills: [{ skillCode: "F", rewardPercent: 100, isPrimary: true }], primarySkill: "F", challengeBonusPercent: poolType === "DAILY" ? 10 : 15 });
const challenges = { timezone: "UTC", daily: { id: "daily-set", poolType: "DAILY", windowStartAt: "2026-09-09T00:00:00.000Z", windowEndAt: "2026-09-10T00:00:00.000Z", completedCount: 1, totalCount: 4, setBonusXp: 100, setBonusAwarded: false, quests: [challengeQuest("daily-active", "DAILY", "ACCEPTED"), challengeQuest("daily-available", "DAILY", "AVAILABLE"), challengeQuest("daily-complete", "DAILY", "COMPLETED"), challengeQuest("daily-expired", "DAILY", "EXPIRED")] }, weekly: { id: "weekly-set", poolType: "WEEKLY", windowStartAt: "2026-09-07T00:00:00.000Z", windowEndAt: "2026-09-14T00:00:00.000Z", completedCount: 0, totalCount: 1, setBonusXp: 300, setBonusAwarded: false, quests: [challengeQuest("weekly-active", "WEEKLY", "ACCEPTED", "COUNT")] } } as unknown as ChallengeState;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Standard quest interaction stability", () => {
  it("shows a structured accepted Standard count including a visible zero state", () => {
    const { unmount } = render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    expect(screen.getByLabelText("1 active Standard quest")).toHaveTextContent("1 active");
    const noneAccepted = { ...state, skills: [{ ...state.skills[0], slots: state.skills[0].slots.map((slot) => ({ ...slot, quest: { ...slot.quest, status: "AVAILABLE" as const } })) }] } as unknown as StandardState;
    unmount(); render(<StandardQuests initial={noneAccepted} initialRecommendation={recommendation} />);
    expect(screen.getByLabelText("0 active Standard quests")).toHaveTextContent("0 active");
    cleanup(); const bothAccepted = { ...state, skills: [{ ...state.skills[0], slots: state.skills[0].slots.map((slot) => ({ ...slot, quest: { ...slot.quest, status: "ACCEPTED" as const } })) }] } as unknown as StandardState;
    render(<StandardQuests initial={bothAccepted} initialRecommendation={recommendation} />);
    expect(screen.getByLabelText("2 active Standard quests")).toHaveTextContent("2 active");
  });

  it("renders neutral available, labeled green active, and labeled red expired Standard cards", () => {
    const states = { ...state, skills: [{ ...state.skills[0], slots: [...state.skills[0].slots, { id: "slot-3", slotNumber: 3, quest: quest("expired", "EXPIRED", "Expired quest") }] }] } as unknown as StandardState;
    render(<StandardQuests initial={states} initialRecommendation={recommendation} />);
    fireEvent.click(screen.getByRole("button", { name: /Fitness/ }));
    expect(document.querySelector('[data-quest-id="available"]')).toHaveClass("status-border-available");
    expect(document.querySelector('[data-quest-id="accepted"]')).toHaveClass("status-border-accepted");
    expect(within(document.querySelector('[data-quest-id="accepted"]') as HTMLElement).getByText("Active")).toBeVisible();
    const expired = document.querySelector('[data-quest-id="expired"]') as HTMLElement;
    expect(expired).toHaveClass("status-border-expired"); expect(within(expired).getByText("Expired")).toBeVisible(); expect(expired).toHaveTextContent("XP has not changed yet");
    expect(screen.getByLabelText("1 active Standard quest")).toBeVisible();
  });

  it("preserves the open Skill after accepting refreshed quest data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => state }).mockResolvedValueOnce({ ok: true, json: async () => recommendation }));
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    const trigger = screen.getByRole("button", { name: /Fitness/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await screen.findByText("Quest accepted. Your deadline has started.");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cancels without mutation and submits abandonment only once while pending", async () => {
    let resolveRequest!: (value: unknown) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveRequest = resolve; })).mockResolvedValueOnce({ ok: true, json: async () => recommendation });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    const active = screen.getAllByRole("heading", { name: "Accepted quest" })[0].closest("article")!;
    fireEvent.click(within(active).getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(within(active).getByRole("button", { name: "Abandon" }));
    const confirm = screen.getByRole("button", { name: "Abandon quest" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Abandoning…" })).toBeDisabled();
    resolveRequest({ ok: true, json: async () => state });
    await screen.findByText(/Quest abandoned/);
  });

  it("shows abandonment request failures in the application", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Penalty service unavailable." } }) }));
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    const active = screen.getAllByRole("heading", { name: "Accepted quest" })[0].closest("article")!;
    fireEvent.click(within(active).getByRole("button", { name: "Abandon" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon quest" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Penalty service unavailable.");
  });

  it("accepts the exact recommended PlayerQuest and refreshes Home state", async () => {
    const accepted = { ...state, skills: [{ ...state.skills[0], slots: state.skills[0].slots.map((slot) => slot.id === "slot-1" ? { ...slot, quest: quest("available", "ACCEPTED", "Available quest") } : slot) }] } as unknown as StandardState;
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => accepted })
      .mockResolvedValueOnce({ ok: true, json: async () => alternative })
      .mockResolvedValueOnce({ ok: true, json: async () => accepted })
      .mockResolvedValueOnce({ ok: true, json: async () => alternative });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept quest" }));
    await screen.findByText("Quest accepted. Your deadline has started.");
    expect(fetcher.mock.calls[0][0]).toBe("/api/quests/standard/available/accept");
    expect(screen.getAllByRole("heading", { name: "Available quest" })[0].closest("article")).toHaveClass("active-quest");
    expect(screen.getByText("Different quest")).toBeInTheDocument();
  });

  it("requests and renders a different recommendation without changing slots", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => alternative });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    const slotIds = Array.from(document.querySelectorAll("[data-slot-id]")).map((node) => node.getAttribute("data-slot-id"));
    fireEvent.click(screen.getByRole("button", { name: "Something different" }));
    await screen.findByText("Here is another available quest.");
    expect(screen.getByText("Different quest")).toBeInTheDocument();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ playerQuestId: "available" });
    expect(Array.from(document.querySelectorAll("[data-slot-id]")).map((node) => node.getAttribute("data-slot-id"))).toEqual(slotIds);
  });

  it("prevents duplicate recommendation actions while a request is pending", () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    const different = screen.getByRole("button", { name: "Something different" });
    fireEvent.click(different); fireEvent.click(different);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Finding another…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept quest" })).toBeDisabled();
  });

  it("retains the recommendation and explains when no alternative exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...recommendation, differentAvailable: false }) }));
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    fireEvent.click(screen.getByRole("button", { name: "Something different" }));
    await screen.findByText("No different available quest can currently be suggested.");
    expect(screen.getAllByText("Available quest")).toHaveLength(2);
  });

  it("shows only accepted Challenge quests in Active Quests with pool labels and shared actions", async () => {
    const completed = { ...challenges, daily: { ...challenges.daily, quests: challenges.daily.quests.map((item) => item.id === "daily-active" ? { ...item, status: "COMPLETED" as const } : item) } } as ChallengeState;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => completed }));
    render(<StandardQuests initial={state} initialRecommendation={recommendation} initialChallenges={challenges} />);
    expect(document.querySelectorAll("[data-active-quest-id]")).toHaveLength(3);
    expect(document.querySelector('[data-active-quest-id="daily-active"]')).toHaveTextContent("Daily Challenge");
    expect(document.querySelector('[data-active-quest-id="weekly-active"]')).toHaveTextContent("Weekly Challenge");
    expect(document.querySelector('[data-active-quest-id="daily-available"]')).toBeNull();
    const dailyActive = document.querySelector('[data-active-quest-id="daily-active"]')!;
    fireEvent.click(within(dailyActive as HTMLElement).getByRole("button", { name: "Complete" }));
    await screen.findByText("Challenge completed and rewards applied.");
    expect(document.querySelector('[data-active-quest-id="daily-active"]')).toBeNull();
    expect(document.querySelector('[data-active-quest-id="weekly-active"]')).toHaveTextContent("1/3");
  });
});
