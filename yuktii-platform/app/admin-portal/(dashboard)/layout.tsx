import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import AdminNav from './AdminNav';

export default async function AdminPortalDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/admin-portal/login');

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#171923] flex flex-col md:flex-row">
      <AdminNav userEmail={session.email} />
      <main className="flex-1 min-h-screen bg-[#faf9f6] md:pl-60">
        {children}
      </main>
    </div>
  );
}
