import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/ThemeToggle';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2.5">
          <span className="mr-4 font-display text-lg font-bold tracking-wide text-primary">Palworld TCG</span>
          <NavLink to="/" end className={navClass}>
            Play
          </NavLink>
          <NavLink to="/cards" className={navClass}>
            Cards
          </NavLink>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
