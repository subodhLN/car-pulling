'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_BIO } from '@/modules/users/schemas';
import { updateProfileAction } from '@/modules/users/actions';

type Values = { name: string; bio: string; phone: string };

export function ProfileForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    setSaved(false);
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateProfileAction(values);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5" aria-describedby={error ? 'profile-error' : undefined}>
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-semibold">
          Name
        </label>
        <Input id="name" name="name" required maxLength={80} autoComplete="name" value={values.name} onChange={set('name')} />
      </div>
      <div>
        <label htmlFor="bio" className="mb-1.5 block text-sm font-semibold">
          About you (optional)
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={MAX_BIO}
          value={values.bio}
          onChange={set('bio')}
          aria-describedby="bio-count"
          placeholder="Where you usually travel, music in the car, chatty or quiet…"
          className="w-full rounded-[14px] border border-line bg-surface px-4 py-3 text-base text-fg placeholder:text-muted hover:border-muted"
        />
        <p id="bio-count" className="text-right text-xs text-muted tabular-nums">
          {values.bio.length}/{MAX_BIO}
        </p>
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold">
          Mobile number (optional)
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={values.phone}
          onChange={set('phone')}
          aria-describedby="phone-hint"
        />
        <p id="phone-hint" className="mt-1.5 text-sm text-muted">
          Only shared with your co-travellers once a booking is accepted. Never shown on your public profile.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
        {saved ? (
          <p role="status" className="text-sm font-semibold text-success">
            Profile saved
          </p>
        ) : null}
      </div>
      {error ? (
        <p id="profile-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
