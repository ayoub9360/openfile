import { Documents } from "@/src/presentation/pages/documents"
import { Suspense } from "react"
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Documents />
    </Suspense>
  )
}
