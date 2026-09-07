import { describe, expect, it } from "vitest";
import { challengeWindow, localMidnightUtc } from "@/modules/challenges/windows";
import { challengeCandidateScore, selectChallengeSet, type ChallengeCandidate } from "@/modules/challenges/selection";

const candidate=(id:string,skill:string,difficulty:"EASY"|"MEDIUM"|"HARD"|"EPIC"|"LEGENDARY"="EASY"):ChallengeCandidate=>({id,difficulty,primarySkillId:skill,skills:[{skillId:skill,rewardPercent:100}]});
describe("Challenge windows",()=>{
  it("creates DST-safe local daily windows",()=>{const w=challengeWindow("DAILY",new Date("2026-03-08T18:00:00Z"),"America/Denver");expect(w.start.toISOString()).toBe("2026-03-08T07:00:00.000Z");expect(w.end.toISOString()).toBe("2026-03-09T06:00:00.000Z");});
  it("creates Monday-based weekly windows near UTC midnight",()=>{const w=challengeWindow("WEEKLY",new Date("2026-09-14T05:30:00Z"),"America/Denver");expect(w.start.toISOString()).toBe("2026-09-07T06:00:00.000Z");expect(w.end.toISOString()).toBe("2026-09-14T06:00:00.000Z");expect(localMidnightUtc("2026-11-01","America/Denver").toISOString()).toBe("2026-11-01T06:00:00.000Z");});
});
describe("Challenge selection",()=>{
  it("enforces unique Skills, exclusions, and no Legendary",()=>{const selected=selectChallengeSet([candidate("a","F"),candidate("b","F"),candidate("c","L"),candidate("d","O"),candidate("e","U","LEGENDARY")],3,"DAILY",{F:5,L:5,O:5,U:5},{F:1,L:1,O:1,U:1},new Set(["b"]),()=>0);expect(selected?.map(q=>q.id)).toEqual(["a","c","d"]);});
  it("applies difficulty, Focus, Catch-Up, and injectable randomness",()=>{const q=candidate("x","F","MEDIUM");expect(challengeCandidateScore(q,"DAILY",{F:10},{F:1.3},()=>0.5)).toBeCloseTo(30*1.5*1.3);expect(challengeCandidateScore(q,"WEEKLY",{F:10},{F:1.3},()=>0.5)).toBeCloseTo(40*1.5*1.3);});
  it("fails cleanly when hard constraints cannot be met",()=>expect(selectChallengeSet([candidate("a","F"),candidate("b","F")],2,"DAILY",{F:5},{F:1},new Set(),()=>0)).toBeNull());
});
