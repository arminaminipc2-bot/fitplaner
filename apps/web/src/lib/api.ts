import type {
  ActivityLevel,
  AssistantKind,
  DataQuality,
  GoalType,
  Intensity,
  MeasurementMetric,
  MealSlot,
  PlanChangeStatus,
  RecordSource,
  Sex,
  TrainingExperience,
  WorkoutKind,
  WorkoutStatus,
} from "./domain";

/**
 * The only place the browser talks to the API. Every shape here mirrors a
 * serializer in apps/api/src/routes, verified by reading it — when the server
 * changes, this file changes with it, and the compiler finds the pages that broke.
 *
 * Everything is same-origin and cookie-authenticated: the session cookie is
 * httpOnly, so no token ever exists in JavaScript, and an API key can never
 * travel this way either.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch {
    // No response at all: say that, rather than reporting an empty success.
    throw new ApiError(0, "network_error", "ارتباط با سرور برقرار نشد. اتصال اینترنت شما را بررسی می‌کنیم؟");
  }

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError(response.status, "bad_response", "پاسخ سرور قابل خواندن نبود.");
  }

  if (!payload.ok) {
    throw new ApiError(response.status, payload.error.code, payload.error.message, payload.error.fields ?? {});
  }
  return payload.data;
}

/* ------------------------------------------------------------------ enums -- */

/** Wire spelling for a measurement quality; `self_reported` becomes `self-reported` in the UI. */
export type ApiQuality = "measured" | "estimated" | "self_reported";

export function toUiQuality(quality: ApiQuality): DataQuality {
  return quality === "self_reported" ? "self-reported" : quality;
}

export type ApiUnit = "kg" | "cm" | "percent" | "bpm" | "score";

/* ------------------------------------------------------------------- auth -- */

/** What the register/login endpoints return — no display name, unlike `/auth/me`. */
export type SignedInUser = {
  id: string;
  email: string;
  onboardingStep: number;
  onboardingCompleted?: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  onboardingStep: number;
  onboardingCompleted: boolean;
};

/* ------------------------------------------------------------------- home -- */

/** One Iranian calendar day, `YYYY-MM-DD`. */
export type HomeDay = {
  date: string;
  workoutsPlanned: number;
  workoutsDone: number;
  workoutMinutes: number;
  kcalConsumed: number;
  proteinConsumed: number;
  waterMl: number;
  weightKg: number | null;
  bodyFatPct: number | null;
  dataQuality: "measured" | "estimated" | "missing";
};

export type RollupSummary = {
  days: number;
  workoutsPlanned: number;
  workoutsDone: number;
  adherencePct: number;
  streakDays: number;
  kcalAverage: number;
  proteinAverage: number;
  waterAverage: number;
  weightChangeKg: number | null;
  bodyFatChangePct: number | null;
  daysWithData: number;
  targetKcal: number | null;
};

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type HomePayload = {
  date: string;
  displayName: string | null;
  workouts: Array<{
    id: string;
    title: string;
    kind: WorkoutKind;
    status: WorkoutStatus;
    intensity: Intensity;
    estimatedMinutes: number | null;
    exerciseCount: number;
    version: number;
  }>;
  nutrition: {
    consumed: Totals;
    target: { kcal: number; proteinG: number; carbsG: number; fatG: number; waterMl: number } | null;
    waterMl: number;
    meals: Array<{
      id: string;
      slot: MealSlot;
      name: string;
      source: RecordSource;
      confidence: number | null;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      itemCount: number;
    }>;
  };
  body: {
    weightKg: number | null;
    bodyFatPct: number | null;
    takenAt: string | null;
    quality: ApiQuality | null;
    heightCm: number | null;
  };
  week: { from: string; to: string; days: HomeDay[]; streakDays: number; summary: RollupSummary };
  nextWorkout: { id: string; title: string; date: string; kind: WorkoutKind } | null;
  ai: { configured: boolean; providerLabel: string | null };
};

/* ---------------------------------------------------------------- profile -- */

export type ProfileFields = {
  displayName: string | null;
  sex: Sex | null;
  birthDate: string | null;
  ageYears: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  trainingExperience: TrainingExperience | null;
  goal: GoalType | null;
  injuries: string | null;
  medicalConditions: string | null;
  medications: string | null;
  dietaryRestrictions: string | null;
  dislikedFoods: string | null;
  preferredFoods: string | null;
  equipmentNotes: string | null;
  maxWorkoutMinutes: number | null;
  trainingDays: number[];
  onboardingStep: number;
  onboardingCompleted: boolean;
};

export type ProfilePayload = { email: string; profile: ProfileFields | null };

/** Keys and value shapes are exactly the server's `PREFERENCES` map. */
export type Preferences = {
  units: { weight: "kg" | "lb"; length: "cm" | "in" };
  reminders: { workout: boolean; water: boolean; weighIn: boolean; quietFrom: string; quietTo: string };
  coach: { tone: "concise" | "detailed" | "supportive"; strictness: "gentle" | "balanced" | "demanding"; allowAiPlanEdits: boolean };
};

export type PreferenceKey = keyof Preferences;

/* ------------------------------------------------------------- measurements -- */

export type Measurement = {
  id: string;
  metric: MeasurementMetric;
  value: number;
  unit: ApiUnit;
  takenAt: string;
  quality: ApiQuality;
  source: RecordSource;
  note: string | null;
};

export type LatestMeasurements = {
  items: Measurement[];
  heightCm: number | null;
  ageYears: number | null;
};

/* ---------------------------------------------------------------- training -- */

export type ExerciseDto = {
  id: string;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  sets: number;
  reps: string;
  restSeconds: number | null;
  tempo: string | null;
  notes: string | null;
  orderIndex: number;
};

export type WorkoutDto = {
  id: string;
  date: string;
  kind: WorkoutKind;
  title: string;
  description: string | null;
  intensity: Intensity;
  estimatedMinutes: number | null;
  status: WorkoutStatus;
  completedAt: string | null;
  programId: string | null;
  notes: string | null;
  version: number;
  exercises?: ExerciseDto[];
};

export type ProgramSchedule = {
  id: string;
  weekStart: string;
  dayOfWeek: number;
  kind: WorkoutKind;
  title: string;
  startTime: string | null;
  enabled: boolean;
};

export type ProgramDto = {
  id: string;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  daysPerWeek: number | null;
  focus: string | null;
  status: "active" | "paused" | "completed" | "archived";
  source: RecordSource;
  version: number;
  schedules: ProgramSchedule[];
};

export type SessionPerformance = {
  exerciseId: string;
  setIndex: number;
  reps?: number;
  weightKg?: number;
  distanceM?: number;
  seconds?: number;
  rpe?: number;
  note?: string;
};

/* --------------------------------------------------------------- nutrition -- */

export type MealDto = {
  id: string;
  date: string;
  slot: MealSlot;
  name: string;
  source: RecordSource;
  confidence: number | null;
  note: string | null;
  planId: string | null;
  version: number;
  totals: Totals;
  items: Array<{
    id: string;
    name: string;
    brand: string | null;
    amount: number;
    unit: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    source: RecordSource;
    confidence: number | null;
  }>;
};

export type NutritionTargetDto = {
  id: string;
  effectiveFrom: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  notes: string | null;
  source: RecordSource;
  version: number;
};

/** From `POST /nutrition/targets/suggest`; warnings are machine codes the UI translates. */
export type TargetSuggestion = {
  bmr: number;
  tdee: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  warnings: string[];
  measuredAt: string;
  quality: ApiQuality;
};

export type FoodUnit = "g" | "ml" | "piece" | "tbsp" | "tsp" | "cup";

export type FoodDraftInput = {
  name: string;
  brand?: string;
  amount: number;
  unit: FoodUnit;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source?: RecordSource;
  confidence?: number;
};

/* ---------------------------------------------------------------- progress -- */

export type ProgressSnapshot = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  kcalTarget: number | null;
  kcalConsumed: number | null;
  proteinConsumed: number | null;
  waterMl: number | null;
  workoutMinutes: number | null;
  workoutsDone: number | null;
  workoutsPlanned: number | null;
  dataQuality: string | null;
};

export type GoalDto = {
  id: string;
  type: GoalType;
  targetValue: number | null;
  unit: string | null;
  startDate: string;
  targetDate: string | null;
  status: "active" | "achieved" | "paused" | "abandoned";
  notes: string | null;
};

export type SeriesPoint = { at: string; value: number; quality: ApiQuality; source: RecordSource };

/* -------------------------------------------------------------------- ai -- */

export type ConversationListItem = { id: string; assistant: AssistantKind; title: string | null; lastMessageAt: string };
export type ConversationRef = { id: string; assistant: AssistantKind; title: string | null };

export type ChatMessageDto = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  at: string;
  modelId: string | null;
  attachments: unknown;
  error: string | null;
  toolCalls?: Array<{ id: string | null; name: string; argumentsJson: string }> | null;
  finishReason?: string | null;
};

/** POST /nutrition/analyze — always an estimate, never a stored meal. */
export type FoodAnalysisDto = {
  name: string;
  items: Array<{
    name: string;
    amount: number;
    unit: FoodUnit;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
  totals: Totals;
  confidence: number;
  portionNotes: string | null;
  ingredients: string[];
  explanation: string;
  uncertainty: string[];
  source: RecordSource;
  providerLabel: string;
  modelId: string;
};

export type Provider = {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  hasKey: boolean;
  keyMask: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
};

/** One validated write inside an AI proposal. Shapes mirror plan-executor.ts. */
export type PlanOperation =
  | { kind: "workout.create"; workout: { date: string; kind: WorkoutKind; title: string; intensity?: Intensity; estimatedMinutes?: number } }
  | { kind: "workout.update"; id: string; expectedVersion: number; patch: Record<string, unknown> }
  | { kind: "workout.reschedule"; id: string; expectedVersion: number; date: string }
  | { kind: "workout.delete"; id: string }
  | { kind: "targets.update"; target: { effectiveFrom: string; kcal: number; proteinG: number; carbsG: number; fatG: number } }
  | { kind: "meal.create"; meal: { date: string; slot: MealSlot; name: string } }
  | { kind: "meal.update"; id: string; expectedVersion: number; patch: Record<string, unknown> }
  | { kind: "meal.delete"; id: string };

export type PlanChangeDto = {
  id: string;
  source: "ai" | "user";
  summary: string;
  operations: PlanOperation[];
  status: PlanChangeStatus;
  requiresConfirmation: boolean;
  conversationId: string | null;
  createdAt: string;
  appliedAt: string | null;
  revertedAt: string | null;
  error: string | null;
};

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  scheduledAt: string | null;
  readAt: string | null;
  createdAt: string;
};

/* ----------------------------------------------------------------- client -- */

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
};

const DELETED = { method: "DELETE" } as const;

export const api = {
  auth: {
    register: (body: { email: string; password: string; displayName?: string }) =>
      request<SignedInUser>("/auth/register", { body }),
    login: (body: { email: string; password: string }) => request<SignedInUser>("/auth/login", { body }),
    logout: () => request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" }),
    me: () => request<{ user: AuthUser | null }>("/auth/me"),
    requestPasswordReset: (email: string) =>
      request<{ requested: boolean; devResetToken?: string }>("/auth/password-reset/request", { body: { email } }),
    confirmPasswordReset: (token: string, password: string) =>
      request<{ changed: boolean }>("/auth/password-reset/confirm", { body: { token, password } }),
  },

  home: (signal?: AbortSignal) => request<HomePayload>("/home", { signal }),

  profile: {
    get: () => request<ProfilePayload>("/profile"),
    /** Partial update; absent keys stay put, so onboarding can post one step at a time. */
    patch: (body: Partial<ProfileFields> & Record<string, unknown>) => request<ProfileFields>("/profile", { method: "PATCH", body }),
    preferences: () => request<Partial<Preferences>>("/profile/preferences"),
    /** The body is the value object itself; the response is keyed by the preference name. */
    setPreference: <K extends PreferenceKey>(key: K, value: Preferences[K]) =>
      request<Pick<Preferences, K>>(`/profile/preferences/${key}`, { method: "PUT", body: value }),
  },

  measurements: {
    list: (params: { metric?: MeasurementMetric; from?: string; to?: string; limit?: number } = {}) =>
      request<{ items: Measurement[] }>(`/measurements${qs(params)}`),
    latest: () => request<LatestMeasurements>("/measurements/latest"),
    create: (body: {
      metric: MeasurementMetric;
      value: number;
      takenAt: string;
      quality?: ApiQuality;
      source?: RecordSource;
      note?: string;
    }) => request<Measurement>("/measurements", { body }),
    remove: (id: string) => request<{ deleted: boolean }>(`/measurements/${id}`, DELETED),
  },

  training: {
    workouts: (params: { from?: string; to?: string; limit?: number } = {}) =>
      request<{ items: WorkoutDto[] }>(`/training/workouts${qs(params)}`),
    workout: (id: string) => request<WorkoutDto>(`/training/workouts/${id}`),
    createWorkout: (body: {
      date: string;
      kind: WorkoutKind;
      title: string;
      description?: string;
      intensity?: Intensity;
      estimatedMinutes?: number;
      notes?: string;
    }) => request<WorkoutDto>("/training/workouts", { body }),
    /** `version` is the optimistic lock: a stale edit is rejected, never silently applied. */
    patchWorkout: (id: string, body: Record<string, unknown> & { version: number }) =>
      request<WorkoutDto>(`/training/workouts/${id}`, { method: "PATCH", body }),
    deleteWorkout: (id: string) => request<{ deleted: boolean }>(`/training/workouts/${id}`, DELETED),
    setStatus: (id: string, status: WorkoutStatus, version: number) =>
      request<WorkoutDto>(`/training/workouts/${id}/status`, { body: { status, version } }),
    addExercise: (workoutId: string, body: {
      name: string;
      muscleGroup?: string;
      equipment?: string;
      sets?: number;
      reps?: string;
      restSeconds?: number;
      tempo?: string;
      notes?: string;
    }) => request<ExerciseDto>(`/training/workouts/${workoutId}/exercises`, { body }),
    patchExercise: (id: string, body: Record<string, unknown>) =>
      request<ExerciseDto>(`/training/exercises/${id}`, { method: "PATCH", body }),
    deleteExercise: (id: string) => request<{ deleted: boolean }>(`/training/exercises/${id}`, DELETED),
    logSession: (workoutId: string, body: {
      startedAt?: string;
      endedAt?: string;
      durationMinutes?: number;
      rpe?: number;
      caloriesBurned?: number;
      notes?: string;
      performances?: SessionPerformance[];
    }) => request<{ id: string; performances: number }>(`/training/workouts/${workoutId}/sessions`, { body }),
    programs: () => request<{ items: ProgramDto[] }>("/training/programs"),
    createProgram: (body: Record<string, unknown>) =>
      request<{ id: string; name: string; version: number }>("/training/programs", { body }),
    patchProgram: (id: string, body: Record<string, unknown>) =>
      request<{ id: string; version: number }>(`/training/programs/${id}`, { method: "PATCH", body }),
    deleteProgram: (id: string) => request<{ deleted: boolean }>(`/training/programs/${id}`, DELETED),
  },

  nutrition: {
    targets: () => request<NutritionTargetDto | null>("/nutrition/targets"),
    putTargets: (body: {
      effectiveFrom: string;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      waterMl?: number;
      notes?: string;
    }) => request<NutritionTargetDto>("/nutrition/targets", { method: "PUT", body }),
    /** 422 `profile_incomplete` with `fields.missing` when the inputs for the formulas are absent. */
    suggestTargets: () => request<TargetSuggestion>("/nutrition/targets/suggest", { method: "POST" }),
    meals: (params: { from?: string; to?: string; slot?: MealSlot; limit?: number } = {}) =>
      request<{ items: MealDto[] }>(`/nutrition/meals${qs(params)}`),
    createMeal: (body: {
      date: string;
      slot: MealSlot;
      name: string;
      note?: string;
      source?: RecordSource;
      confidence?: number;
      items?: FoodDraftInput[];
    }) => request<MealDto>("/nutrition/meals", { body }),
    patchMeal: (id: string, body: Record<string, unknown> & { version: number }) =>
      request<MealDto>(`/nutrition/meals/${id}`, { method: "PATCH", body }),
    deleteMeal: (id: string) => request<{ deleted: boolean }>(`/nutrition/meals/${id}`, DELETED),
    water: (date: string) => request<{ date: string; amountMl: number }>(`/nutrition/water${qs({ date })}`),
    addWater: (amountMl: number) => request<{ id: string; amountMl: number }>("/nutrition/water", { body: { amountMl } }),
    /** Nothing is persisted here; the user confirms the estimate through createMeal. */
    analyze: (body: {
      text?: string;
      image?: string;
      source?: RecordSource;
      providerConfigId?: string;
      modelId?: string;
    }) => request<FoodAnalysisDto>("/nutrition/analyze", { body }),
  },

  progress: {
    range: (params: { days?: number; until?: string } = {}) =>
      request<{ from: string; to: string; days: HomeDay[]; summary: RollupSummary }>(`/progress${qs(params)}`),
    series: (metric: MeasurementMetric, days = 90) =>
      request<{ metric: MeasurementMetric; points: SeriesPoint[] }>(`/progress/series${qs({ metric, days })}`),
    snapshot: (date: string) => request<{ id: string; date: string }>("/progress/snapshot", { body: { date } }),
    snapshots: (params: { from?: string; to?: string } = {}) =>
      request<{ items: ProgressSnapshot[] }>(`/progress/snapshots${qs(params)}`),
    goals: () => request<{ items: GoalDto[]; types: GoalType[] }>("/progress/goals"),
    createGoal: (body: Record<string, unknown>) => request<{ id: string; type: GoalType }>("/progress/goals", { body }),
    patchGoal: (id: string, body: Record<string, unknown>) =>
      request<{ id: string; status: GoalDto["status"] }>(`/progress/goals/${id}`, { method: "PATCH", body }),
    deleteGoal: (id: string) => request<{ deleted: boolean }>(`/progress/goals/${id}`, DELETED),
  },

  chat: {
    conversations: () => request<{ items: ConversationListItem[]; assistants: AssistantKind[] }>("/chat/conversations"),
    createConversation: (assistant: AssistantKind, title?: string) =>
      request<{ id: string; assistant: AssistantKind }>("/chat/conversations", { body: { assistant, title } }),
    conversation: (id: string) =>
      request<{ conversation: ConversationRef; messages: ChatMessageDto[] }>(`/chat/conversations/${id}`),
    renameConversation: (id: string, title: string) =>
      request<{ id: string; title: string }>(`/chat/conversations/${id}`, { method: "PATCH", body: { title } }),
    deleteConversation: (id: string) => request<{ deleted: boolean }>(`/chat/conversations/${id}`, DELETED),
    /**
     * A failed model call is an error here, but the user's message is stored and
     * `fields.userMessageId` points at it — the transcript never shows an invented reply.
     */
    send: (id: string, content: string, attachments?: Array<{ kind: "image" | "file"; ref: string }>) =>
      request<{
        userMessage: ChatMessageDto;
        reply: ChatMessageDto;
        planChange: PlanChangeDto | null;
      }>(`/chat/conversations/${id}/messages`, {
        body: { content, attachments },
      }),
  },

  providers: {
    list: () => request<{ items: Provider[]; providers: string[] }>("/ai/providers"),
    /** The key is write-only: it never comes back, not even masked as a value. */
    create: (body: { provider: string; label: string; baseUrl?: string; apiKey?: string; enabled?: boolean }) =>
      request<Provider>("/ai/providers", { body }),
    patch: (id: string, body: { label?: string; baseUrl?: string; apiKey?: string; enabled?: boolean; isDefault?: boolean }) =>
      request<Provider>(`/ai/providers/${id}`, { method: "PATCH", body }),
    remove: (id: string) => request<{ deleted: boolean }>(`/ai/providers/${id}`, DELETED),
    verify: (id: string, body: { modelId?: string } = {}) =>
      request<{ ok: boolean; code: string; message: string; latencyMs: number; method: string }>(`/ai/providers/${id}/verify`, { method: "POST", body }),
    models: (id: string, params: { source?: "local" | "provider" } = {}) =>
      request<{ items: Array<{ id: string; modelId: string; displayName: string | null; capabilities: { vision: boolean; tools: boolean; streaming: boolean } }>; source: string; protocol: string }>(`/ai/providers/${id}/models${qs(params)}`),
  },

  planChanges: {
    list: (params: { status?: PlanChangeStatus; conversationId?: string } = {}) =>
      request<{ items: PlanChangeDto[]; statuses: PlanChangeStatus[] }>(`/plan-changes${qs(params)}`),
    get: (id: string) => request<PlanChangeDto>(`/plan-changes/${id}`),
    /** The user's explicit approval is the only path from proposal to real rows. */
    apply: (id: string) => request<PlanChangeDto>(`/plan-changes/${id}/apply`, { method: "POST" }),
    reject: (id: string) => request<PlanChangeDto>(`/plan-changes/${id}/reject`, { method: "POST" }),
    revert: (id: string) => request<PlanChangeDto>(`/plan-changes/${id}/revert`, { method: "POST" }),
  },

  notifications: {
    list: (unreadOnly = false) =>
      request<{ items: NotificationDto[]; types: string[] }>(`/notifications${unreadOnly ? "?unread=1" : ""}`),
    markRead: (id: string) => request<{ read: boolean }>(`/notifications/${id}/read`, { method: "POST" }),
    create: (body: { type: string; title: string; body?: string; scheduledAt?: string }) =>
      request<{ id: string; scheduledAt: string | null }>("/notifications", { body }),
  },
};
