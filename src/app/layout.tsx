import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo Inventory — Reservation System",
  description:
    "Concurrency-safe inventory reservation system for multi-warehouse retail fulfillment. Reserve units, confirm purchases, and manage stock in real-time.",
  keywords: ["inventory", "reservation", "warehouse", "e-commerce", "Allo Health"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="grid-bg">
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          toastOptions={{
            style: {
              background: "rgba(18, 18, 26, 0.95)",
              border: "1px solid var(--border)",
              backdropFilter: "blur(20px)",
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
