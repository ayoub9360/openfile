import { Assistant } from "@/src/presentation/pages/assistant"
import { Suspense } from "react"
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Assistant />
    </Suspense>
  )
}
