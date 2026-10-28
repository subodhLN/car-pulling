'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginAction, signUpAction } from './actions';
import { authErrorMessage } from './messages';
import { loginSchema, safeNext, signUpSchema } from './schemas';

type Mode = 'login' | 'signup';
type Errors = Partial<Record<'name' | 'email' | 'password' | 'phone', string>>;

function Field({
  id,
  label,
  error,
  hint,
  ...props
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
} & React.ComponentProps<'input'>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isSignup = mode === 'signup';

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setFormError(null);

    const parsed = (isSignup ? signUpSchema : loginSchema).safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    start(async () => {
      const res = await (isSignup ? signUpAction(raw) : loginAction(raw));
      if (res.ok) {
        router.push(safeNext(next));
        router.refresh();
        return;
      }
      setFormError(authErrorMessage(res.code, res.message));
    });
  }

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <p role="alert" className="rounded-[14px] border border-danger px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      {isSignup ? (
        <Field id="name" label="Full name" autoComplete="name" error={errors.name} />
      ) : null}
      <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email} />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        error={errors.password}
        hint={isSignup ? 'At least 8 characters' : undefined}
      />
      {isSignup ? (
        <Field
          id="phone"
          label="Mobile number (optional)"
          type="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          error={errors.phone}
          hint="Shared with riders and drivers only once a booking is accepted."
        />
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
      </Button>
      <p className="text-center text-sm text-muted">
        {isSignup ? 'Already have an account? ' : 'New to RideShare? '}
        <Link href={`${isSignup ? '/login' : '/signup'}${nextQuery}`} className="font-semibold text-fg underline">
          {isSignup ? 'Log in' : 'Sign up'}
        </Link>
      </p>
    </form>
  );
}
