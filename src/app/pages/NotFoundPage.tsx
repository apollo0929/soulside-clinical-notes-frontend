import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <p>The requested route does not exist.</p>
      <p>
        <Link to="/">Return home</Link>
      </p>
    </section>
  )
}
