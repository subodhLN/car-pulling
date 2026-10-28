import { signOut } from '@/auth';

export function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server';
        await signOut({ redirectTo: '/' });
      }}
    >
      <button type="submit" className="block w-full rounded-[10px] px-3 py-2 text-left hover:bg-soft">
        Log out
      </button>
    </form>
  );
}
