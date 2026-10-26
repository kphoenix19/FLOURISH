import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const challenges = { timezone: "UTC", daily: { id: "daily-set", poolType: "DAILY", windowStartAt: "2026-09-09T00:00:00.000Z", windowEndAt: "2026-09-10T00:00:00.000Z", completedCount: 1, totalCount: 4, setBonusXp: 100, setBonusAwarded: false, quests: [challengeQuest("daily-active", "DAILY", "ACCEPTED"), challengeQuest("daily-available", "DAILY", "AVAILABLE"), challengeQuest("daily-complete", "DAILY", "COMPLETED"), challengeQuest("daily-expired", "DAILY", "EXPIRED")] }, weekly: { id: "weekly-set", poolType: "WEEKLY", windowStartAt: "2026-09-07T00:00:00.000Z", windowEndAt: "2026-09-14T00:00:00.000Z", completedCount: 0, totalCount: 1, setBonusXp: 300, setBonusAwarded: false, quests: [challengeQuest("weekly-active", "WEEKLY", "ACCEPTED", "COUNT")] } } as unknown as ChallengeState & { daily: NonNullable<ChallengeState["daily"]>; weekly: NonNullable<ChallengeState["weekly"]> };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Standard quest interaction stability", () => {
  it("keeps Home progression and active Weekly actions visible during a Daily scheduling gap", () => {
    render(<StandardQuests initial={state} initialRecommendation={null} initialChallenges={{ ...challenges, daily: null, nextDailyStartsAt: "2026-10-27T06:00:00.000Z" }} />);
    expect(screen.getByRole("heading", { name: "Overall Level 1" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Skill progression & Standard quests" })).toBeVisible();
    expect(screen.getByText("No active daily period.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "weekly-active title", level: 3 })).toBeVisible();
    expect(screen.getByRole("button", { name: "Increase weekly-active title progress" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Complete quest" })).toBeVisible();
  });

  it.each(["ACCEPTED", "EXPIRED"] as const)("keeps all Home sections usable without a recommendation (%s slots)", (status) => {
    const occupied = { ...state, skills: [{ ...state.skills[0], slots: state.skills[0].slots.map((slot) => ({ ...slot, quest: quest(slot.quest.id, status, slot.quest.title) })) }] } as StandardState;
    render(<StandardQuests initial={occupied} initialRecommendation={null} initialChallenges={challenges} />);
    for (const name of ["Overall Level 1", "Active Quests", "Skill progression & Standard quests", "No quests to recommend right now"]) expect(screen.getByRole("heading", { name })).toBeVisible();
    expect(screen.getByRole("heading", { name: "daily-active title", level: 3 })).toBeVisible();
    expect(screen.getByRole("heading", { name: "weekly-active title", level: 3 })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Something different" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Fitness/ }));
    expect(screen.getAllByRole("button", { name: status === "EXPIRED" ? "Clear / acknowledge failure" : "Complete quest" })).toHaveLength(2);
  });

  it.each([null, recommendation])("completes an active Home quest with no recommendation and renders the refreshed result (%j)", async (next) => {
    const occupied = { ...state, skills: [{ ...state.skills[0], slots: [state.skills[0].slots[1]] }] };
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ ...state, overallXp: 100 }) }).mockResolvedValueOnce({ ok: true, json: async () => next });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={occupied} initialRecommendation={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete quest" }));
    await screen.findByText("Quest complete. XP, levels, and streaks are updated.");
    expect(fetcher.mock.calls[0][0]).toBe("/api/quests/standard/accepted/complete");
    expect(screen.getByText("100 Overall XP")).toBeVisible();
    expect(screen.getByRole("region", { name: next ? "Available quest" : "No quests to recommend right now" })).toBeVisible();
  });

  it("clears the recommendation card after accepting the last available quest", async () => {
    const occupied = { ...state, skills: [{ ...state.skills[0], slots: state.skills[0].slots.map((slot) => ({ ...slot, quest: quest(slot.quest.id, "ACCEPTED", slot.quest.title) })) }] } as StandardState;
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => occupied }).mockResolvedValueOnce({ ok: true, json: async () => null }).mockResolvedValueOnce({ ok: true, json: async () => occupied }).mockResolvedValueOnce({ ok: true, json: async () => null });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept quest" }));
    await screen.findByRole("heading", { name: "No quests to recommend right now" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole("button", { name: "Accept quest" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Complete quest" })).toHaveLength(2);
  });

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
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => url === "/api/quests/standard" ? state : url === "/api/recommendations/next" ? recommendation : completed })));
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

describe("Challenge actions refresh Home progression", () => {
  const progressed: StandardState = {
    ...state, overallXp: 1100, overallLevel: 2,
    overallProgress: { level: 2, currentXp: 1100, levelStartXp: 1000, nextLevelXp: 2500, xpIntoLevel: 100, xpToNextLevel: 1400, percent: 100 / 15 },
    skills: [{ ...state.skills[0], currentXp: 350, lifetimeXp: 350, currentLevel: 2,
      levelProgress: { level: 2, currentXp: 350, levelStartXp: 300, nextLevelXp: 700, xpIntoLevel: 50, xpToNextLevel: 350, percent: 12.5 },
      currentStreakDays: 1, longestStreakDays: 1, streakActive: true }],
  };

  function expectProgression(home: StandardState) {
    expect(screen.getByRole("heading", { name: `Overall Level ${home.overallLevel}` })).toBeVisible();
    expect(screen.getByText(`${home.overallXp.toLocaleString()} Overall XP`, { exact: true })).toBeVisible();
    expect(screen.getByRole("progressbar", { name: `Overall progress to level ${home.overallLevel + 1}` })).toHaveAttribute("aria-valuenow", String(home.overallProgress.xpIntoLevel));
    const skill = screen.getByRole("button", { name: /Fitness/ });
    expect(skill).toHaveTextContent(`Level ${home.skills[0].currentLevel}`);
    expect(skill).toHaveTextContent(`${home.skills[0].levelProgress.xpToNextLevel} XP to next level`);
    expect(skill).toHaveTextContent(`${home.skills[0].currentStreakDays}-day streak`);
    expect(screen.getByRole("progressbar", { name: "Fitness progress" })).toHaveAttribute("aria-valuenow", String(home.skills[0].levelProgress.xpIntoLevel));
  }

  it.each([
    { name: "SINGLE completion", pool: "daily" as const, id: "daily-active", action: "complete", button: "Complete", progress: 1 },
    { name: "final COUNT increment", pool: "weekly" as const, id: "weekly-active", action: "increment", button: "Increase weekly-active title progress", progress: 3 },
    { name: "partial COUNT increment", pool: "weekly" as const, id: "weekly-active", action: "increment", button: "Increase weekly-active title progress", progress: 2 },
  ])("uses authoritative Home progression after $name", async ({ pool, id, action, button, progress }) => {
    const settled = action === "complete" || progress === 3;
    const initialChallenges = { ...challenges, [pool]: { ...challenges[pool], quests: challenges[pool].quests.map((q) => q.id === id ? { ...q, currentProgress: progress - 1 } : q) } };
    const updatedChallenges = { ...initialChallenges, [pool]: { ...initialChallenges[pool],
      completedCount: initialChallenges[pool].completedCount + (settled ? 1 : 0),
      quests: initialChallenges[pool].quests.map((q) => q.id === id ? { ...q, status: settled ? "COMPLETED" as const : "ACCEPTED" as const, currentProgress: progress } : q) } };
    const home = settled ? progressed : state;
    let resolveHome!: (value: unknown) => void;
    const fetcher = vi.fn(async (url: string) => {
      if (url === `/api/challenges/${id}/${action}`) return { ok: true, json: async () => updatedChallenges };
      if (url === "/api/quests/standard") return { ok: true, json: () => new Promise((resolve) => { resolveHome = resolve; }) };
      if (url === "/api/recommendations/next") return { ok: true, json: async () => alternative };
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} initialChallenges={initialChallenges} />);
    fireEvent.click(screen.getByRole("button", { name: /Fitness/ }));
    expectProgression(state);
    const active = document.querySelector(`[data-active-quest-id="${id}"]`) as HTMLElement;
    fireEvent.click(within(active).getByRole("button", { name: button }));
    await waitFor(() => expect(resolveHome).toBeDefined());
    expect(screen.getByText("Updating challenge...")).toBeVisible();
    expectProgression(state);
    resolveHome(home);
    await screen.findByText(action === "complete" ? "Challenge completed and rewards applied." : "Challenge progress updated. No XP is awarded until the target is reached.");
    expectProgression(home);
    expect(screen.getByRole("button", { name: /Fitness/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Different quest")).toBeVisible();
    expect(fetcher).toHaveBeenCalledWith(`/api/challenges/${id}/${action}`, expect.objectContaining({ method: "POST", body: "{}" }));
    if (settled) expect(document.querySelector(`[data-active-quest-id="${id}"]`)).toBeNull();
    else expect(within(active).getByLabelText("weekly-active title current progress")).toHaveTextContent("2 / 3");
  });

  it.each(["complete", "increment"])("preserves progression and error handling after a failed %s", async (action) => {
    const id = action === "complete" ? "daily-active" : "weekly-active";
    const fetcher = vi.fn(async (url: string) => {
      if (url === `/api/challenges/${id}/${action}`) return { ok: false, json: async () => ({ error: { message: "Challenge action failed." } }) };
      if (url === "/api/challenges") return { ok: true, json: async () => challenges };
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<StandardQuests initial={state} initialRecommendation={recommendation} initialChallenges={challenges} />);
    fireEvent.click(screen.getByRole("button", { name: /Fitness/ }));
    const active = document.querySelector(`[data-active-quest-id="${id}"]`) as HTMLElement;
    const button = within(active).getByRole("button", { name: action === "complete" ? "Complete" : "Increase weekly-active title progress" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Challenge action failed.");
    await waitFor(() => expect(button).toBeEnabled());
    expectProgression(state);
    expect(fetcher).toHaveBeenCalledWith("/api/challenges");
    expect(fetcher).not.toHaveBeenCalledWith("/api/quests/standard");
  });
});
