import Link from "next/link"
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>This page has gone missing.</h1>
      <p>Let's get back to your document workspace.</p>
      <Link href="/" className="text-link">
        Back to home →
      </Link>
    </div>
  )
}
