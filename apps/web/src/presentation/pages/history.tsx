"use client"
import { AppSelect } from "../components/app-select"
import { useMemo, useState } from "react"
import {
  Check,
  Search,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useWorkspace } from "../workspace-context"
import { PageHeading, dateLabel, EmptyState } from "../components/primitives"
import { DocumentDetail } from "../components/document-detail"
export function HistoryPage() {
  const { state } = useWorkspace()
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [detail, setDetail] = useState<string | null>(null)
  const selected = state.documents.find((d) => d.id === detail)
  const activities = useMemo(
    () =>
      state.activities
        .filter((a) =>
          `${a.title} ${a.detail}`
            .toLocaleLowerCase("en")
            .includes(query.trim().toLocaleLowerCase("en"))
        )
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    [state.activities, query]
  )
  const pageCount = Math.max(1, Math.ceil(activities.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * pageSize
  const visibleActivities = activities.slice(start, start + pageSize)
  return (
    <>
      <PageHeading
        title="History"
        description="Review imports, analyses, and filings in your workspace."
      />
      <div className="document-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search history"
            placeholder="Search actions…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <label className="history-page-size">
          Per page
          <AppSelect
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value))
              setPage(1)
            }}
            options={[10, 20, 50].map((value) => ({
              value: String(value),
              label: String(value),
            }))}
          />
        </label>
      </div>
      <section className="panel activity-panel" aria-label="History events">
        {activities.length ? (
          visibleActivities.map((a) => (
            <div className="activity-row" key={a.id}>
              <span className="activity-dot">
                <Check size={15} />
              </span>
              <div className="grow">
                <strong>{a.title}</strong>
                <p title={a.detail}>{a.detail}</p>
              </div>
              <time className="activity-date" dateTime={a.date}>
                <span>{dateLabel(a.date)}</span>{" "}
                <span>
                  {new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  }).format(new Date(a.date))}
                </span>
              </time>
              {state.documents.some(
                (document) => document.id === a.documentId
              ) && (
                <button
                  className="icon-button"
                  aria-label={`View ${a.detail}`}
                  onClick={() => setDetail(a.documentId!)}
                >
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          ))
        ) : (
          <EmptyState
            title={query.trim() ? "No results" : "Your history is empty"}
            description={
              query.trim()
                ? "Try another keyword."
                : "Your next actions will appear here."
            }
          />
        )}
      </section>
      <div className="history-footer">
        <span className="muted" role="status">
          {activities.length
            ? `${start + 1}–${Math.min(start + pageSize, activities.length)} of ${activities.length}`
            : "0"}{" "}
          event{activities.length !== 1 ? "s" : ""}
        </span>
        <nav className="history-pagination" aria-label="History pagination">
          <button
            className="icon-button"
            aria-label="Previous page"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <button
            className="icon-button"
            aria-label="Next page"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      </div>
      {selected && (
        <DocumentDetail
          key={selected.id}
          document={selected}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  )
}
