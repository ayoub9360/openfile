"use client"
import { useState, type ReactNode } from "react"
import { Button } from "@open-file/ui/components/button"
import { BrandLogo } from "./components/brand-logo"
import { authClient } from "../infrastructure/auth-client"
export function AuthGate({ children }: { children: ReactNode }) {
  const {
    data,
    isPending,
    error: sessionError,
    refetch,
  } = authClient.useSession()
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  if (isPending)
    return (
      <div className="app-loading">
        <BrandLogo variant="icon" className="loading-logo" />
        <p>Preparing your workspace…</p>
      </div>
    )
  if (data) return children
  return (
    <main className="auth-page">
      <div className="auth-intro">
        <BrandLogo className="auth-logo" />
        <h1>
          A little less
          <br />
          paperwork.
        </h1>
        <p>
          Your documents, neatly organized.
          <br />
          Your answers, close at hand.
        </p>
      </div>
      <form
        className="panel auth-card"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError("")
          const fields = new FormData(e.currentTarget)
          try {
            const input = {
              email: String(fields.get("email")),
              password: String(fields.get("password")),
            }
            const result = register
              ? await authClient.signUp.email({
                  ...input,
                  name: String(fields.get("name")),
                  fetchOptions: {
                    headers: {
                      "x-signup-token": String(fields.get("invitation")),
                    },
                  },
                })
              : await authClient.signIn.email(input)
            if (result.error)
              setError(result.error.message ?? "Unable to sign in.")
            else await refetch()
          } catch {
            setError("The server is unavailable. Please try again.")
          } finally {
            setBusy(false)
          }
        }}
      >
        <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
        <h2>{register ? "Make some room." : "Welcome back."}</h2>
        <p>
          {register
            ? "Use an invitation from the administrator to create your account."
            : "Sign in to Open File."}
        </p>
        {register && (
          <label className="field">
            Your name
            <input name="name" autoComplete="name" required maxLength={100} />
          </label>
        )}
        <label className="field">
          Email address
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={12}
            required
          />
        </label>
        {register && (
          <>
            <small>At least 12 characters.</small>
            <label className="field">
              Invitation code
              <input
                name="invitation"
                type="password"
                autoComplete="off"
                required
                maxLength={256}
              />
            </label>
          </>
        )}
        {(error || sessionError) && (
          <p role="alert">{error || "The server is unavailable."}</p>
        )}
        <Button disabled={busy} type="submit" className="full-width">
          {busy ? "Just a moment…" : register ? "Create my account" : "Sign in"}
        </Button>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setRegister(!register)
            setError("")
          }}
        >
          {register ? "I already have an account" : "Create an account"}
        </button>
      </form>
    </main>
  )
}
