import './AppLayout.css'

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AppLayoutProps = {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <header>
        <p>
          <Link to="/">Soulside Clinical Notes</Link>
        </p>
        <nav aria-label="Primary">
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/notes">Notes</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <p>Soulside clinical notes — development build</p>
      </footer>
    </div>
  )
}
