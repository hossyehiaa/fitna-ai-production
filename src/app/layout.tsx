import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { I18nProvider } from '@/lib/i18n/context';
import type { Language } from '@/lib/i18n/types';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fitna AI | محاكاة',
  description: 'اتقن إدارة الفصل قبل أن تدخله - AI-Powered Classroom Simulation',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/logo/fitna-icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/logo/fitna-icon.png',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value === 'dark' ? 'dark' : 'light';
  const lang = (cookieStore.get('language')?.value === 'en' ? 'en' : 'ar') as Language;
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  return (
    <html lang={lang} dir={dir} className={theme === 'dark' ? 'dark' : ''}>
      <body>
        <I18nProvider initialLang={lang}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
