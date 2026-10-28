import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, avatarTone, initials } from '@/components/ui/avatar';

describe('Avatar', () => {
  it('Avatar shows initials when no image', () => {
    render(<Avatar name="Rohit Sharma" />);
    expect(screen.getByText('RS')).toBeInTheDocument();
  });

  it('uses the first and last name for initials', () => {
    expect(initials('Meera Kaur Singh')).toBe('MS');
    expect(initials('  arjun  ')).toBe('A');
    expect(initials('')).toBe('?');
  });

  it('picks the same earth tone for the same name', () => {
    expect(avatarTone('Rohit Sharma')).toBe(avatarTone('Rohit Sharma'));
    const tones = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Rohit', 'Meera'].map(avatarTone));
    expect(tones.size).toBeGreaterThan(1);
  });

  it('renders the image with the name as alt text when given', () => {
    render(<Avatar name="Meera Kaur" image="https://example.com/m.jpg" size={40} />);
    const img = screen.getByRole('img', { name: 'Meera Kaur' });
    expect(img).toHaveAttribute('src', 'https://example.com/m.jpg');
    expect(screen.queryByText('MK')).not.toBeInTheDocument();
  });

  it('labels the initials fallback with the full name', () => {
    render(<Avatar name="Rohit Sharma" size={48} />);
    const el = screen.getByRole('img', { name: 'Rohit Sharma' });
    expect(el).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('centres the initials with a single display mode (no inline-block fighting grid)', () => {
    render(<Avatar name="Rohit Sharma" size={48} />);
    const classes = screen.getByRole('img', { name: 'Rohit Sharma' }).className.split(/\s+/);
    expect(classes).toContain('inline-grid');
    expect(classes).toContain('place-items-center');
    expect(classes).not.toContain('inline-block');
    expect(classes).not.toContain('grid');
  });
});
