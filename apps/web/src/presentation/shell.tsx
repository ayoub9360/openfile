"use client"
import { authClient } from "../infrastructure/auth-client"
import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Plus,
  PanelLeftClose,
  Menu,
  Sun,
  Moon,
  ChevronsUpDown,
  LogOut,
  Settings,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback } from "@open-file/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@open-file/ui/components/dropdown-menu"
import { Button } from "@open-file/ui/components/button"
import { useWorkspace } from "./workspace-context"
import { navigation } from "./config"
import { BrandLogo } from "./components/brand-logo"
import { ImportDialog } from "./components/import-dialog"
export function Shell({ children }: { children: ReactNode }) {
  const { state, openImport } = useWorkspace()
  const path = usePathname()
  const router = useRouter()
  const [mobile, setMobile] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const title =
    navigation.find((n) => n.href === path)?.label ?? "Your workspace"
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault()
        router.push("/search")
      }
      if (event.key === "Escape") setMobile(false)
    }
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [router])
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <Link href="/" className="brand" onClick={() => setMobile(false)}>
          <BrandLogo />
          <span className="brand-beta">BETA</span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        >
          <PanelLeftClose size={18} />
        </button>
        <div className="nav-label first-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.slice(0, 3).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobile(false)}
              className={`nav-item ${path === href ? "active" : ""}`}
              aria-current={path === href ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{label}</span>
              {href === "/search" && <span className="tiny-badge">AI</span>}
            </Link>
          ))}
        </nav>
        <div className="nav-label second-label">ORGANIZATION</div>
        <nav aria-label="Organization">
          {navigation.slice(3, 5).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobile(false)}
              className={`nav-item ${path === href ? "active" : ""}`}
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="profile-trigger"
                aria-label={`User menu for ${state.settings.name}`}
              >
                <Avatar>
                  <AvatarFallback>
                    {state.settings.name.trim().slice(0, 1).toUpperCase() ||
                      "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="profile-identity">
                  <strong>{state.settings.name}</strong>
                  <small>Personal account</small>
                </span>
                <ChevronsUpDown size={14} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 max-w-[calc(100vw-24px)]"
                side="top"
                align="start"
                sideOffset={10}
              >
                <div className="flex items-center gap-3 px-2 py-2">
                  <Avatar>
                    <AvatarFallback>
                      {state.settings.name.trim().slice(0, 1).toUpperCase() ||
                        "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      {state.settings.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Personal account
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="py-2 text-xs"
                  onClick={() => {
                    setMobile(false)
                    router.push("/settings")
                  }}
                >
                  <Settings className="size-3.5" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="py-2 text-xs"
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="size-3.5" />
                  ) : (
                    <Moon className="size-3.5" />
                  )}
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="py-2 text-xs"
                  variant="destructive"
                  onClick={async () => {
                    await authClient.signOut()
                    window.location.reload()
                  }}
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open menu"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Personal workspace<span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <Button size="sm" onClick={() => openImport()}>
              <Plus size={15} />
              Import<span className="desktop-only"> a document</span>
            </Button>
          </div>
        </header>
        <main id="main-content" className="main-content" key={path}>
          {children}
        </main>
      </div>
      <ImportDialog />
    </div>
  )
}
