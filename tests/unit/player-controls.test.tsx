import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusAllocator, OnboardingForm, SettingsForm, TimezoneField } from "../../src/components/player-controls";
import { initialFocusAllocation } from "../../src/modules/player/domain/focus";
import skills from "../../data/seeds/skills.json";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Focus allocator and onboarding", () => {
  it("announces remaining points and supports accessible redistribution", () => {
    function Allocator() { const [value, setValue] = useState<Record<string, number>>(initialFocusAllocation()); return <FocusAllocator skills={skills} value={value} onChange={setValue} />; }
    render(<Allocator />);
    expect(screen.getByText(/0 points remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Fitness Focus" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Decrease Fitness Focus" }));
    expect(screen.getByText(/1 points remaining/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase Hobbies Focus" }));
    expect(screen.getByLabelText("Hobbies points")).toHaveTextContent("6");
    expect(screen.getByText(/0 points remaining/)).toBeInTheDocument();
  });
  it("disables controls at min and max", () => {
    render(<FocusAllocator skills={skills} value={{ ...initialFocusAllocation(), F: 1, L: 10 }} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Decrease Fitness Focus" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase Learning Focus" })).toBeDisabled();
  });
  it("only advances with a valid confirmed timezone and full allocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ alreadyCompleted: false }) }));
    render(<OnboardingForm skills={skills} timezones={["UTC", "America/Denver"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your timezone"), { target: { value: "Denver" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your timezone"), { target: { value: "America/Denver" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Fitness Focus" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Increase Hobbies Focus" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("America/Denver")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete onboarding" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/home"));
    expect(fetch).toHaveBeenCalledWith("/api/onboarding/complete", expect.objectContaining({ method: "POST" }));
  });
  it("offers device timezone as an explicit user action", () => {
    const change = vi.fn(); render(<TimezoneField value="" onChange={change} timezones={["UTC"]} />);
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use my device's timezone" }));
    expect(change).toHaveBeenCalledWith(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
  it("disables invalid respec and reports server rejection without losing edits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Please retry." } }) }));
    render(<SettingsForm skills={skills} initialFocus={initialFocusAllocation()} initialTimezone="UTC" timezones={["UTC"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Fitness Focus" }));
    expect(screen.getByRole("button", { name: "Save Focus" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Increase Hobbies Focus" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Focus" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please retry.");
    expect(screen.getByLabelText("Fitness points")).toHaveTextContent("5");
  });
});
