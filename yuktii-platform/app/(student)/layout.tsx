import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
