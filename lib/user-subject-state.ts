import type {
  PostgrestError,
  PostgrestResponse,
  SupabaseClient,
} from "@supabase/supabase-js";
import type { Database } from "./types_db";

const SUBJECT_STATE_COLUMN_CANDIDATES = [
  "user_id, subject, course, mastery, next_topic, updated_at, difficulty, path",
  "user_id, subject, course, mastery, next_topic, updated_at, difficulty",
  "user_id, subject, mastery, next_topic, updated_at, difficulty",
  "user_id, subject, mastery, next_topic, updated_at",
] as const;

const MISSING_COLUMN_CODE = "42703";

export type UserSubjectStateRow =
  Database["public"]["Tables"]["user_subject_state"]["Row"];
type SubjectStateResponse = PostgrestResponse<UserSubjectStateRow>;

type SubjectStateQueryOrder = {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
  nullsLast?: boolean;
};

type SubjectStateQueryOptions = {
  userId?: string;
  subject?: string;
  limit?: number;
  order?: SubjectStateQueryOrder;
};

export function readCourseValue(
  row: Record<string, unknown>
): string | null {
  const candidates = [
    "course",
    "course_slug",
    "course_name",
    "course_title",
    "courseId",
    "courseLabel",
  ];
  for (const key of candidates) {
    const raw = row[key];
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) return trimmed;
    } else if (raw != null && (typeof raw === "number" || typeof raw === "boolean")) {
      if (key === "course") return String(raw);
    }
  }
  return null;
}

function isMissingColumnError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === MISSING_COLUMN_CODE) return true;
  return typeof error.message === "string" && /does not exist/i.test(error.message);
}

export function isMissingSubjectStateColumn(
  error: PostgrestError | null
): boolean {
  return isMissingColumnError(error);
}

export async function fetchUserSubjectStates(
  supabase: SupabaseClient<Database>,
  options: SubjectStateQueryOptions = {}
): Promise<SubjectStateResponse> {
  let lastResponse: SubjectStateResponse = {
    data: null,
    error: null,
    status: 200,
    statusText: "",
  };

  const orderCandidates: (SubjectStateQueryOrder | null)[] = options.order
    ? [options.order, null]
    : [null];
  // Including a no-order fallback lets us recover when the order column is missing.

  for (const orderOption of orderCandidates) {
    for (const columns of SUBJECT_STATE_COLUMN_CANDIDATES) {
      let query = supabase.from("user_subject_state").select(columns);
      if (options.userId) query = query.eq("user_id", options.userId);
      if (options.subject) query = query.eq("subject", options.subject);
      if (orderOption) {
        query = query.order(orderOption.column, {
          ascending: orderOption.ascending ?? false,
          nullsFirst: orderOption.nullsFirst,
          nullsLast: orderOption.nullsLast,
        });
      }
      if (typeof options.limit === "number") {
        query = query.limit(options.limit);
      }

      const response = await query;
      lastResponse = response;
      if (!response.error) return response;
      if (!isMissingColumnError(response.error)) return response;
    }
  }

  if (isMissingColumnError(lastResponse.error)) {
    // As a final fallback, ask Postgrest for all columns so legacy schemas still work.
    const fallbackOrderCandidates: (SubjectStateQueryOrder | null)[] = options.order
      ? [options.order, null]
      : [null];
    for (const orderOption of fallbackOrderCandidates) {
      let fallbackQuery = supabase.from("user_subject_state").select("*");
      if (options.userId) fallbackQuery = fallbackQuery.eq("user_id", options.userId);
      if (options.subject) fallbackQuery = fallbackQuery.eq("subject", options.subject);
      if (orderOption) {
        fallbackQuery = fallbackQuery.order(orderOption.column, {
          ascending: orderOption.ascending ?? false,
          nullsFirst: orderOption.nullsFirst,
          nullsLast: orderOption.nullsLast,
        });
      }
      if (typeof options.limit === "number") {
        fallbackQuery = fallbackQuery.limit(options.limit);
      }

      const response = await fallbackQuery;
      lastResponse = response;
      if (!response.error) return response;
      if (!isMissingColumnError(response.error)) return response;
    }
  }

  return lastResponse;
}
