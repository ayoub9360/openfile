"use client"
import { AppSelect } from "../components/app-select"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon, Monitor, Download, Check } from "lucide-react"
import { Button } from "@open-file/ui/components/button"
import {
  englishNamingTemplate,
  type IntegrationSettings,
} from "../../domain/workspace"
import { useWorkspace } from "../workspace-context"
import { BrandLogo } from "../components/brand-logo"
import { PageHeading, PanelHeading } from "../components/primitives"
export function Settings() {
  const { state, service, run, notify } = useWorkspace()
  const [draft, setDraft] = useState({
    ...state.settings,
    naming: englishNamingTemplate(state.settings.naming),
  })
  const [savedEnabled, setSavedEnabled] = useState<boolean | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationSettings | null>(
    null
  )
  const [key, setKey] = useState("")
  const [removeKey, setRemoveKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    let active = true
    service
      .integrations()
      .then((s) => {
        if (active) {
          setIntegrations(s)
          setSavedEnabled(s.ai.enabled)
        }
      })
      .catch(() => {
        if (active) setError("Unable to load integrations. Reload the page.")
      })
    return () => {
      active = false
    }
  }, [service])
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "open-file.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify("Metadata and extracted text exported")
  }
  return (
    <>
      <PageHeading
        title="A workspace of your own"
        description="Your profile, storage destinations, and document intelligence."
      />
      <div className="settings-layout">
        <div>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await run(() => service.saveSettings(draft), "Preferences saved")
            }}
          >
            <section className="panel settings-panel">
              <PanelHeading
                title="Your profile"
                description="A private workspace linked to your account."
              />
              <div className="settings-body">
                <div className="form-grid">
                  <label className="field">
                    Your name
                    <input
                      required
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Email address
                    <input type="email" readOnly value={draft.email} />
                  </label>
                </div>
                <label className="field">
                  Custom naming (optional)
                  <input
                    placeholder="Automatic: a descriptive name suggested by AI"
                    value={draft.naming}
                    onChange={(e) =>
                      setDraft({ ...draft, naming: e.target.value })
                    }
                  />
                </label>
                <p className="subtle-note">
                  Leave blank for a name based on the content, such as
                  Blood_test.pdf. Otherwise, use: {"{date}, {type}, {issuer}"}.
                </p>
                <Button type="submit">
                  <Check size={15} />
                  Save preferences
                </Button>
              </div>
            </section>
          </form>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!integrations) return
              setBusy(true)
              setError("")
              try {
                const { hasApiKey: _hasApiKey, ...ai } = integrations.ai
                const saved = await service.saveIntegrations({
                  ai: { ...ai, ...(key ? { apiKey: key } : {}), removeKey },
                  localFolder: integrations.connectors.localFolder,
                  driveFolder: integrations.connectors.driveFolder,
                })
                setIntegrations(saved)
                setSavedEnabled(saved.ai.enabled)
                setKey("")
                setRemoveKey(false)
                await run(() => service.load(), "Integrations saved")
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to save.")
              } finally {
                setBusy(false)
              }
            }}
          >
            <section className="panel settings-panel">
              <PanelHeading
                title="Document intelligence"
                description="The provider and models used for your documents."
              />
              <div className="settings-body">
                {integrations ? (
                  <>
                    <div
                      className={`ai-status-card ${savedEnabled ? "enabled" : "disabled"}`}
                      role="status"
                    >
                      <strong>
                        {savedEnabled
                          ? "AI enabled"
                          : "AI disabled — manual filing"}
                      </strong>
                      <p>
                        {savedEnabled
                          ? "Your imports receive a suggested name and folder. You approve each filing."
                          : "A saved key alone is not enough: choose automatic mode below and save to enable suggestions."}
                      </p>
                      {savedEnabled !== integrations.ai.enabled && (
                        <p>
                          <strong>Mode change not saved.</strong>
                        </p>
                      )}
                    </div>
                    <fieldset className="ai-mode-options">
                      <legend>How should your documents be prepared?</legend>
                      <label
                        className={integrations.ai.enabled ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name="ai-mode"
                          checked={integrations.ai.enabled}
                          onChange={() =>
                            setIntegrations({
                              ...integrations,
                              ai: { ...integrations.ai, enabled: true },
                            })
                          }
                        />
                        <span>
                          <strong>Automatically with AI</strong>
                          <small>
                            Readable names, organized folders, and intelligent
                            search. The required content is sent to OpenAI using
                            your key.
                          </small>
                        </span>
                      </label>
                      <label
                        className={!integrations.ai.enabled ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          name="ai-mode"
                          checked={!integrations.ai.enabled}
                          onChange={() =>
                            setIntegrations({
                              ...integrations,
                              ai: { ...integrations.ai, enabled: false },
                            })
                          }
                        />
                        <span>
                          <strong>Manually, without AI</strong>
                          <small>
                            You choose the name and folder. Only local text
                            extraction is performed.
                          </small>
                        </span>
                      </label>
                    </fieldset>
                    <label className="field">
                      Provider
                      <AppSelect
                        value="openai"
                        disabled
                        options={[{ value: "openai", label: "OpenAI" }]}
                      />
                    </label>
                    <label className="field">
                      OpenAI API key
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        placeholder={
                          integrations.ai.hasApiKey
                            ? "Saved key ••••••••"
                            : "sk-…"
                        }
                      />
                    </label>
                    {integrations.ai.hasApiKey && (
                      <label className="field">
                        <span>
                          <input
                            type="checkbox"
                            checked={removeKey}
                            onChange={(e) => setRemoveKey(e.target.checked)}
                          />{" "}
                          Delete saved key
                        </span>
                      </label>
                    )}
                    <div className="form-grid">
                      <label className="field">
                        Analysis and answer model
                        <input
                          required
                          value={integrations.ai.model}
                          onChange={(e) =>
                            setIntegrations({
                              ...integrations,
                              ai: { ...integrations.ai, model: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        Embedding model
                        <AppSelect
                          value={integrations.ai.embeddingModel}
                          onValueChange={(value) =>
                            setIntegrations({
                              ...integrations,
                              ai: {
                                ...integrations.ai,
                                embeddingModel: value,
                              },
                            })
                          }
                          options={[
                            "text-embedding-3-small",
                            "text-embedding-3-large",
                          ].map((value) => ({ value, label: value }))}
                        />
                      </label>
                    </div>
                    <Button
                      disabled={
                        busy ||
                        (integrations.ai.enabled &&
                          !integrations.ai.hasApiKey &&
                          !key.trim())
                      }
                      type="submit"
                    >
                      {busy
                        ? "Saving…"
                        : integrations.ai.enabled
                          ? "Save and enable AI"
                          : "Save manual mode"}
                    </Button>
                    <p className="subtle-note">
                      Without AI, text in PDF and TXT files remains searchable.
                      After changing models, rerun analysis for documents that
                      need reindexing.
                    </p>
                  </>
                ) : (
                  <p>Loading settings…</p>
                )}
              </div>
            </section>
            {integrations && (
              <section className="panel settings-panel">
                <PanelHeading
                  title="Storage destinations"
                  description="The folders used for your next imports."
                />
                <div className="settings-body">
                  <label className="field">
                    Local folder
                    <input
                      required
                      value={integrations.connectors.localFolder}
                      onChange={(e) =>
                        setIntegrations({
                          ...integrations,
                          connectors: {
                            ...integrations.connectors,
                            localFolder: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <p className="subtle-note">
                    Relative path within your private server workspace.
                    Configure the root folder with STORAGE_ROOT or the Docker
                    volume.
                  </p>
                  <label className="field">
                    Google Drive folder
                    <input
                      required
                      value={integrations.connectors.driveFolder}
                      onChange={(e) =>
                        setIntegrations({
                          ...integrations,
                          connectors: {
                            ...integrations.connectors,
                            driveFolder: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <p className="subtle-note">
                    {integrations.connectors.googleConfigured
                      ? "Google is configured. Authorize access from the Connectors page."
                      : "Google requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server configuration."}
                  </p>
                </div>
              </section>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="settings-save">
              <Button disabled={!integrations || busy} type="submit">
                <Check size={15} />
                {busy ? "Saving…" : "Save integrations"}
              </Button>
            </div>
          </form>
        </div>
        <div>
          <section className="panel settings-panel">
            <PanelHeading
              title="Appearance"
              description="Choose the look of your workspace."
            />
            <div className="appearance-grid">
              {[
                { id: "light", name: "Light", icon: Sun },
                { id: "dark", name: "Dark", icon: Moon },
                { id: "system", name: "System", icon: Monitor },
              ].map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  aria-pressed={theme === id}
                  className={theme === id ? "selected" : ""}
                >
                  <div className={`theme-thumbnail ${id}`}>
                    <i />
                    <span>
                      <b />
                      <b />
                      <b />
                    </span>
                  </div>
                  <span>
                    <Icon size={13} />
                    {name}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel settings-panel">
            <PanelHeading title="Your data" />
            <div className="settings-body">
              <p className="subtle-note">
                Download metadata and extracted text from your workspace. Keys
                and tokens are not included.
              </p>
              <Button
                variant="outline"
                className="full-width"
                onClick={exportData}
              >
                <Download size={14} />
                Export JSON data
              </Button>
            </div>
          </section>
          <div className="settings-about">
            <BrandLogo variant="vertical" />
            <span>A little less paperwork.</span>
            <small>v0.2</small>
          </div>
        </div>
      </div>
    </>
  )
}
