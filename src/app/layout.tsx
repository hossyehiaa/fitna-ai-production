import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "فِطنة | محاكي الفصل الذكي",
    template: "%s | فِطنة",
  },
  description:
    "منصة فِطنة للتدريب التربوي: تدرّب على إدارة الفصل عبر محاكاة صوتية تفاعلية بطلابٍ افتراضيين، واختر نمط التحدث السعودي أو المصري لوكلاء الذكاء الاصطناعي.",
  keywords: ["فتنة", "تدريب المعلمين", "محاكاة الفصل", "الذكاء الاصطناعي", "تعليم"],
  openGraph: {
    title: "فِطنة | محاكي الفصل الذكي",
    description: "محاكاة صوتية تفاعلية لتدريب المعلمين بالذكاء الاصطناعي",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#1a2121" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Applied before paint to avoid theme flash; falls back to system preference.
const themeInitScript = `
try {
  var t = localStorage.getItem('fitna-theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-app-sans: 'Tajawal', 'Segoe UI', system-ui, sans-serif;
            --font-heading: 'Cairo', 'Tajawal', sans-serif;
            --font-app-mono: ui-monospace, monospace;
          }
        `}</style>
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
