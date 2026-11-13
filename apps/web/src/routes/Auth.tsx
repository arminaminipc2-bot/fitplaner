import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button, Card, Chip, Field, TextInput } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { useSubmit } from "../lib/useApiData";

/**
 * Sign in, sign up and password recovery. Client validation is deliberately
 * thin: the server owns the rules and answers in Persian, so the form shows the
 * message it gets instead of a second set of rules that could disagree with it.
 */

const fieldError = (error: ApiError | null, key: string): string | undefined =>
  error instanceof ApiError ? error.fields[key] : undefined;

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { status, refresh } = useSession();
  const navigate = useNavigate();
  const { pending, error, run } = useSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  if (status === "authenticated") return <Navigate to="/" replace />;

  const submit = async () => {
    const user = await run(() =>
      mode === "login" ? api.auth.login({ email, password }) : api.auth.register({ email, password, displayName: displayName || undefined }),
    );
    if (!user) return;
    await refresh();
    navigate(user.onboardingCompleted ? "/" : "/onboarding", { replace: true });
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-6 bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-md border border-line bg-card text-2xs font-bold text-ink-2"
            aria-hidden
          >
            FP
          </span>
          <div>
            <h1 className="text-xl font-bold">فیت‌پلنر</h1>
            <p className="text-2xs text-ink-3">برنامه تمرین و تغذیه، با داده‌های واقعی خودتان</p>
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">{mode === "login" ? "ورود به حساب" : "ساخت حساب کاربری"}</h2>

          {mode === "register" ? (
            <Field label="نام شما" htmlFor="displayName" hint="اختیاری — در سربرگ برنامه نمایش داده می‌شود." error={fieldError(error, "displayName")}>
              <TextInput
                id="displayName"
                value={displayName}
                autoComplete="name"
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
          ) : null}

          <Field label="ایمیل" htmlFor="email" error={fieldError(error, "email")}>
            <TextInput
              id="email"
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="text-left font-mono"
              invalid={Boolean(fieldError(error, "email"))}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field
            label="رمز عبور"
            htmlFor="password"
            hint={mode === "register" ? "حداقل ۸ نویسه." : undefined}
            error={fieldError(error, "password")}
          >
            <TextInput
              id="password"
              type="password"
              dir="ltr"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="text-left font-mono"
              invalid={Boolean(fieldError(error, "password"))}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </Field>

          {error && Object.keys(error.fields).length === 0 ? (
            <p role="alert" className="rounded-md border border-ink-3 bg-card-2 px-3 py-2 text-sm text-ink">
              {error.message}
            </p>
          ) : null}

          <Button variant="primary" block loading={pending} onClick={() => void submit()}>
            {mode === "login" ? "ورود" : "ساخت حساب"}
          </Button>

          <div className="flex items-center justify-between gap-3 text-2xs text-ink-3">
            {mode === "login" ? (
              <Link to="/register" className="underline-offset-4 hover:text-ink hover:underline">
                حساب ندارید؟ ساخت حساب
              </Link>
            ) : (
              <Link to="/login" className="underline-offset-4 hover:text-ink hover:underline">
                حساب دارید؟ وارد شوید
              </Link>
            )}
            <Link to="/forgot" className="underline-offset-4 hover:text-ink hover:underline">
              رمز را فراموش کرده‌اید؟
            </Link>
          </div>
        </Card>

        <p className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-ink-3">
          <Chip tone="outline">رمز فقط در سرور نگه‌داری می‌شود</Chip>
          <Chip tone="outline">کلید هوش مصنوعی هرگز به این مرورگر نمی‌آید</Chip>
        </p>
      </div>
    </div>
  );
}

/**
 * Recovery in two steps. Mail delivery is not wired up, so the dev token the API
 * returns is shown as what it is — a local shortcut, not an email that was sent.
 */
export function ForgotPassword() {
  const { status } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [done, setDone] = useState(false);
  const request = useSubmit();
  const confirm = useSubmit();

  if (status === "authenticated") return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-4 bg-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-[420px]">
        <Card className="flex flex-col gap-4">
          <h1 className="text-lg font-bold">بازیابی رمز عبور</h1>

          {done ? (
            <>
              <p className="text-sm text-ink-2">رمز عوض شد و همه دستگاه‌های دیگر از حساب خارج شدند.</p>
              <Button variant="primary" block onClick={() => navigate("/login", { replace: true })}>
                ورود با رمز جدید
              </Button>
            </>
          ) : step === "confirm" ? (
            <>
              <Field label="رمز جدید" htmlFor="np" hint="حداقل ۸ نویسه." error={msg(confirm.error)}>
                <TextInput
                  id="np"
                  type="password"
                  dir="ltr"
                  className="text-left font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {issuedToken ? (
                <p className="rounded-md border border-divider bg-card-2 px-3 py-2 text-2xs text-ink-2">
                  <span>کد بازیابی این نشانی: </span>
                  <span dir="ltr" className="font-mono">
                    {issuedToken}
                  </span>
                </p>
              ) : null}
              <Field label="کد بازیابی" htmlFor="rt">
                <TextInput
                  id="rt"
                  dir="ltr"
                  className="text-left font-mono"
                  placeholder="۶۴ نویسه"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </Field>
              <Button
                variant="primary"
                block
                loading={confirm.pending}
                onClick={async () => {
                  const result = await confirm.run(() => api.auth.confirmPasswordReset(token, password));
                  if (result?.changed) setDone(true);
                }}
              >
                ذخیره رمز جدید
              </Button>
            </>
          ) : (
            <>
              <Field label="ایمیل حساب" htmlFor="re" error={msg(request.error)}>
                <TextInput
                  id="re"
                  type="email"
                  dir="ltr"
                  className="text-left font-mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button
                variant="primary"
                block
                loading={request.pending}
                onClick={async () => {
                  const result = await request.run(() => api.auth.requestPasswordReset(email));
                  if (!result) return;
                  setIssuedToken(result.devResetToken ?? null);
                  setStep("confirm");
                }}
              >
                درخواست کد بازیابی
              </Button>
              <p className="text-sm leading-relaxed text-ink-3">
                ارسال ایمیل در این نسخه راه‌اندازی نشده است. اگر سرور کدی برگرداند، همان‌جا
                نمایش داده می‌شود؛ در غیر این صورت درخواست ثبت می‌شود و هیچ ایمیلی فرستاده نمی‌شود.
              </p>
            </>
          )}

          <Link to="/login" className="text-2xs text-ink-3 underline-offset-4 hover:text-ink hover:underline">
            بازگشت به ورود
          </Link>
        </Card>
      </div>
    </div>
  );
}

const msg = (error: unknown): string | undefined =>
  error instanceof ApiError ? (error.fields.password ?? error.fields.token ?? error.fields.email ?? error.message) : undefined;
