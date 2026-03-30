import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "EuroLex AI - European Law Assistant",
  description: "AI-powered assistant for European Union legal documents. Get instant answers from EUR-Lex regulations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className={cn(
        inter.className,
        "min-h-screen bg-background text-foreground antialiased"
      )}>
        {/* Legal Disclaimer Banner - Placeholder */}
        {/* TODO: Implement disclaimer banner with localStorage persistence */}
        
        {children}
      </body>
    </html>
  );
}
