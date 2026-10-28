import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DemoAccountsPanel } from '@/modules/auth/demo-accounts';

afterEach(() => vi.unstubAllEnvs());

function renderWithForm() {
  return render(
    <>
      <form>
        <input id="email" name="email" />
        <input id="password" name="password" />
      </form>
      <DemoAccountsPanel />
    </>,
  );
}

describe('DemoAccountsPanel', () => {
  it('lists the three seeded demo accounts with the shared password', () => {
    expect(DEMO_ACCOUNTS.map((a) => a.email)).toEqual([
      'driver@demo.test',
      'passenger@demo.test',
      'admin@demo.test',
    ]);
    renderWithForm();
    expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(3);
    expect(screen.getByText(`Demo password: ${DEMO_PASSWORD}`)).toBeInTheDocument();
  });

  it('fills the email and password fields when a Use button is clicked', () => {
    renderWithForm();
    fireEvent.click(screen.getByRole('button', { name: 'Use passenger demo account' }));
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('passenger@demo.test');
    expect((document.getElementById('password') as HTMLInputElement).value).toBe(DEMO_PASSWORD);
  });

  it('renders nothing when NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS is "false"', () => {
    vi.stubEnv('NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS', 'false');
    const { container } = render(<DemoAccountsPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});
