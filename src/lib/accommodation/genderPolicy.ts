/**
 * src/lib/accommodation/genderPolicy.ts
 *
 * Single source of truth for gender matching in the accommodation module.
 *
 * Design principle
 * ────────────────
 * The school's own gender policy is the outer constraint; individual dorm
 * gender policies are inner constraints that must be consistent with it.
 *
 *  School BOYS_ONLY   → every dorm must be BOYS_ONLY.
 *                       No student.gender check needed — all students are boys.
 *
 *  School GIRLS_ONLY  → every dorm must be GIRLS_ONLY.
 *                       No student.gender check needed — all students are girls.
 *
 *  School MIXED       → dorms MUST be BOYS_ONLY or GIRLS_ONLY.
 *                       "Mixed" is not a valid dorm policy — no real dormitory
 *                       houses both boys and girls together. Students are matched
 *                       to the correct dorm by their recorded gender.
 *
 * Key rule for mixed schools
 * ──────────────────────────
 * Every dorm in a mixed school must declare a gender. Boys go to BOYS_ONLY
 * dorms, girls go to GIRLS_ONLY dorms. A student with no gender recorded
 * cannot be auto-allocated — they must be placed manually.
 */

export type GenderPolicy = "BOYS_ONLY" | "GIRLS_ONLY" | "MIXED";

/** Dorm policies that are valid to create inside a given school policy. */
export const VALID_DORM_POLICIES: Record<GenderPolicy, GenderPolicy[]> = {
  BOYS_ONLY:  ["BOYS_ONLY"],
  GIRLS_ONLY: ["GIRLS_ONLY"],
  MIXED:      ["BOYS_ONLY", "GIRLS_ONLY"], // MIXED dorms are not permitted
};

/**
 * Given the school's gender policy, return the only dorm gender policy
 * that is valid when the school is single-gender.
 * Returns null for MIXED schools (the dorm policy is chosen by the user,
 * but must be BOYS_ONLY or GIRLS_ONLY — never MIXED).
 */
export function requiredDormGenderPolicy(
  schoolGenderPolicy: GenderPolicy,
): GenderPolicy | null {
  if (schoolGenderPolicy === "BOYS_ONLY") return "BOYS_ONLY";
  if (schoolGenderPolicy === "GIRLS_ONLY") return "GIRLS_ONLY";
  return null; // MIXED school — caller must choose BOYS_ONLY or GIRLS_ONLY
}

/**
 * Validate that a dorm's proposed genderPolicy is compatible with the
 * school's gender policy.
 *
 * Returns null when valid; returns a user-facing error string when invalid.
 *
 * Rejection cases:
 *  - Any school: MIXED is never a valid dorm policy.
 *  - BOYS_ONLY school: only BOYS_ONLY is allowed.
 *  - GIRLS_ONLY school: only GIRLS_ONLY is allowed.
 *  - MIXED school: BOYS_ONLY or GIRLS_ONLY are both fine; MIXED is not.
 */
export function validateDormGenderPolicy(
  schoolGenderPolicy: GenderPolicy,
  dormGenderPolicy: GenderPolicy,
): string | null {
  const valid = VALID_DORM_POLICIES[schoolGenderPolicy];

  if (!valid.includes(dormGenderPolicy)) {
    if (dormGenderPolicy === "MIXED") {
      return "A dormitory cannot have a Mixed gender policy. Every dormitory must be dedicated to either Boys or Girls only.";
    }
    const required = valid[0];
    const label = required === "BOYS_ONLY" ? "Boys Only" : "Girls Only";
    return `This school's gender policy requires all dormitories to be "${label}".`;
  }

  return null;
}

/**
 * Resolve the effective gender policy for a dorm, taking the school's
 * policy into account.
 *
 * In single-gender schools the school policy overrides whatever is stored
 * on the dorm (as a safety net for inconsistent legacy data).
 * In mixed schools the dorm's stored policy is authoritative.
 */
export function effectiveDormGenderPolicy(
  schoolGenderPolicy: GenderPolicy,
  dormGenderPolicy: GenderPolicy,
): GenderPolicy {
  const required = requiredDormGenderPolicy(schoolGenderPolicy);
  return required ?? dormGenderPolicy;
}

/**
 * Check whether a student is gender-eligible for a dorm.
 *
 * @param schoolGenderPolicy  School.genderPolicy
 * @param dormGenderPolicy    Dormitory.genderPolicy
 * @param studentGender       Student.gender ("MALE" | "FEMALE" | null | "")
 *
 * Rules:
 *  - Single-gender school (BOYS_ONLY / GIRLS_ONLY):
 *      All enrolled students are the same gender — no per-student check needed.
 *      Always returns true.
 *
 *  - Mixed school, BOYS_ONLY dorm:
 *      Student must have gender === "MALE".
 *      Student with unknown gender → false (cannot confirm eligibility).
 *
 *  - Mixed school, GIRLS_ONLY dorm:
 *      Student must have gender === "FEMALE".
 *      Student with unknown gender → false.
 *
 *  - Mixed school, MIXED dorm:
 *      Should not exist after validation, but returns true as a safe fallback.
 */
export function studentMatchesDormGender(
  schoolGenderPolicy: GenderPolicy,
  dormGenderPolicy: GenderPolicy,
  studentGender: string | null | undefined,
): boolean {
  // Single-gender school: all students are the same gender by school policy.
  if (schoolGenderPolicy !== "MIXED") return true;

  const effective = effectiveDormGenderPolicy(schoolGenderPolicy, dormGenderPolicy);

  // MIXED dorm shouldn't exist in a mixed school, but treat as permissive
  // fallback so existing data never hard-breaks.
  if (effective === "MIXED") return true;

  const gender = (studentGender ?? "").toUpperCase();
  if (effective === "BOYS_ONLY") return gender === "MALE";
  if (effective === "GIRLS_ONLY") return gender === "FEMALE";

  return true;
}

/**
 * Human-readable reason why a student cannot be placed in a specific dorm.
 */
export function genderMismatchReason(
  dormGenderPolicy: GenderPolicy,
  studentGender: string | null | undefined,
): string {
  const gender = (studentGender ?? "").toUpperCase() || "unknown gender";
  if (dormGenderPolicy === "BOYS_ONLY") {
    return `Dorm is Boys Only but student gender is "${gender}"`;
  }
  if (dormGenderPolicy === "GIRLS_ONLY") {
    return `Dorm is Girls Only but student gender is "${gender}"`;
  }
  return "Gender mismatch";
}
