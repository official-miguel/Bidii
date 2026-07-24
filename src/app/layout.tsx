import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider, ThemeScript } from "@/components/ThemeProvider";
import ProductivityProvider from "@/components/ProductivityProvider";

export const metadata: Metadata = {
  title: "Bidii School Management System",
  description: "School management system for Kenyan schools.",
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/icons/icon-192.png", sizes: "192x192" },
    shortcut: "/icons/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#2C7F7E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-sans antialiased bg-paper dark:bg-dark-bg text-ink dark:text-dark-text">
        <ThemeProvider>
          <ProductivityProvider>{children}</ProductivityProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
