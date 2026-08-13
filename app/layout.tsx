import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Capital — Make the next hour count",
  description:
    "A private hourly accountability system for turning available time into learning, useful outputs, leverage, and career capital.",
  applicationName: "Capital",
  openGraph: {
    title: "Capital — Make the next hour count",
    description: "Plan the hour. Capture the evidence. Learn what compounds.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Capital — Make the next hour count" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Capital — Make the next hour count",
    description: "Plan the hour. Capture the evidence. Learn what compounds.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
