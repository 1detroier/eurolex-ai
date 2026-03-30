import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "EuroLex AI — European Law Assistant",
  description:
    "AI-powered assistant for European Union legal documents. Get instant answers grounded in EUR-Lex regulations: GDPR, AI Act, DSA, DMA.",
  keywords: [
    "EU law",
    "European law",
    "GDPR",
    "AI Act",
    "DSA",
    "DMA",
    "EUR-Lex",
    "legal assistant",
    "AI",
  ],
  authors: [{ name: "EuroLex AI" }],
  openGraph: {
    title: "EuroLex AI — European Law Assistant",
    description:
      "AI-powered assistant for European Union legal documents. Get instant answers grounded in EUR-Lex regulations.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={cn(
          inter.className,
          "flex h-screen flex-col bg-background text-foreground antialiased"
        )}
      >
        {children}
      </body>
    </html>
  );
}
