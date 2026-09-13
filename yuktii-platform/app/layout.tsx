import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yuktii AI Labs — Self-Paced Internship & Certification Platform',
  description:
    'Project-based internships across 8 technical domains. No live mentor required — self-check your work, earn a verifiable certificate.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}

