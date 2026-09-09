import { describe, expect, it } from "vitest";
import { questInputSchema } from "@/modules/admin/domain";
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const valid=()=>({stableKey:"ADMIN_TEST",title:"Test quest",shortDescription:"Do a useful thing.",difficulty:"EASY",baseXp:75,estimatedMinutes:15,completionWindowHours:24,completionType:"SINGLE",completionTarget:1,standardEligible:true,dailyEligible:false,weeklyEligible:false,familyId:null,skills:[{skillId:id(1),isPrimary:true,rewardPercent:100}],varietyTags:[{varietyTagId:id(2),isPrimary:true}],costLevel:"NONE",socialRequirement:"NONE",safetyCategory:"GENERAL",curatorValueScore:3,curatorDifficultyReason:"Approachable action.",curatorNotes:null});
describe("admin quest DTO",()=>{
 it("accepts a structurally valid definition",()=>expect(questInputSchema.safeParse(valid()).success).toBe(true));
 it.each([
  ["difficulty XP",{baseXp:100}], ["single target",{completionTarget:2}], ["standard window",{completionWindowHours:12}],
  ["pool eligibility",{standardEligible:false,completionWindowHours:null}], ["reward total",{skills:[{skillId:id(1),isPrimary:true,rewardPercent:90}]}],
  ["unique Skills",{skills:[{skillId:id(1),isPrimary:true,rewardPercent:50},{skillId:id(1),isPrimary:false,rewardPercent:50}]}],
  ["one primary tag",{varietyTags:[{varietyTagId:id(2),isPrimary:false}]}],
 ])("rejects %s",(_name,change)=>expect(questInputSchema.safeParse({...valid(),...change}).success).toBe(false));
 it("rejects unknown mass-assignment fields",()=>expect(questInputSchema.safeParse({...valid(),active:true,reviewStatus:"APPROVED"}).success).toBe(false));
});
