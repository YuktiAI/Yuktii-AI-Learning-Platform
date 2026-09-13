import { redirect } from 'next/navigation';

// /signup redirects to the unified /login page in signup mode
export default function SignupPage({ searchParams }: { searchParams: Record<string, string> }) {
  const qs = new URLSearchParams({ mode: 'signup', ...searchParams }).toString();
  redirect(`/login?${qs}`);
}
