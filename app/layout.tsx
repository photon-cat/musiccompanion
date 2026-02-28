import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aria — Music Companion",
  description: "AI music companion with VRM avatar, voice chat, and choreographed music sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
