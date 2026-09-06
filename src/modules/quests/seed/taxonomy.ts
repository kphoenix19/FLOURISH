// Locked Build 1 taxonomy. Changes require a corresponding content-contract update.
export const taxonomy = {
  F: ["strength", "cardio", "walking", "mobility", "recovery", "nutrition", "sports", "health_maintenance", "fitness_learning", "general_fitness"],
  L: ["reading", "coursework", "practice", "research", "project", "review", "problem_solving", "learning_planning"],
  O: ["productivity", "planning", "career_growth", "job_search", "interviewing", "networking", "leadership", "career_planning", "work_organization", "entrepreneurship"],
  U: ["friends", "family", "dating", "partner", "communication", "community", "group_activity", "social_growth", "relationship_maintenance"],
  R: ["meditation", "mindfulness", "journaling", "gratitude", "self_reflection", "prayer", "spiritual_practice", "spiritual_learning", "spiritual_community", "rest"],
  I: ["budgeting", "saving", "investing", "spending", "debt", "income", "financial_planning", "financial_organization", "financial_learning"],
  S: ["cooking", "meal_prep", "dishes", "cleaning", "decluttering", "organization", "laundry", "home_maintenance", "home_improvement", "cooking_learning"],
  H: ["creative", "gaming", "music", "outdoors", "collecting", "building", "entertainment", "exploration", "social_hobby", "hobby_learning"],
} as const;

export type SkillCode = keyof typeof taxonomy;
export const skillCodes = Object.keys(taxonomy) as SkillCode[];
export const initialPrimaryTagLimit = 10;
