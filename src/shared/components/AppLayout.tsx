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
              <span aria-disabled="true">Notes</span>
            </li>
          </ul>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        <p>Step 0 — application shell</p>
      </footer>
    </div>
  )
}
