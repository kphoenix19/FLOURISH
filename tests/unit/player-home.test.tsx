import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayerHome from "@/app/home/page";
import { ServiceError } from "@/lib/service-error";

const mocks = vi.hoisted(() => ({
  pageUser: vi.fn(), getDb: vi.fn(), progression: vi.fn(), recommendation: vi.fn(), challenges: vi.fn(),
  standardQuests: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ pageUser: mocks.pageUser }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/modules/quests/standard/slots", () => ({ reconcileStandardQuestSlots: mocks.progression }));
vi.mock("@/modules/recommendations/service", () => ({ getHomeRecommendation: mocks.recommendation }));
vi.mock("@/modules/challenges/service", () => ({ getChallengeState: mocks.challenges }));
vi.mock("@/components/standard-quests", () => ({ StandardQuests: mocks.standardQuests }));

// Distinct service results let this page-level test verify prop forwarding without
// coupling its loading/error coverage to the child component's view-model shape.
const progression = { source: "progression" };
const recommendation = { source: "recommendation" };
const challenges = { source: "challenges" };
const db = {};
const stages = ["progression", "recommendation", "challenges"] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.pageUser.mockResolvedValue({ playerId: "player-1" });
  mocks.getDb.mockReturnValue(db);
  mocks.progression.mockResolvedValue(progression);
  mocks.recommendation.mockResolvedValue(recommendation);
  mocks.challenges.mockResolvedValue(challenges);
  mocks.standardQuests.mockImplementation(() => <h1>Loaded Home</h1>);
});
afterEach(cleanup);

describe("Player Home loading", () => {
  it("renders all Home data when recommendation lookup succeeds with null", async () => {
    mocks.recommendation.mockResolvedValue(null);
    render(await PlayerHome());
    expect(screen.getByRole("heading", { name: "Loaded Home" })).toBeVisible();
    expect(mocks.standardQuests.mock.calls[0][0]).toEqual({
      initial: progression, initialRecommendation: null, initialChallenges: challenges,
    });
  });

  it("preserves the F2 failure guard when Challenges fail after an empty recommendation", async () => {
    mocks.recommendation.mockResolvedValue(null);
    mocks.challenges.mockRejectedValue(new ServiceError(503, "HOME_UNAVAILABLE", "Challenges unavailable."));
    render(await PlayerHome());
    expect(screen.getByRole("alert")).toHaveTextContent("Challenges unavailable.");
    expect(mocks.standardQuests).not.toHaveBeenCalled();
  });

  it("renders the full Home with all three authoritative service results", async () => {
    render(await PlayerHome());
    expect(screen.getByRole("heading", { name: "Loaded Home" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.pageUser).toHaveBeenCalledWith("completed");
    for (const stage of stages) expect(mocks[stage]).toHaveBeenCalledWith(db, "player-1");
    expect(mocks.standardQuests.mock.calls[0][0]).toEqual({
      initial: progression, initialRecommendation: recommendation, initialChallenges: challenges,
    });
  });

  it.each(stages)("renders the existing recoverable error state when %s loading fails", async (stage) => {
    const message = `${stage} is temporarily unavailable.`;
    mocks[stage].mockRejectedValue(new ServiceError(503, "HOME_UNAVAILABLE", message));
    render(await PlayerHome());
    expect(screen.getByRole("heading", { name: "Progress is temporarily unavailable" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByText("Your game state is safe. Refresh to try again.")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Player navigation" })).toBeVisible();
    expect(mocks.standardQuests).not.toHaveBeenCalled();
    for (const laterStage of stages.slice(stages.indexOf(stage) + 1)) {
      expect(mocks[laterStage]).not.toHaveBeenCalled();
    }
  });

  it.each(stages)("propagates unexpected failures from %s loading", async (stage) => {
    const failure = new Error("Unexpected failure");
    mocks[stage].mockRejectedValue(failure);
    await expect(PlayerHome()).rejects.toBe(failure);
    expect(mocks.standardQuests).not.toHaveBeenCalled();
  });
});
