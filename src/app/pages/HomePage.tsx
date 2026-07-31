import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">Soulside Clinical Notes</h1>
      <p>Application shell is running. Domain features will be added in later steps.</p>
      <ul>
        <li>
          <Link to="/notes">Notes</Link> — list view with filters, search, and cursor pagination
        </li>
        <li>
          <span>Architecture status</span> — see docs/architecture.md
        </li>
        <li>
          <span>Test status</span> — Vitest and Playwright scaffolding configured
        </li>
      </ul>
    </section>
  )
}
