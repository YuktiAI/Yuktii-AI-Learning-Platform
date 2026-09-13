'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  Users,
  BarChart2,
  Globe,
  Layers,
  BookOpen,
  Mail,
  ClipboardCheck,
  Shield,
} from 'lucide-react';

const NAV = [
  { href: '/admin-portal/dashboard', label: 'Overview',    icon: LayoutDashboard },
  { href: '/admin-portal/analytics', label: 'Analytics',   icon: BarChart2 },
  { href: '/admin-portal/students',  label: 'Students',    icon: Users },
  { href: '/admin-portal/domains',   label: 'Domains',     icon: Globe },
  { href: '/admin-portal/tracks',    label: 'Tracks',      icon: Layers },
  { href: '/admin-portal/stages',    label: 'Stages',      icon: BookOpen },
  { href: '/admin-portal/email-logs',label: 'Email Logs',  icon: Mail },
  { href: '/admin-portal/reviews',   label: 'Reviews',     icon: ClipboardCheck },
  { href: '/admin-portal/error-logs',label: 'Error Logs',  icon: Shield },
];

export default function AdminNav({ userEmail }: { userEmail: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const navContent = (
    <div className="flex flex-col h-full bg-white">
      {/* Brand Header */}
      <div className="px-5 py-6 border-b border-line">
        <p className="text-[11px] tracking-widest text-ink/40 uppercase font-semibold">
          Yuktii AI Labs
        </p>
        <p className="text-base font-bold text-ink mt-0.5">Admin Portal</p>
        <p className="text-xs text-ink/50 mt-1 truncate" title={userEmail}>
          {userEmail}
        </p>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal/10 text-teal font-semibold'
                  : 'text-ink/65 hover:text-ink hover:bg-gray-50'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-teal' : 'text-ink/50'} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer Sign Out */}
      <div className="p-3 border-t border-line">
        <form action="/api/admin-portal/auth/logout" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-ink/50 hover:text-red-700 hover:bg-red-50 transition-colors text-sm font-medium w-full text-left"
          >
            <LogOut size={16} /> Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Navbar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-line sticky top-0 z-30">
        <div>
          <p className="text-[10px] tracking-widest text-ink/40 uppercase font-semibold">
            Yuktii AI Labs
          </p>
          <p className="text-sm font-bold text-ink leading-tight">Admin Portal</p>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-ink/70 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile Drawer Backdrop + Content */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-ink/40 hover:text-ink p-1.5"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex fixed top-0 bottom-0 left-0 w-60 z-20 border-r border-line shadow-sm">
        {navContent}
      </aside>
    </>
  );
}
