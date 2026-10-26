import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { HelpDialog } from '@/components/HelpDialog';
import { ThemeToggle } from '@/components/ThemeToggle';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3',
    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-0.5 px-3 py-2 sm:gap-1 sm:px-4 sm:py-2.5">
          <span className="mr-2 font-display text-base font-bold tracking-wide whitespace-nowrap text-primary sm:mr-4 sm:text-lg">
            Palworld TCG
          </span>
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          <NavLink to="/play/local" className={navClass}>
            Play
          </NavLink>
          <NavLink to="/cards" className={navClass}>
            Cards
          </NavLink>
          <div className="ml-auto flex items-center">
            <HelpDialog />
            <ThemeToggle />
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
