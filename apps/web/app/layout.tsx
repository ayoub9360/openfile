import { headers } from "next/headers"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "@open-file/ui/globals.css"
import "@/src/presentation/styles.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Application } from "@/src/bootstrap/application"
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })
export const metadata: Metadata = {
  title: "Open File — A little less paperwork",
  description: "Your intelligent document workspace. Upload, review, find.",
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${mono.variable}`}
    >
      <body>
        <ThemeProvider defaultTheme="light" nonce={nonce}>
          <Application>{children}</Application>
        </ThemeProvider>
      </body>
    </html>
  )
}
